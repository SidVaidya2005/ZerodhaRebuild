import type { Database } from '@/types/database'

import type { TradeRow } from './types'

/**
 * Reading a `trade_history` row, in one place.
 *
 * The page and the CSV route select the same columns and narrow them the same
 * way. Two copies of that mapping is two chances for the file to disagree with
 * the screen about what a trade was — and the file is the one the user keeps.
 * The column list is shared for the same reason: a column added to one select
 * and not the other is a column the export silently drops.
 */

/** Every column both readers need, as one PostgREST select string. */
export const TRADE_HISTORY_COLUMNS =
  'id, traded_at, traded_on, symbol, name, side, product, order_type, quantity, price, value, charges, charge_breakdown, realised_pnl, is_auto_squareoff'

/**
 * Exactly the columns `TRADE_HISTORY_COLUMNS` selects, not the whole view.
 *
 * PostgREST narrows the returned type to the selected columns, so a parameter
 * typed as the full `Row` would demand `user_id`, `order_id` and `exchange` that
 * neither caller asks for. Deriving it with `Pick` also ties the type to the
 * select string: drop a column from one and this stops compiling rather than
 * silently returning a default.
 */
type TradeHistoryRow = Pick<
  Database['public']['Views']['trade_history']['Row'],
  | 'id'
  | 'traded_at'
  | 'traded_on'
  | 'symbol'
  | 'name'
  | 'side'
  | 'product'
  | 'order_type'
  | 'quantity'
  | 'price'
  | 'value'
  | 'charges'
  | 'charge_breakdown'
  | 'realised_pnl'
  | 'is_auto_squareoff'
>

/**
 * One row as the app shapes it.
 *
 * Everything on the view is nullable — Postgres cannot prove otherwise for a
 * join — so each field is defaulted rather than asserted. The money fields go
 * through `Number` only to change representation; no arithmetic happens here.
 */
export function toTradeRow(row: TradeHistoryRow): TradeRow {
  return {
    id: row.id ?? '',
    tradedAt: row.traded_at ?? '',
    tradedOn: row.traded_on ?? '',
    symbol: row.symbol ?? '',
    name: row.name ?? '',
    side: row.side ?? 'BUY',
    product: row.product ?? 'CNC',
    orderType: row.order_type ?? 'MARKET',
    quantity: Number(row.quantity ?? 0),
    price: Number(row.price ?? 0),
    value: Number(row.value ?? 0),
    charges: Number(row.charges ?? 0),
    chargeBreakdown: toBreakdown(row.charge_breakdown),
    realisedPnl: Number(row.realised_pnl ?? 0),
    isAutoSquareoff: row.is_auto_squareoff ?? false,
  }
}

/**
 * The stored `charge_breakdown`, narrowed from `Json`.
 *
 * §3 guarantees an object with one numeric key per component and §12.6 is a
 * CHECK that they sum to `charges` — but the generated type is `Json`, so the
 * shape is asserted here rather than assumed at every read site. A malformed row
 * renders and exports zeros instead of taking the page or the download down with
 * it.
 */
function toBreakdown(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}

  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number') out[key] = raw
  }
  return out
}
