import type { Metadata } from 'next'

import { DashboardEmptyState } from '@/components/dashboard/DashboardEmptyState'
import { HoldingsDonut } from '@/components/dashboard/HoldingsDonut'
import { RecentOrders } from '@/components/dashboard/RecentOrders'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import type { HoldingRow, PortfolioSummary, RecentOrder } from '@/lib/portfolio/types'
import { createClient } from '@/lib/supabase/server'
import { throwOnReadError } from '@/lib/read-errors'

export const metadata: Metadata = {
  title: 'Dashboard — ZerodhaRebuild',
}

/**
 * The portfolio read.
 *
 * **Every figure on this page is computed by Postgres.** `portfolio_summary` and
 * `portfolio_holdings` do the arithmetic, per `CLAUDE.md`'s money rule; this
 * component selects and narrows, and does not add two numbers together. The one
 * recomputation in the tree — `SummaryCards` restating the tiles against live
 * anchors — is display-only and reaches nothing.
 *
 * The session is not re-checked here. `(terminal)/layout.tsx` does it once per
 * navigation, and every query below returns nothing without one anyway.
 *
 * **Nothing writes `holdings` or `orders` until Phase 4**, so every real account
 * lands on the empty state today. The populated path is proven by
 * `supabase/tests/06-portfolio.sql` against planted rows.
 */

const RECENT_ORDER_LIMIT = 10

export default async function DashboardPage() {
  const supabase = await createClient()

  const [
    { data: summaryRow, error: summaryError },
    { data: holdingRows, error: holdingsError },
    { data: orderRows, error: ordersError },
  ] = await Promise.all([
    supabase
      .from('portfolio_summary')
      .select(
        'available_cash, invested, market_value, portfolio_value, overall_pnl, day_pnl, holding_count, unpriced_count'
      )
      .maybeSingle(),
    supabase
      .from('portfolio_holdings')
      .select(
        'symbol, name, exchange, quantity, average_price, invested, ltp, prev_close, market_value, unrealised_pnl, day_pnl, provider, provider_ts, fetched_at'
      )
      .order('symbol'),
    supabase
      .from('orders')
      .select(
        'id, symbol, side, product, quantity, filled_quantity, average_price, status, placed_at'
      )
      .order('placed_at', { ascending: false })
      .limit(RECENT_ORDER_LIMIT),
  ])

  // Logged and thrown, so `error.tsx` catches it. An empty portfolio and a
  // failed query used to render identically — below this line, the empty state
  // means the account is empty. (F36)
  throwOnReadError('dashboard', {
    portfolio_summary: summaryError,
    portfolio_holdings: holdingsError,
    orders: ordersError,
  })

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

  const orders: RecentOrder[] = (orderRows ?? []).map((row) => ({
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    product: row.product,
    quantity: row.quantity,
    filledQuantity: row.filled_quantity,
    averagePrice: row.average_price === null ? null : Number(row.average_price),
    status: row.status,
    placedAt: row.placed_at,
  }))

  // Never traded: no holdings *and* no orders. An account that traded and closed
  // out has a history, and the empty state would deny it.
  const hasNeverTraded = holdings.length === 0 && orders.length === 0

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
      <h1 className="text-title font-semibold text-ink">Dashboard</h1>

      {hasNeverTraded ? (
        <DashboardEmptyState availableCash={summary.availableCash} />
      ) : (
        <>
          <SummaryCards summary={summary} holdings={holdings} />

          <section
            aria-labelledby="holdings-donut-heading"
            className="rounded-md border border-hairline bg-surface p-4"
          >
            <h2 id="holdings-donut-heading" className="text-title-sm font-semibold text-ink">
              Holdings by value
            </h2>
            <p className="mt-1 text-caption text-muted">
              Your ten largest positions. Anything beyond them is grouped as Others.
            </p>
            <div className="mt-4">
              <HoldingsDonut holdings={holdings} />
            </div>
          </section>

          <section
            aria-labelledby="recent-orders-heading"
            className="rounded-md border border-hairline bg-surface p-4"
          >
            <h2 id="recent-orders-heading" className="text-title-sm font-semibold text-ink">
              Recent orders
            </h2>
            <div className="mt-4">
              <RecentOrders orders={orders} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
