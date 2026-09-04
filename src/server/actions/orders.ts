'use server'

import { createClient } from '@/lib/supabase/server'
import {
  CANCEL_FAILED_COPY,
  MODIFY_ERROR_COPY,
  ORDER_ERROR_COPY,
  toFaultCode,
  toModifyCode,
  toRejectionCode,
  type OrderErrorCode,
} from '@/lib/trading/order-copy'
import {
  cancelOrderSchema,
  modifyOrderSchema,
  placeOrderSchema,
  type PlacedOrder,
} from '@/lib/trading/schemas'
import { revalidateTerminal } from '@/server/revalidate'
import type { ActionResult } from '@/types/domain'

/**
 * The boundary between `place_order` and the screen.
 *
 * No money arithmetic and no SQL of its own: F24's function decides every
 * outcome, and this parses the input, maps the row it gets back, and
 * revalidates what a fill moved.
 *
 * **`place_order` returns normally in all three outcomes.** `REJECTED`, `OPEN`
 * and `COMPLETE` all come back with `error` null, because a business rejection
 * writes a row §4 and F27's Orders page both require — raising would roll it
 * back. So `error` here means a *fault*: a raised exception or a transport
 * failure, neither of which is an answer about the order.
 */

/**
 * Every failure this action can report, built from the copy table and nowhere
 * else — which is what makes "no raw database text in a UI string" structural
 * rather than a thing to remember at each `return`.
 */
function fail(code: OrderErrorCode): ActionResult<never> {
  return { ok: false, error: { code, message: ORDER_ERROR_COPY[code] } }
}

export async function placeOrder(input: unknown): Promise<ActionResult<PlacedOrder>> {
  const parsed = placeOrderSchema.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_ERROR')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('place_order', {
    p_symbol: parsed.data.symbol,
    p_side: parsed.data.side,
    p_order_type: parsed.data.orderType,
    p_product: parsed.data.product,
    p_quantity: parsed.data.quantity,
    // Omitted rather than passed as null: the generated signature has
    // `p_limit_price?: number`, matching the SQL default, and `place_order`
    // raises 22023 if a market order carries one.
    p_limit_price: parsed.data.limitPrice ?? undefined,
  })

  if (error) {
    // Raw Postgres text is logged, never returned.
    console.error('[orders.placeOrder]', error)
    return fail(toFaultCode(error))
  }

  // `returns table` arrives as an array. Exactly one row is the contract; zero
  // would mean the function returned without a `return query`, which no path
  // does — so it is a fault rather than an outcome.
  const row = data?.[0]
  if (!row) {
    console.error('[orders.placeOrder] place_order returned no row', { data })
    return fail('UNKNOWN')
  }

  if (row.status === 'REJECTED') {
    // Not an error to log: a rejection is a recorded, expected outcome, and the
    // row is on the Orders page. Only the code crosses back, never the reason
    // string itself.
    return fail(toRejectionCode(row.rejection_reason))
  }

  // Anything that is neither REJECTED nor one of the two accepted statuses
  // means `orders.status` grew a value this build does not know how to report.
  if (row.status !== 'OPEN' && row.status !== 'COMPLETE') {
    console.error('[orders.placeOrder] unexpected status', { status: row.status })
    return fail('UNKNOWN')
  }

  // A fill moves cash, margin, holdings, positions and every total derived from
  // them; a resting limit order moves the blocked margin, which is the same
  // header figure. Both revalidate the whole terminal.
  revalidateTerminal()

  const placed: PlacedOrder = {
    orderId: row.order_id,
    status: row.status,
    symbol: parsed.data.symbol,
    side: parsed.data.side,
    quantity: parsed.data.quantity,
    price: parsed.data.limitPrice ?? null,
  }

  if (row.status === 'OPEN') return { ok: true, data: placed }

  // The fill price is read back rather than returned by the function: widening
  // `place_order`'s signature would mean a migration against something already
  // proven at three tiers, for one string. RLS scopes this to the caller, so
  // the id from the row above cannot fetch anyone else's order.
  const { data: filled, error: readError } = await supabase
    .from('orders')
    .select('average_price, filled_quantity')
    .eq('id', row.order_id)
    .maybeSingle()

  if (readError) {
    // The order is placed and filled either way. Losing the price costs the
    // toast its number, and nothing else — so this reports success.
    console.error('[orders.placeOrder] fill read-back failed', readError)
    return { ok: true, data: placed }
  }

  return {
    ok: true,
    data: {
      ...placed,
      quantity: filled?.filled_quantity ?? placed.quantity,
      price: filled?.average_price ?? null,
    },
  }
}

