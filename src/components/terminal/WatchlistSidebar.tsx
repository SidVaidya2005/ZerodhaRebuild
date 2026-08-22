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
import { dayChange } from '@/lib/market/change'
import { provenanceOf, serverProvenance } from '@/lib/market/screen-provenance'
import { openTicket } from '@/lib/stores/order-ticket-store'
import { useQuoteStore } from '@/lib/stores/quote-store'
import { cn } from '@/lib/utils'

import { PriceWithProvenance } from './PriceWithProvenance'
import { useNow } from './TerminalClock'
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

type RowProps = {
  row: WatchlistRow
  isFirst: boolean
  isLast: boolean
  pending: boolean
  run: (action: () => Promise<{ ok: boolean; error?: { message: string } }>) => void
}

/**
 * One watchlist row, and its own subscription to its own symbol.
 *
 * Extracted from the panel precisely so the selector is per-symbol: a row
 * re-renders when *its* price moves and not when any other does. Selecting from
 * inside the panel would re-render all ten rows on every tick, which is the
 * re-render storm `library-docs.md` warns about.
 *
 * **`live ?? prop` is what avoids a hydration mismatch.** The store is empty
 * during SSR and on the first client render — it is seeded in an effect — so
 * both renders use the server's figures and the HTML matches exactly. This is
 * the same lesson the F17 market-status pill taught with `serverNow`.
 */
function WatchlistRowItem({ row, isFirst, isLast, pending, run }: RowProps) {
  const live = useQuoteStore((state) => state.quotes[row.symbol])
  const now = useNow()

  // The price on screen may be mid-tween and therefore synthetic. That is
  // allowed here and nowhere that drives a decision: `architecture.md` lists
  // the watchlist as an ambient surface, and every order and total reads the
  // anchor instead.
  const ltp = live?.ltp ?? row.ltp

  // Recomputed rather than taken from the server row, so a ticking price never
  // sits beside a change frozen at render time. Display only — the SQL view
  // still owns the authoritative figure.
  const computed = live ? dayChange(live.ltp, live.prevClose) : null
  const change = computed?.change ?? row.change
  const changePct = computed?.changePct ?? row.changePct

  return (
    <li className="group/row relative flex items-center gap-2 border-b border-hairline px-4 py-2 hover:bg-surface-elevated">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-body-sm font-medium text-ink">{row.symbol}</span>
          <span className="text-caption text-muted">{row.exchange}</span>
        </div>
        <span className={cn('block truncate text-caption', changeTone(change))}>
          {formatChange(change, changePct)}
        </span>
      </div>

      {/* Remounted whenever `flashKey` changes, which restarts the CSS
          animation. `flashKey` only advances when an anchor genuinely moved, so
          a tick that rewrites the same price does not flash. */}
      <span
        key={live?.flashKey ?? 0}
        className={cn(
          'shrink-0 rounded-xs px-1 font-numeric text-number-sm',
          live?.direction === 'up' && 'tick-flash-up',
          live?.direction === 'down' && 'tick-flash-down'
        )}
      >
        {/* The server row is the fallback for provenance as well as for the
            price. Passing `null` here rendered every row as an em dash until
            the store seeded — including in the SSR HTML, beside a change
            column showing the server's figure. */}
        <PriceWithProvenance
          value={ltp}
          anchor={live?.anchor ?? null}
          provenance={live ? provenanceOf(live, now) : serverProvenance(row, now)}
        />
      </span>

      {/* Absolutely positioned, not a flex sibling. `opacity-0` hides these but
          does not remove them from layout, so as a sibling the four buttons
          permanently ate ~112px of a 256px row — enough to truncate the symbol
          and wrap the change onto two lines while nothing was even hovered.
          Overlaying frees that width back.

          Revealed on hover but never hidden from the keyboard: `focus-within`
          keeps them reachable by tabbing, which a plain `hidden
          group-hover:flex` would not. */}
      <div className="absolute inset-y-0 right-2 flex items-center gap-0 rounded-sm bg-surface-elevated opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={isFirst || pending}
          aria-label={`Move ${row.symbol} up`}
          onClick={() => run(() => reorderWatchlist({ symbol: row.symbol, direction: 'up' }))}
        >
          <ChevronUp aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={isLast || pending}
          aria-label={`Move ${row.symbol} down`}
          onClick={() => run(() => reorderWatchlist({ symbol: row.symbol, direction: 'down' }))}
        >
          <ChevronDown aria-hidden="true" />
        </Button>
        {/* Buy and sell open the one ticket mounted in the terminal layout,
            rather than a dialog per row. This panel is mounted TWICE — the `md`
            rail and the mobile sheet, both always in the tree — so a per-row
            dialog would put two copies of the same form on the page for one
            symbol. `openTicket` is a plain call rather than a hook, so a row
            that only opens the ticket does not re-render when it opens on some
            other symbol. */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="font-medium text-up"
          aria-label={`Buy ${row.symbol}`}
          onClick={() => openTicket({ symbol: row.symbol, side: 'BUY' })}
        >
          B
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="font-medium text-down"
          aria-label={`Sell ${row.symbol}`}
          onClick={() => openTicket({ symbol: row.symbol, side: 'SELL' })}
        >
          S
        </Button>
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
  )
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
            <WatchlistRowItem
              key={row.symbol}
              row={row}
              isFirst={index === 0}
              isLast={index === rows.length - 1}
              pending={pending}
              run={run}
            />
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
