import { formatCurrency, formatQuantity } from '@/lib/utils'
import type { PlacedOrder } from '@/lib/trading/schemas'

/**
 * Everything the order path says to a user, in one pure module.
 *
 * Separate from the Server Action so it is tier-1 testable: the action needs a
 * database and a session, while the thing that can silently go wrong — a
 * rejection code with no copy, or copy naming the wrong number — is a pure
 * mapping. `code-standards.md` requires that raw Postgres text never reaches a
 * UI string, and the only way to keep that true is for the UI string to come
 * from a table like this one.
 */

/**
 * `trading-contract.md` §4's closed set. These are the values `place_order` and
 * `execute_order` write into `orders.rejection_reason`, and they are the whole
 * set — a sixth added in SQL without being added here becomes `UNKNOWN` rather
 * than reaching the screen as a bare identifier.
 */
export const REJECTION_CODES = [
  'INSUFFICIENT_FUNDS',
  'NO_HOLDING',
  'NO_QUOTE',
  'MARKET_CLOSED',
  'INVALID_QUANTITY',
] as const

export type RejectionCode = (typeof REJECTION_CODES)[number]

/** Every code the order path can report, including the two that are not rejections. */
export type OrderErrorCode = RejectionCode | 'VALIDATION_ERROR' | 'UNCONFIRMED' | 'UNKNOWN'

/**
 * The copy is specific where the user can act on it and vague where they
 * cannot. `MARKET_CLOSED` names the opening time because it is the most common
 * rejection this simulator produces — the market is shut for two-thirds of the
 * week — and "rejected" alone would read as a fault rather than a schedule.
 */
export const ORDER_ERROR_COPY: Readonly<Record<OrderErrorCode, string>> = {
  INSUFFICIENT_FUNDS:
    'Not enough funds. Lower the quantity, or free up margin by closing a position.',
  NO_HOLDING: 'You do not hold enough of that to sell. A CNC sell can only sell what you own.',
  NO_QUOTE: 'No recent price for that symbol, so the order was not filled at a stale one.',
  MARKET_CLOSED: 'The market is closed. It opens at 09:15 on the next trading day.',
  INVALID_QUANTITY: 'That quantity is not a whole number of shares.',
  VALIDATION_ERROR: 'Check the order details.',
  // The outcome is genuinely unknown here, so the copy must not imply either
  // answer — telling someone to retry could double-place, and telling them it
  // failed could be a lie.
  UNCONFIRMED: 'We could not confirm that order. Check Orders before placing it again.',
  UNKNOWN: 'That order did not go through. Try again.',
}

/**
 * Narrows `orders.rejection_reason` — a bare `text` column — onto the set that
 * has copy. Anything else is a code this build does not know about, which is a
 * drift bug rather than something to render.
 */
export function toRejectionCode(reason: string | null): OrderErrorCode {
  return (REJECTION_CODES as readonly string[]).includes(reason ?? '')
    ? (reason as RejectionCode)
    : 'UNKNOWN'
}

/**
 * Maps a raised Postgres error onto a code. Distinct from `toRejectionCode`
 * above and deliberately so: a rejection is a normal return with a reason
 * string, while this is the fault path, where all we have is an error whose
 * text must never be shown.
 */
export function toFaultCode(error: { code?: string } | null): OrderErrorCode {
  // 42501 is what `place_order` raises when there is no `auth.uid()`, which in
  // practice means the session expired between page load and submit.
  if (error?.code === '42501') return 'UNCONFIRMED'
  return 'UNKNOWN'
}

/**
 * What the toast says after an order is accepted.
 *
 * A fill quotes the price it actually got — the number the user most wants and
 * the one they cannot predict — and a resting limit order quotes the limit they
 * set, so the two read the same way. Both figures come from Postgres; nothing
 * here computes money.
 */
export function orderPlacedMessage(order: PlacedOrder): string {
  const verb = order.side === 'BUY' ? 'Bought' : 'Sold'
  const shares = `${formatQuantity(order.quantity)} ${order.symbol}`

  if (order.status === 'COMPLETE') {
    return order.price === null
      ? `${verb} ${shares}.`
      : `${verb} ${shares} at ${formatCurrency(order.price)}.`
  }

  const action = order.side === 'BUY' ? 'Limit buy' : 'Limit sell'
  return order.price === null
    ? `${action} placed — ${shares}, waiting to fill.`
    : `${action} placed — ${shares} at ${formatCurrency(order.price)}, waiting to fill.`
}

/**
 * `modify_order`'s reasons — `trading-contract.md` §4, and a closed set for the
 * same reason `REJECTION_CODES` is one. A modify declines in six distinct ways
 * and only one of them is about money, so collapsing them into a bare `false`
 * would leave the user guessing which.
 *
 * `NO_HOLDING` was added to `modify_order` by the CNC-sell pre-flight in
 * `20260906110000` and asserted by `12-modify-order.sql`, but not here — so it
 * fell through `toModifyCode` to `UNKNOWN` and the user raising a resting CNC
 * sell above their holding was told only "that change did not go through",
 * forever. `order-copy.test.ts` could not catch it: it iterates this array, so a
 * missing member is invisible to it. Keep this set equal to the reasons in
 * `modify_order`'s own COMMENT.
 */
export const MODIFY_REASONS = [
  'NOT_FOUND',
  'NOT_OPEN',
  'NOT_MODIFIABLE',
  'INVALID_QUANTITY',
  'NO_HOLDING',
  'INSUFFICIENT_FUNDS',
] as const

export type ModifyReason = (typeof MODIFY_REASONS)[number]

/** Every code the two order-mutation actions can report. */
export type OrderMutationCode = ModifyReason | 'VALIDATION_ERROR' | 'UNKNOWN'

/**
 * `NOT_FOUND` covers three states deliberately — the order does not exist, it is
 * not the caller's, or it was deleted by a reset — because distinguishing them
 * would confirm to a caller that some other user's id is real. The copy names
 * the only recovery the user has.
 *
 * `INSUFFICIENT_FUNDS` says the order is untouched, because that is the fact the
 * user most needs and the one they cannot see: the modify rolled back whole, so
 * the original order is still working at its original terms.
 */
export const MODIFY_ERROR_COPY: Readonly<Record<OrderMutationCode, string>> = {
  NOT_FOUND: 'That order is no longer available. Refresh to see its current state.',
  NOT_OPEN: 'That order has already been filled or cancelled, so it can no longer be changed.',
  NOT_MODIFIABLE: 'Only the quantity and limit price of an open limit order can be changed.',
  INVALID_QUANTITY: 'That quantity is not a whole number of shares.',
  NO_HOLDING: 'You do not hold enough of that to sell. A CNC sell can only sell what you own.',
  INSUFFICIENT_FUNDS:
    'Not enough funds for the new terms. The order is unchanged and still working at its original ones.',
  VALIDATION_ERROR: 'Check the new order details.',
  UNKNOWN: 'That change did not go through. Try again.',
}

/**
 * `cancel_order` returns a bare boolean, so a `false` is genuinely one answer
 * covering already-filled, already-cancelled, and not-yours. The copy says what
 * all three have in common rather than guessing which.
 */
export const CANCEL_FAILED_COPY =
  'That order could not be cancelled — it may have already been filled. Refresh to see its current state.'

/** Narrows `modify_order`'s `reason` onto the set that has copy. */
export function toModifyCode(reason: string | null): OrderMutationCode {
  return (MODIFY_REASONS as readonly string[]).includes(reason ?? '')
    ? (reason as ModifyReason)
    : 'UNKNOWN'
}