/**
 * Cancels an open order.
 *
 * `cancel_order` shipped in F24 and is unchanged: it locks the row, re-checks
 * `status = 'OPEN'`, releases the reservation before the status moves — the
 * ordering `orders_no_margin_unless_open` forces — and returns a bare boolean.
 *
 * That boolean is genuinely one answer covering three states: already filled,
 * already cancelled, and not the caller's. Telling them apart here would mean
 * reading the row back to find out, and the third case must not be
 * distinguishable anyway — it would confirm that another user's id is real.
 */
export async function cancelOrder(input: unknown): Promise<ActionResult<{ orderId: string }>> {
  const parsed = cancelOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'That is not an order.' } }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cancel_order', { p_order_id: parsed.data.orderId })

  if (error) {
    console.error('[orders.cancelOrder]', error)
    return { ok: false, error: { code: 'UNKNOWN', message: MODIFY_ERROR_COPY.UNKNOWN } }
  }

  if (data !== true) {
    return { ok: false, error: { code: 'NOT_OPEN', message: CANCEL_FAILED_COPY } }
  }

  // A release moves available_cash and used_margin, which the terminal chrome
  // renders on every page — not only the row that disappeared from this one.
  revalidateTerminal()
  return { ok: true, data: { orderId: parsed.data.orderId } }
}

/**
 * Changes the quantity and limit price of an order still open.
 *
 * The whole outcome is decided in `modify_order`: it re-reserves through
 * `release_margin` + `reserve_margin` inside a subtransaction, so a modify that
 * cannot be covered rolls back whole and the order keeps both its original terms
 * and its original reservation. This action parses, calls, and maps — it never
 * computes a requirement, because §6 is written in exactly one place.
 *
 * `error` here means a fault. Every business outcome, including
 * `INSUFFICIENT_FUNDS`, comes back as a normal `(ok, reason)` row.
 */
export async function modifyOrder(input: unknown): Promise<ActionResult<{ orderId: string }>> {
  const parsed = modifyOrderSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: MODIFY_ERROR_COPY.VALIDATION_ERROR },
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('modify_order', {
    p_order_id: parsed.data.orderId,
    p_quantity: parsed.data.quantity,
    // Omitted rather than null, matching the SQL default and `placeOrder` above.
    // `modify_order` refuses a price that does not match the stored order type,
    // because only the locked row knows what that type is.
    p_limit_price: parsed.data.limitPrice ?? undefined,
  })

  if (error) {
    console.error('[orders.modifyOrder]', error)
    return { ok: false, error: { code: 'UNKNOWN', message: MODIFY_ERROR_COPY.UNKNOWN } }
  }

  const row = data?.[0]
  if (!row) {
    console.error('[orders.modifyOrder] modify_order returned no row', { data })
    return { ok: false, error: { code: 'UNKNOWN', message: MODIFY_ERROR_COPY.UNKNOWN } }
  }

  if (row.ok !== true) {
    const code = toModifyCode(row.reason)
    return { ok: false, error: { code, message: MODIFY_ERROR_COPY[code] } }
  }

  // The re-reservation moved cash and margin in both directions.
  revalidateTerminal()
  return { ok: true, data: { orderId: parsed.data.orderId } }
}
