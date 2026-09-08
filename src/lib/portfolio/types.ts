import type { QuoteProviderName } from '@shared/provenance.ts'

/**
 * What the dashboard reads, as the page shapes it.
 *
 * Every figure here arrives already computed by Postgres — `portfolio_holdings`
 * and `portfolio_summary` do the arithmetic, per `CLAUDE.md`'s money rule.
 * Nothing in this folder recalculates a total for storage; the one thing it does
 * recompute is the *display* copy that ticks, and that reaches nothing.
 */

/** One row of `portfolio_holdings`. */
export type HoldingRow = {
  symbol: string
  name: string
  exchange: string
  quantity: number
  averagePrice: number
  invested: number
  /** Null when the symbol has no `quotes` row. Never zero — zero is a valuation. */
  ltp: number | null
  prevClose: number | null
  marketValue: number | null
  unrealisedPnl: number | null
  dayPnl: number | null
  provider: QuoteProviderName | null
  providerTs: string | null
  fetchedAt: string | null
}

/** The one row of `portfolio_summary`, as the tiles render it. */
export type PortfolioSummary = {
  availableCash: number
  invested: number
  marketValue: number
  portfolioValue: number
  overallPnl: number
  dayPnl: number
  holdingCount: number
  /**
   * Holdings the sums above could not value. Rendered rather than swallowed: a
   * portfolio quietly missing a position understates itself with no sign that
   * anything is absent.
   */
  unpricedCount: number
}

/**
 * One row of `portfolio_positions`.
 *
 * **No `entryReferencePrice` field exists, deliberately.** §12.11 makes that
 * average collateral-only and `averagePrice` the P&L figure, and the view does
 * not select it — so there is nothing here to cross them with. `blockedMargin`
 * is the collateral figure the page renders: a stored result of §6's formula,
 * never an input to one.
 */
export type PositionRow = {
  symbol: string
  name: string
  exchange: string
  /** Negative for an intraday short. */
  netQuantity: number
  /** Cost per share for a long, net proceeds per share for a short. P&L only. */
  averagePrice: number
  /** Accumulated on partial exits; `0.00`, never null. */
  realisedPnl: number
  /** Collateral against an open short. Zero for a long, which renders an em dash. */
  blockedMargin: number
  /** Null when the symbol has no `quotes` row. Never zero — zero is a valuation. */
  ltp: number | null
  unrealisedPnl: number | null
  provider: QuoteProviderName | null
  providerTs: string | null
  fetchedAt: string | null
}

/** The one row of `portfolio_positions_summary`, as the footer renders it. */
export type PositionsSummary = {
  unrealisedPnl: number
  realisedPnl: number
  blockedMargin: number
  positionCount: number
  /**
   * Positions the unrealised sum could not value. Rendered rather than
   * swallowed, for the same reason `PortfolioSummary.unpricedCount` is.
   */
  unpricedCount: number
}

/** One row of the recent-orders list. */
export type RecentOrder = {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  product: 'CNC' | 'MIS'
  quantity: number
  filledQuantity: number
  averagePrice: number | null
  status: string
  placedAt: string
}

/** The index strip's figures — a breadth statistic, never an index level. */
export type MarketComposite = {
  /** Priced active instruments. Rendered beside `universeSize`, always. */
  constituents: number
  universeSize: number
  /** Null when nothing is priced. The strip shows an em dash for that. */
  changePct: number | null
  advances: number
  declines: number
  unchanged: number
  /**
   * The pessimistic provenance inputs: every distinct provider among the
   * constituents, paired with the oldest timestamp any of them reported. A claim
   * about data quality may only ever err downwards.
   */
  providers: QuoteProviderName[]
  oldestProviderTs: string | null
  oldestFetchedAt: string | null
}
