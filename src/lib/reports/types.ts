import type { QuoteSource } from '@shared/provenance.ts'

/**
 * What the Reports page reads, as the page shapes it.
 *
 * Every money figure arrives already computed by Postgres — `reports_summary`
 * does the filtered sums and `portfolio_summary` the unrealised one, per
 * `CLAUDE.md`'s money rule. This module names shapes; it performs no arithmetic.
 */

/** One row of `trade_history`. */
export type TradeRow = {
  id: string
  tradedAt: string
  /** The IST calendar day, computed in SQL. Never derived from `tradedAt` here. */
  tradedOn: string
  symbol: string
  name: string
  side: 'BUY' | 'SELL'
  product: 'CNC' | 'MIS'
  orderType: 'MARKET' | 'LIMIT'
  quantity: number
  price: number
  /** `quantity × price`, computed in SQL. */
  value: number
  charges: number
  /** §12.6: the components sum exactly to `charges`, enforced by a CHECK. */
  chargeBreakdown: Record<string, number>
  /** §9: 0.00 on every opening leg, never null. */
  realisedPnl: number
  /** §10: true when the 15:20 job wrote it rather than the user. */
  isAutoSquareoff: boolean
}

/** The one row of `reports_summary`, over the filtered set. */
export type ReportsSummary = {
  tradeCount: number
  realisedPnl: number
  chargesTotal: number
  buyValue: number
  sellValue: number
}

/**
 * Unrealised P&L on open CNC holdings.
 *
 * **Holdings only, and the page says so.** F21 put MIS positions on
 * `/positions` and kept them off the dashboard's aggregate; Reports follows that
 * split rather than merging two figures that answer different questions. The
 * omission exists only intraday, since no MIS position survives 15:20 (§10), and
 * it is disclosed rather than hidden.
 *
 * `source` is derived at render time from the holdings' providers, never stored
 * — the provenance rule applies to a total derived from prices exactly as it
 * does to a price.
 */
export type UnrealisedSummary = {
  unrealisedPnl: number
  holdingCount: number
  /** Holdings with no quote row. Without it the sum silently omits one. */
  unpricedCount: number
  /** Null when nothing is priced — no claim to characterise. */
  source: QuoteSource | null
  /** The oldest provider timestamp behind the figure, for the disclosure. */
  oldestProviderTs: string | null
}
