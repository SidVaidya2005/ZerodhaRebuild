import type { LedgerType } from './ledger'

/**
 * What the Funds page reads, as the page shapes it.
 *
 * Every figure arrives already computed by Postgres — `funds_overview` does the
 * sum and the counts, per `CLAUDE.md`'s money rule. **Nothing here is a price**,
 * which is the property that keeps this page free of provenance: §9's realised
 * P&L is a fact about closed trades, not a claim about what anything is worth
 * now.
 */

/** The one row of `funds_overview`. */
export type FundsOverview = {
  availableCash: number
  usedMargin: number
  openingBalance: number
  /** §9's closing-leg figure. Never unrealised — see this module's header. */
  realisedPnl: number
  /** The five counts `reset_account()` deletes, so the dialog can name them. */
  orderCount: number
  tradeCount: number
  holdingCount: number
  positionCount: number
  ledgerCount: number
}

/** One row of `fund_ledger`, with the order it belongs to when it has one. */
export type LedgerEntry = {
  id: string
  type: LedgerType
  /** Signed: negative for a debit. */
  amount: number
  /** The balance after this row, which is what makes the ledger auditable. */
  balanceAfter: number
  note: string | null
  createdAt: string
  /**
   * Null for a row with no order behind it — `SIGNUP_CREDIT` and
   * `SIMULATION_ADJUSTMENT` are the two that never carry one.
   */
  order: { symbol: string; side: 'BUY' | 'SELL'; product: 'CNC' | 'MIS' } | null
}
