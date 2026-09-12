import type { Metadata } from 'next'

import { HoldingsEmptyState } from '@/components/terminal/HoldingsEmptyState'
import { HoldingsTable } from '@/components/terminal/HoldingsTable'
import { OrderChannel } from '@/components/terminal/OrderChannel'
import type { HoldingRow, PortfolioSummary } from '@/lib/portfolio/types'
import { createClient } from '@/lib/supabase/server'
import { throwOnReadError } from '@/lib/read-errors'

export const metadata: Metadata = {
  title: 'Holdings — ZerodhaRebuild',
}

/**
 * The delivery portfolio.
 *
 * **Every figure on this page is computed by Postgres.** `portfolio_holdings`
 * and `portfolio_summary` — both added by F21 — do the arithmetic, per
 * `CLAUDE.md`'s money rule; this component selects and narrows, and does not add
 * two numbers together. The one recomputation in the tree is `HoldingsTable`
 * restating rows and totals against live anchors, which is display-only and
 * reaches nothing.
 *
 * **No quote subscription of its own.** `(terminal)/layout.tsx` already unions
 * held symbols into `QuoteChannel`, so a holding that is not on the watchlist
 * still ticks. `OrderChannel` below is a different need: a fill changes which
 * rows exist — a CNC sell of the whole quantity deletes the row outright (§8) —
 * and holdings are server state that never enters Zustand, so the answer is to
 * re-render the server component rather than patch anything on the client.
 *
 * The session is not re-checked here; the terminal layout does it once per
 * navigation. `getUser()` is called for the id the Realtime channel filters on,
 * which is a different need from an authorisation check.
 */
export default async function HoldingsPage() {
  const supabase = await createClient()

  const [
    {
      data: { user },
    },
    { data: holdingRows, error: holdingsError },
    { data: summaryRow, error: summaryError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('portfolio_holdings')
      .select(
        'symbol, name, exchange, quantity, average_price, invested, ltp, prev_close, market_value, unrealised_pnl, day_pnl, provider, provider_ts, fetched_at'
      )
      .order('symbol'),
    supabase
      .from('portfolio_summary')
      .select(
        'available_cash, invested, market_value, portfolio_value, overall_pnl, day_pnl, holding_count, unpriced_count'
      )
      .maybeSingle(),
  ])

  // Logged and thrown, so `error.tsx` catches it. An empty portfolio and a
  // failed query used to render identically, which is exactly how a broken read
  // hides behind a plausible empty state; below this line, an empty state means
  // the account is empty. (F36)
  throwOnReadError('holdings', {
    portfolio_holdings: holdingsError,
    portfolio_summary: summaryError,
  })

  // Each nullable figure is narrowed rather than coerced: a holding with no
  // quote row has no market value at all, and `Number(null)` is 0 — which would
  // silently value it at nothing.
  const holdings: HoldingRow[] = (holdingRows ?? []).map((row) => ({
    symbol: row.symbol ?? '',
    name: row.name ?? '',
    exchange: row.exchange ?? 'NSE',
    quantity: Number(row.quantity ?? 0),
    averagePrice: Number(row.average_price ?? 0),
    invested: Number(row.invested ?? 0),
    ltp: row.ltp === null ? null : Number(row.ltp),
    prevClose: row.prev_close === null ? null : Number(row.prev_close),
    marketValue: row.market_value === null ? null : Number(row.market_value),
    unrealisedPnl: row.unrealised_pnl === null ? null : Number(row.unrealised_pnl),
    dayPnl: row.day_pnl === null ? null : Number(row.day_pnl),
    provider: row.provider,
    providerTs: row.provider_ts,
    fetchedAt: row.fetched_at,
  }))

  const summary: PortfolioSummary = {
    availableCash: Number(summaryRow?.available_cash ?? 0),
    invested: Number(summaryRow?.invested ?? 0),
    marketValue: Number(summaryRow?.market_value ?? 0),
    portfolioValue: Number(summaryRow?.portfolio_value ?? 0),
    overallPnl: Number(summaryRow?.overall_pnl ?? 0),
    dayPnl: Number(summaryRow?.day_pnl ?? 0),
    holdingCount: Number(summaryRow?.holding_count ?? 0),
    unpricedCount: Number(summaryRow?.unpriced_count ?? 0),
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
      <h1 className="text-title text-ink">Holdings</h1>
      <p className="mt-1 text-body-sm text-muted">
        Delivery positions carried across days. Intraday trades appear under Positions.
      </p>

      {/* Renders nothing. Re-renders this page when a fill changes the rows. */}
      {user ? <OrderChannel userId={user.id} /> : null}

      <div className="mt-6">
        {holdings.length === 0 ? (
          <HoldingsEmptyState />
        ) : (
          <HoldingsTable holdings={holdings} summary={summary} />
        )}
      </div>
    </div>
  )
}
