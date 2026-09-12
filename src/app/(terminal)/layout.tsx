import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { TopNav } from '@/components/terminal/TopNav'
import { OrderTicket } from '@/components/terminal/OrderTicket'
import { QuoteChannel } from '@/components/terminal/QuoteChannel'
import { TerminalClock } from '@/components/terminal/TerminalClock'
import { ThemeSync } from '@/components/terminal/ThemeSync'
import { WatchlistDemand, WatchlistRail } from '@/components/terminal/WatchlistSidebar'
import { Toaster } from '@/components/ui/sonner'
import { LOGIN_PATH } from '@/lib/auth/routes'
import { loadHolidays } from '@/lib/market/market-hours'
import { isTheme, type Theme } from '@/lib/profile/theme'
import { createClient } from '@/lib/supabase/server'
import { placeOrder } from '@/server/actions/orders'
import type { MarketComposite } from '@/lib/portfolio/types'
import type { ServerQuote } from '@/lib/stores/quote-store'
import type { UniverseEntry, WatchlistRow } from '@/lib/watchlist/schemas'
import { throwOnReadError } from '@/lib/read-errors'

/**
 * Both the watchlist view and the holdings view carry the same five provenance
 * and price columns, under the two naming conventions the codebase uses either
 * side of PostgREST. One narrowing, so the channel cannot be seeded with a
 * price from one source shaped differently from the other.
 */
function toServerQuote(row: {
  symbol: string | null
  ltp?: number | null
  prevClose?: number | null
  prev_close?: number | null
  provider: ServerQuote['provider']
  providerTs?: string | null
  provider_ts?: string | null
  fetchedAt?: string | null
  fetched_at?: string | null
}): ServerQuote {
  return {
    symbol: row.symbol ?? '',
    ltp: row.ltp ?? null,
    prevClose: row.prevClose ?? row.prev_close ?? null,
    provider: row.provider,
    providerTs: row.providerTs ?? row.provider_ts ?? null,
    fetchedAt: row.fetchedAt ?? row.fetched_at ?? null,
  }
}

/**
 * The chrome every terminal page sits inside, and the one place the session is
 * checked.
 *
 * **Pages beneath this do not re-check.** `dashboard/page.tsx` used to, on the
 * argument that `src/proxy.ts` is a convenience rather than a boundary — true,
 * and it buys nothing once a layout exists: every page here reads through
 * RLS-scoped queries that return nothing without a session, so a second
 * `getUser()` is a round trip that cannot change an outcome. One check per
 * navigation, and no future page can forget to make it.
 *
 * The calendar is loaded here rather than in the pill, because the pill is a
 * Client Component and must not hold a database client. It is twenty rows behind
 * an indexed primary key.
 */
