'use client'

import { ChevronDown, ChevronUp, LineChart, Menu, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'
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
import { TERMINAL_NAV_LINKS } from './nav-links'
import { useNow } from './TerminalClock'
import { searchUniverse } from '@/lib/watchlist/search'
import type { UniverseEntry, WatchlistRow } from '@/lib/watchlist/schemas'
import { addToWatchlist, removeFromWatchlist, reorderWatchlist } from '@/server/actions/watchlist'

/**
 * The watchlist. **F19 makes these prices move**; here they are whatever the
 * server rendered and they hold still until the next navigation.
 *
 * The panel is one component so the two breakpoints cannot diverge: the same
 * `<WatchlistPanel/>` renders inside a fixed rail at `lg` and up, and inside a
 * `Sheet` below it — `DESIGN.md` → Collapsing Strategy specifies a full-screen
 * sheet under 768px.
 *
 * **The sheet is the terminal's menu below `lg`, not only its watchlist (F37).**
 * The header nav is `lg:flex` and the wordmark is hidden below `sm`, so before
 * F37 not one of the six destinations was reachable under 1024px without typing
 * a URL. Lowering the nav's own breakpoint was ruled out by measurement rather
 * than taste: at 768px the header bar has ~106px spare and the nav needs 404px.
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

/**
 * The demand ping, mounted once by the terminal layout. Renders nothing.
 *
 * **Hoisted out of `WatchlistPanel` in F37.** The panel is mounted by both the
 * rail and the sheet, so while the sheet was open the RPC fired twice for the
 * same symbols — harmless, because it is idempotent, but it is a round trip
 * bought for nothing and the constraint filed against F18 asked for this the
 * next time F37 touched the file. One owner, so no future shell can add a
 * third.
 */
export function WatchlistDemand({ symbols }: { symbols: string[] }) {
  useSymbolDemand(symbols)
  return null
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

function WatchlistPanel({
  rows,
  universe,
  searchRef,
}: PanelProps & { searchRef?: React.Ref<HTMLInputElement> }) {
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState('')

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

  // `min-h-0 flex-1` rather than `h-full`: inside the sheet this panel now has a
  // sibling above it, and `h-full` would resolve against the whole sheet and
  // push the rows off the bottom — the same failure the `Command` note below
  // records. `flex-1` claims what is left instead, and `min-h-0` lets it shrink
  // so the list's own `overflow-y-auto` is what scrolls. (F37)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between px-4 py-3">
        <p className="text-caption font-medium tracking-wide text-muted">Watchlist</p>
        {/* Only rendered in the rail, which is the only shell the shortcut
            reaches. `aria-hidden` because the input's own `aria-label` already
            names it — this is a sighted-user affordance, not a second label. */}
        {searchRef ? <SearchShortcutHint /> : null}
      </div>

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
          ref={searchRef}
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
 *
 * **`lg` rather than `md` since F37.** At 768px this column took 288px of 768 —
 * 37% of the viewport — and what was left was the width every table then had to
 * scroll inside. Below `lg` the watchlist lives in the sheet instead, which also
 * makes that sheet's body identical at every width it appears at.
 *
 * A flex column, not a block: `WatchlistPanel` claims its height with `flex-1`
 * so it can do so in both shells.
 */
export function WatchlistRail({ rows, universe }: PanelProps) {
  const searchRef = useRef<HTMLInputElement>(null)

  // Cmd/Ctrl+K focuses search, the cmdk convention.
  //
  // **Scoped to the rail on purpose.** The rail is `hidden ... lg:flex`, so
  // `offsetParent` is null below `lg` and the shortcut becomes a no-op there
  // rather than focusing an input nobody can see. Below `lg` the search input
  // lives in the sheet, and opening a Radix dialog from a keydown would need
  // the F25 focus-capture dance — the store has to remember
  // `document.activeElement` itself, because Radix returns focus to a
  // `DialogTrigger` that a programmatically-opened dialog does not have. That
  // is a real mechanism to add for a convenience, and it buys nothing a keyboard
  // user lacks: the sheet trigger is a focusable button already in the tab order.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return
      const input = searchRef.current
      if (!input || input.offsetParent === null) return
      event.preventDefault()
      input.focus()
      input.select()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <aside
      aria-label="Watchlist"
      className="hidden w-72 shrink-0 border-r border-hairline bg-surface lg:sticky lg:top-16 lg:flex lg:h-[calc(100vh-4rem)] lg:flex-col lg:overflow-y-auto"
    >
      <WatchlistPanel rows={rows} universe={universe} searchRef={searchRef} />
    </aside>
  )
}

const subscribeNever = () => () => {}
const getModifier = () => (navigator.userAgent.includes('Mac') ? '\u2318' : 'Ctrl ')
const getServerModifier = () => null

/**
 * The `⌘K` / `Ctrl K` chip beside the Watchlist heading.
 *
 * Rendered after mount rather than on the server: the right glyph depends on the
 * platform, and deciding it during SSR would either hardcode one or produce a
 * hydration mismatch. Nothing is announced — the input carries its own label —
 * so an absent chip on first paint costs a screen reader nothing.
 */
function SearchShortcutHint() {
  // `useSyncExternalStore` rather than state set from an effect: this is a
  // client-only value that must render as nothing on the server, which is
  // exactly the `getServerSnapshot` contract. The store never changes, so
  // `subscribe` is a no-op, and both snapshots return primitives so React sees a
  // stable value.
  const modifier = useSyncExternalStore(subscribeNever, getModifier, getServerModifier)

  if (modifier === null) return null

  return (
    <kbd
      aria-hidden="true"
      className="rounded border border-hairline px-1.5 py-0.5 font-numeric text-caption text-muted"
    >
      {modifier}K
    </kbd>
  )
}

/** The mobile shell: a nav-bar trigger and the sheet it opens. */
export function WatchlistSheet({ rows, universe }: PanelProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="xl:hidden" aria-label="Open menu">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      {/* Full-bleed below `md`: DESIGN.md → Collapsing Strategy calls for a
          full-screen sheet under 768px, and the default left a strip of dimmed
          page beside it. From `md` to `lg` it is a panel instead — since F37
          this sheet also appears on tablets, and a full-screen menu on a 1000px
          viewport is heavier than the navigation it carries.

          Every override repeats `data-[side=left]:`, because the base class is
          `data-[side=left]:w-3/4` — tailwind-merge groups by variant, so a bare
          `w-full` lands in a different group and loses silently. */}
      <SheetContent
        side="left"
        className="p-0 data-[side=left]:w-full data-[side=left]:sm:max-w-none data-[side=left]:md:max-w-sm"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        {/* The same array the desktop nav renders, so the two cannot drift and
            `terminal-routes.test.ts` already proves every href here has a page
            behind it. Closing on select is explicit: these are client
            navigations, and the sheet does not unmount itself. */}
        <nav aria-label="Terminal" className="shrink-0 border-b border-hairline">
          <ul>
            {TERMINAL_NAV_LINKS.map((link) => {
              const active = pathname === link.href
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'block px-4 py-3 text-body-sm transition-colors hover:bg-surface-elevated',
                      active ? 'font-medium text-ink' : 'text-muted-strong'
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <WatchlistPanel rows={rows} universe={universe} />
      </SheetContent>
    </Sheet>
  )
}
