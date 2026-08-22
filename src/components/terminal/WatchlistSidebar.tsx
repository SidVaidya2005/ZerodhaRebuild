'use client'

import { ChevronDown, ChevronUp, LineChart, Menu, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { searchUniverse } from '@/lib/watchlist/search'
import type { UniverseEntry, WatchlistRow } from '@/lib/watchlist/schemas'
import { addToWatchlist, removeFromWatchlist, reorderWatchlist } from '@/server/actions/watchlist'

/**
 * The watchlist. **F19 makes these prices move**; here they are whatever the
 * server rendered and they hold still until the next navigation.
 *
 * The panel is one component so the two breakpoints cannot diverge: the same
 * `<WatchlistPanel/>` renders inside a fixed rail at `md` and up, and inside a
 * `Sheet` below it — `DESIGN.md` → Collapsing Strategy specifies a full-screen
 * sheet under 768px.
 *
 * **The two shells are exported separately because they live in different parts
 * of the page.** The rail is a column beside `<main>`; the sheet's trigger is a
 * button in the nav bar. Exporting one component that rendered both put the
 * 288px rail inside the header's 64px flex row, where it was clipped to the
 * nav's height and pushed everything after it sideways.
 */

type PanelProps = {
  rows: WatchlistRow[]
  universe: UniverseEntry[]
}

/** `—` rather than `0.00`. A zero is a price; absence is not. */
const DASH = '—'

const priceFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatPrice(value: number | null): string {
  return value === null ? DASH : priceFormatter.format(value)
}

/** Signed, because a change without its sign is unreadable at a glance. */
function formatChange(change: number | null, changePct: number | null): string {
  if (change === null || changePct === null) return DASH
  const sign = change > 0 ? '+' : ''
  return `${sign}${priceFormatter.format(change)} (${sign}${changePct.toFixed(2)}%)`
}

function changeTone(change: number | null): string {
  if (change === null || change === 0) return 'text-muted'
  return change > 0 ? 'text-up' : 'text-down'
}

/**
 * Tell the tick which symbols are on screen.
 *
 * One of exactly two Server Action exceptions `code-standards.md` allows: it
 * takes no user-supplied state beyond a symbol list, derives the caller from
 * `auth.uid()`, and writes `last_requested_at` only. A Server Action round trip
 * for a write that touches nothing the user owns would be waste.
 *
 * Keyed on the joined symbol list rather than the array, so it fires when the
 * watchlist actually changes and not on every render — "once per subscription
 * change, not per tick", which is the contract the standard names.
 */
function useSymbolDemand(symbols: string[]): void {
  const key = symbols.join(',')

  useEffect(() => {
    if (key === '') return
    const supabase = createClient()
    void supabase.rpc('touch_symbol_demand', { p_symbols: key.split(',') }).then(({ error }) => {
      // Nothing on screen depends on this succeeding — it only affects what the
      // tick refreshes next minute — so it is logged and never surfaced.
      if (error) console.error('[watchlist.touchSymbolDemand]', error)
    })
  }, [key])
}

function WatchlistPanel({ rows, universe }: PanelProps) {
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState('')

  useSymbolDemand(rows.map((row) => row.symbol))

  // Already-watched symbols are removed from the palette rather than shown and
  // rejected: the add would come back as a silent no-op, which reads as a bug.
  const watched = useMemo(() => new Set(rows.map((row) => row.symbol)), [rows])
  // `shouldFilter` is off on the Command below, so this is the whole ranking.
  // cmdk's own fuzzy filter answered "rel" with most of the universe — every
  // name whose letters merely contain r, e and l in order.
  const candidates = useMemo(
    () =>
      searchUniverse(
        universe.filter((entry) => !watched.has(entry.symbol)),
        query
      ),
    [universe, watched, query]
  )

  const run = (action: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    startTransition(async () => {
      const result = await action()
      if (!result.ok && result.error) toast.error(result.error.message)
    })
  }

  return (
    <div className="flex h-full flex-col">
      <p className="px-4 py-3 text-caption font-medium tracking-wide text-muted">Watchlist</p>

      {/* cmdk filters the preloaded universe in memory. 200 rows of symbol and
          name is a single packet, and Postgres would seq-scan a table this small
          whatever index sat on it — so a query per keystroke would add a network
          hop and buy nothing. */}
      {/* `h-auto shrink-0` is load-bearing. shadcn's Command base is
          `flex h-full w-full flex-col`, and inside this flex column that `h-full`
          claimed the entire panel, squashing the list below it to height 0 — the
          rows were in the DOM, correct and invisible. A plain utility, so
          tailwind-merge does override it here. */}
      <Command className="h-auto shrink-0 bg-transparent" shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search and add"
          aria-label="Search instruments to add to your watchlist"
        />
        {query !== '' && (
          <CommandList className="max-h-56">
            <CommandEmpty>No instrument matches that.</CommandEmpty>
            <CommandGroup>
              {candidates.map((entry) => (
                <CommandItem
                  key={entry.symbol}
                  value={`${entry.symbol} ${entry.name}`}
                  onSelect={() => {
                    setQuery('')
                    run(() => addToWatchlist({ symbol: entry.symbol }))
                  }}
                >
                  <Plus aria-hidden="true" className="size-3.5 text-muted" />
                  <span className="font-medium text-ink">{entry.symbol}</span>
                  <span className="truncate text-muted">{entry.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        )}
      </Command>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-body-sm text-muted">
          Your watchlist is empty. Search above to add an instrument.
        </p>
      ) : (
        <ul className={cn('flex-1 overflow-y-auto', pending && 'opacity-60')}>
          {rows.map((row, index) => (
            <li
              key={row.symbol}
              className="group/row relative flex items-center gap-2 border-b border-hairline px-4 py-2 hover:bg-surface-elevated"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-body-sm font-medium text-ink">{row.symbol}</span>
                  <span className="text-caption text-muted">{row.exchange}</span>
                </div>
                <span className={cn('block truncate text-caption', changeTone(row.change))}>
                  {formatChange(row.change, row.changePct)}
                </span>
              </div>

              <span className="shrink-0 font-numeric text-number-sm text-ink tabular-nums">
                {formatPrice(row.ltp)}
              </span>

              {/* Absolutely positioned, not a flex sibling. `opacity-0` hides
                  these but does not remove them from layout, so as a sibling the
                  four buttons permanently ate ~112px of a 256px row — enough to
                  truncate the symbol and wrap the change onto two lines while
                  nothing was even hovered. Overlaying frees that width back.

                  Revealed on hover but never hidden from the keyboard:
                  `focus-within` keeps them reachable by tabbing, which a plain
                  `hidden group-hover:flex` would not. */}
              <div className="absolute inset-y-0 right-2 flex items-center gap-0 rounded-sm bg-surface-elevated opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0 || pending}
                  aria-label={`Move ${row.symbol} up`}
                  onClick={() =>
                    run(() => reorderWatchlist({ symbol: row.symbol, direction: 'up' }))
                  }
                >
                  <ChevronUp aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === rows.length - 1 || pending}
                  aria-label={`Move ${row.symbol} down`}
                  onClick={() =>
                    run(() => reorderWatchlist({ symbol: row.symbol, direction: 'down' }))
                  }
                >
                  <ChevronDown aria-hidden="true" />
                </Button>
                {/* Buy and sell are deliberately absent until F25 gives them a
                    destination. The chart link resolves because F17 stubbed the
                    instrument page. */}
                <Button variant="ghost" size="icon-sm" asChild>
                  <Link href={`/stocks/${row.symbol}`} aria-label={`Open ${row.symbol}`}>
                    <LineChart aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  aria-label={`Remove ${row.symbol} from your watchlist`}
                  onClick={() => run(() => removeFromWatchlist({ symbol: row.symbol }))}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The desktop rail. Sticky beneath the 64px nav and the full height of what is
 * left, so a long watchlist scrolls inside the rail rather than taking the page
 * with it.
 */
export function WatchlistRail({ rows, universe }: PanelProps) {
  return (
    <aside
      aria-label="Watchlist"
      className="hidden w-72 shrink-0 border-r border-hairline bg-surface md:sticky md:top-16 md:block md:h-[calc(100vh-4rem)] md:overflow-y-auto"
    >
      <WatchlistPanel rows={rows} universe={universe} />
    </aside>
  )
}

/** The mobile shell: a nav-bar trigger and the sheet it opens. */
export function WatchlistSheet({ rows, universe }: PanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open watchlist">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      {/* Full-bleed: DESIGN.md → Collapsing Strategy calls for a full-screen
          sheet under 768px, and the default left a strip of dimmed page beside
          it. The overrides must repeat `data-[side=left]:`, because the base
          class is `data-[side=left]:w-3/4` — tailwind-merge groups by variant,
          so a bare `w-full` lands in a different group and loses silently.
          The trigger is `md:hidden`, so this sheet only ever renders below the
          breakpoint and needs no width above it. */}
      <SheetContent
        side="left"
        className="p-0 data-[side=left]:w-full data-[side=left]:sm:max-w-none"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Watchlist</SheetTitle>
        </SheetHeader>
        <WatchlistPanel rows={rows} universe={universe} />
      </SheetContent>
    </Sheet>
  )
}