export default async function TerminalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(LOGIN_PATH)

  const [
    { data: profile },
    { data: funds },
    holidays,
    { data: watchlist, error: watchlistError },
    { data: universe, error: universeError },
    { data: held, error: heldError },
    { data: composite, error: compositeError },
  ] = await Promise.all([
    supabase.from('profiles').select('client_id, full_name, theme').single(),
    supabase.from('funds').select('available_cash').single(),
    loadHolidays(supabase),
    // One round trip for the panel, with the change already computed. The view
    // holds no predicate of its own — RLS on watchlist_items scopes it through
    // security_invoker, which is what the pgTAP suite falsifies.
    supabase
      .from('watchlist_rows')
      .select(
        'symbol, name, exchange, sort_order, ltp, prev_close, change, change_pct, provider, provider_ts, fetched_at'
      )
      .order('sort_order'),
    // The whole tradable universe, ~200 rows, for the search palette. Loaded
    // here rather than queried per keystroke: Postgres seq-scans a table this
    // small whatever index sits on it, so a round trip would buy nothing and
    // cost a network hop on every character.
    supabase
      .from('instruments')
      .select('symbol, name, exchange')
      .eq('is_active', true)
      .order('symbol'),
    // Held symbols, so a holding that is not on the watchlist still ticks. The
    // Realtime channel is filtered server-side to the symbols it is given, so
    // without this union the dashboard's portfolio value would sit frozen while
    // the sidebar beside it moved — and F30 and F31 would each hit it again.
    // A narrow projection of the same view the dashboard reads in full.
    supabase
      .from('portfolio_holdings')
      .select('symbol, ltp, prev_close, provider, provider_ts, fetched_at'),
    // The index strip. One row, aggregated in Postgres over every priced active
    // instrument — see the view's own comment for why this is a breadth
    // statistic and not an index.
    supabase
      .from('market_composite')
      .select(
        'constituents, universe_size, change_pct, advances, declines, unchanged, providers, oldest_provider_ts, oldest_fetched_at'
      )
      .maybeSingle(),
  ])

  // Narrowed rather than asserted: the column is `text` with a CHECK behind it,
  // so Postgres guarantees the value but the generated type does not. Falling
  // back to the column's own default keeps a failed read from flipping the
  // terminal to light.
  const storedTheme: Theme = isTheme(profile?.theme) ? profile.theme : 'dark'

  // Prefer the profile the bootstrap wrote, then Google's claim, then the email.
  // The shell must always be able to say who is acting.
  const name =
    profile?.full_name ??
    (user.user_metadata.full_name as string | undefined) ??
    user.email ??
    'Account'

  // A failed read here renders an empty watchlist, indistinguishable from a
  // genuinely empty one, so it is logged and thrown like every page read. (F36)
  //
  // **This one surfaces at the *root* boundary, not a terminal-shaped one.** A
  // layout's own `error.tsx` catches its children, never itself, so the nearest
  // boundary above this throw is `src/app/error.tsx` and the user sees a
  // chrome-less error page. That is the intended reading: the sidebar, the
  // search universe and the index strip are the shell, and a shell that cannot
  // load is not a working terminal to put chrome around.
  throwOnReadError('terminal.layout', {
    watchlist_rows: watchlistError,
    instruments: universeError,
    portfolio_holdings: heldError,
    market_composite: compositeError,
  })

  // Numbers cross PostgREST as JSON numbers, but every one of these is nullable
  // — a symbol with no quote row yet has no price at all — so each is narrowed
  // rather than coerced. No arithmetic happens here: the change and its
  // percentage arrive already computed, per CLAUDE.md's money rule.
  const rows: WatchlistRow[] = (watchlist ?? []).map((row) => ({
    symbol: row.symbol ?? '',
    name: row.name ?? '',
    exchange: row.exchange ?? 'NSE',
    sortOrder: row.sort_order ?? 0,
    ltp: row.ltp === null ? null : Number(row.ltp),
    change: row.change === null ? null : Number(row.change),
    changePct: row.change_pct === null ? null : Number(row.change_pct),
    prevClose: row.prev_close === null ? null : Number(row.prev_close),
    provider: row.provider,
    providerTs: row.provider_ts,
    fetchedAt: row.fetched_at,
  }))

  const instruments: UniverseEntry[] = (universe ?? []).map((row) => ({
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
  }))

  // Every symbol the terminal needs live: what is on the watchlist, plus what
  // the user actually owns. Deduplicated by symbol, watchlist first — the two
  // sets overlap for most users, and a repeated symbol in the channel filter
  // would subscribe twice to the same row.
  const livePrices: ServerQuote[] = [...rows.map(toServerQuote), ...(held ?? []).map(toServerQuote)]
    .filter((row, index, all) => all.findIndex((other) => other.symbol === row.symbol) === index)
    .filter((row) => row.symbol !== '')

  // Null rather than a zeroed object when the read fails: the strip renders an
  // em dash for the absence of a figure, and a fabricated 0.00% would be a claim
  // that the market is flat.
  const marketComposite: MarketComposite | null = composite
    ? {
        constituents: Number(composite.constituents ?? 0),
        universeSize: Number(composite.universe_size ?? 0),
        changePct: composite.change_pct === null ? null : Number(composite.change_pct),
        advances: Number(composite.advances ?? 0),
        declines: Number(composite.declines ?? 0),
        unchanged: Number(composite.unchanged ?? 0),
        providers: composite.providers ?? [],
        oldestProviderTs: composite.oldest_provider_ts,
        oldestFetchedAt: composite.oldest_fetched_at,
      }
    : null

  // One instant for the whole render, shared by the market-status pill and the
  // provenance clock, so the two cannot disagree about when "now" was.
  const serverNow = new Date().toISOString()

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Provides the one `now` every provenance surface reads. Wraps the nav as
          well as the content, because the badge lives in the nav and the prices
          it summarises live below it — they must read the same instant. */}
      <TerminalClock serverNow={serverNow}>
        {/* Applies the account's stored theme, so the choice follows the user
            rather than the browser. Renders nothing. Mounted here rather than on
            `/settings` because it must run wherever the terminal is entered —
            and `profiles.theme` is already being read one query above. */}
        <ThemeSync stored={storedTheme} />

        <TopNav
          name={name}
          email={user.email ?? ''}
          clientId={profile?.client_id ?? null}
          availableCash={funds ? Number(funds.available_cash) : null}
          holidays={[...holidays]}
          serverNow={serverNow}
          watchlist={rows}
          universe={instruments}
          composite={marketComposite}
        />
        {/* One channel and one animation loop for the whole terminal, mounted
          here so they survive navigation between pages rather than being torn
          down and rebuilt by each one. Renders nothing. */}
        <QuoteChannel symbols={livePrices.map((row) => row.symbol)} seed={livePrices} />

        {/* Tells the tick which symbols are on screen. Mounted here rather than
            inside the watchlist panel, which the rail and the sheet each render
            — so while the sheet was open the RPC fired twice for the same
            symbols. Renders nothing. (F37) */}
        <WatchlistDemand symbols={rows.map((row) => row.symbol)} />

        {/* One ticket for the whole terminal, opened from anywhere through
            `openTicket`. Mounted beside the channel for the same reason: the
            watchlist panel exists twice at once, so a dialog owned by a call
            site would exist twice too. A Server Action crosses to a Client
            Component as a prop, so F26's seam closes with no wrapper. */}
        <OrderTicket
          availableCash={funds ? Number(funds.available_cash) : null}
          onSubmit={placeOrder}
        />

        {/* Terminal-only, not the root layout: the marketing side reports
            outcomes inline through `useActionState`, so mounting it here keeps
            `sonner` out of the public bundle. */}
        <Toaster position="bottom-right" />

        <div className="flex flex-1">
          <WatchlistRail rows={rows} universe={instruments} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </TerminalClock>
    </div>
  )
}
