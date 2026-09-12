import type { Metadata } from 'next'

import { OrderChannel } from '@/components/terminal/OrderChannel'
import { PositionsEmptyState } from '@/components/terminal/PositionsEmptyState'
import { PositionsTable } from '@/components/terminal/PositionsTable'
import { SquareOffBanner } from '@/components/terminal/SquareOffBanner'
import { loadHolidays } from '@/lib/market/market-hours'
import type { PositionRow, PositionsSummary } from '@/lib/portfolio/types'
import { createClient } from '@/lib/supabase/server'
import { throwOnReadError } from '@/lib/read-errors'

export const metadata: Metadata = {
  title: 'Positions — ZerodhaRebuild',
}

/**
 * The intraday book.
 *
 * **Every figure on this page is computed by Postgres.** `portfolio_positions`
 * and `portfolio_positions_summary` do the arithmetic, per `CLAUDE.md`'s money
 * rule; this component selects and narrows and does not add two numbers
 * together. The one recomputation in the tree is `PositionsTable` restating rows
 * and totals against live anchors, which is display-only and reaches nothing.
 *
 * **No quote subscription of its own.** `(terminal)/layout.tsx` already unions
 * held symbols into `QuoteChannel`. `OrderChannel` is a different need: a fill
 * changes which rows exist — a full exit deletes the row (§8) — and positions
 * are server state that never enters Zustand, so the answer is to re-render
 * rather than patch anything on the client.
 *
 * The session is not re-checked here; the terminal layout does it once per
 * navigation. `getUser()` supplies the id the Realtime channel filters on, which
 * is a different need from an authorisation check.
 */
export default async function PositionsPage() {
  const supabase = await createClient()

  const [
    {
      data: { user },
    },
    { data: positionRows, error: positionsError },
    { data: summaryRow, error: summaryError },
    holidays,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('portfolio_positions')
      .select(
        'symbol, name, exchange, net_quantity, average_price, realised_pnl, blocked_margin, ltp, unrealised_pnl, provider, provider_ts, fetched_at'
      )
      .order('symbol'),
    supabase
      .from('portfolio_positions_summary')
      .select('unrealised_pnl, realised_pnl, blocked_margin, position_count, unpriced_count')
      .maybeSingle(),
    loadHolidays(supabase),
  ])

  // Logged and thrown, so `error.tsx` catches it. An empty book and a failed
  // query used to render identically — below this line, an empty state means
  // the book is empty. (F36)
  throwOnReadError('positions', {
    portfolio_positions: positionsError,
    portfolio_positions_summary: summaryError,
  })

  // Each nullable figure is narrowed rather than coerced: a position with no
  // quote row has no valuation at all, and `Number(null)` is 0 — which would
  // silently value it at nothing.
  const positions: PositionRow[] = (positionRows ?? []).map((row) => ({
    symbol: row.symbol ?? '',
    name: row.name ?? '',
    exchange: row.exchange ?? 'NSE',
    netQuantity: Number(row.net_quantity ?? 0),
    averagePrice: Number(row.average_price ?? 0),
    realisedPnl: Number(row.realised_pnl ?? 0),
    blockedMargin: Number(row.blocked_margin ?? 0),
    ltp: row.ltp === null ? null : Number(row.ltp),
    unrealisedPnl: row.unrealised_pnl === null ? null : Number(row.unrealised_pnl),
    provider: row.provider,
    providerTs: row.provider_ts,
    fetchedAt: row.fetched_at,
  }))

  const summary: PositionsSummary = {
    unrealisedPnl: Number(summaryRow?.unrealised_pnl ?? 0),
    realisedPnl: Number(summaryRow?.realised_pnl ?? 0),
    blockedMargin: Number(summaryRow?.blocked_margin ?? 0),
    positionCount: Number(summaryRow?.position_count ?? 0),
    unpricedCount: Number(summaryRow?.unpriced_count ?? 0),
  }

  // The render instant, handed to the banner so its first client render matches
  // this HTML exactly — the same trick `MarketStatusPill` uses to avoid both a
  // hydration mismatch and a loading flash.
  const serverNow = new Date().toISOString()

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
      <h1 className="text-title text-ink">Positions</h1>
      <p className="mt-1 text-body-sm text-muted">
        Intraday MIS positions, squared off automatically at 3:20pm. Delivery holdings appear under
        Holdings.
      </p>

      {/* Renders nothing. Re-renders this page when a fill changes the rows. */}
      {user ? <OrderChannel userId={user.id} /> : null}

      <SquareOffBanner
        holidays={[...holidays]}
        serverNow={serverNow}
        positionCount={positions.length}
      />

      <div className="mt-6">
        {positions.length === 0 ? (
          <PositionsEmptyState />
        ) : (
          <PositionsTable positions={positions} summary={summary} />
        )}
      </div>
    </div>
  )
}
