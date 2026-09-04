import type { OrderErrorCode } from '@/lib/trading/order-copy'

/**
 * One `orders` row, as the Orders page renders it.
 *
 * Wider than `RecentOrder` in `portfolio/types.ts`, which the dashboard uses:
 * that list shows what happened, while this page also has to show what an order
 * *asked for* — its type, its limit, and why it was refused — and offer the two
 * actions that act on one still open. Kept separate rather than widening
 * `RecentOrder`, so the dashboard's narrow select stays narrow.
 *
 * Every money figure arrives already computed by Postgres. Nothing here is
 * derived in TypeScript.
 */
export type OrderRow = {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  product: 'CNC' | 'MIS'
  orderType: 'MARKET' | 'LIMIT'
  quantity: number
  filledQuantity: number
  /** Null on a MARKET order, which carries no limit by construction. */
  limitPrice: number | null
  /** Null until the order fills. Never zero — zero would be a price. */
  averagePrice: number | null
  status: OrderStatus
  /**
   * Present only on a REJECTED row, and narrowed to the set that has copy so a
   * code this build does not know cannot reach the screen as a bare identifier.
   */
  rejectionReason: OrderErrorCode | null
  placedAt: string
}

export type OrderStatus = 'OPEN' | 'COMPLETE' | 'CANCELLED' | 'REJECTED'

/**
 * The four tabs, in the order they render. `COMPLETE` is the Executed tab: this
 * build fills all-or-nothing, so there is no partial state between the two.
 */
export const ORDER_TABS = [
  { status: 'OPEN', label: 'Open' },
  { status: 'COMPLETE', label: 'Executed' },
  { status: 'CANCELLED', label: 'Cancelled' },
  { status: 'REJECTED', label: 'Rejected' },
] as const satisfies readonly { status: OrderStatus; label: string }[]
