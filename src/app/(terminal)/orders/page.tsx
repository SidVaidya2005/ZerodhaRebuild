import type { Metadata } from 'next'

import { OrderChannel } from '@/components/terminal/OrderChannel'
import { OrdersTabs } from '@/components/terminal/OrdersTabs'
import { istDayStart } from '@/lib/market/market-hours'
import { toRejectionCode } from '@/lib/trading/order-copy'
import type { OrderRow } from '@/lib/trading/types'
import { createClient } from '@/lib/supabase/server'
import { throwOnReadError } from '@/lib/read-errors'

export const metadata: Metadata = {
  title: 'Orders — ZerodhaRebuild',
}

/**
 * Today's order activity, plus every open order whatever its age.
 *
 * **The open-order exemption is what makes the date filter safe.** A limit order
 * placed on Friday is still working on Monday and still holding margin; a strict
 * today filter would drop it from the only page that can cancel it. And F34
 * covers completed *trades* rather than orders, so a cancelled order from last
 * week would otherwise have no surface at all — the exemption plus a day window
 * is the narrowest scope that hides nothing a user can still act on.
 *
 * "Today" is an IST calendar day. A UTC boundary would roll this page over at
 * 05:30 IST, an hour before the pre-open, which is the sort of thing that looks
 * right for months and then is not.
 *
 * The session is not re-checked here — `(terminal)/layout.tsx` does it once per
 * navigation. `getUser()` below is called for the id the Realtime channel filters
 * on, which is a different need from an authorisation check.
 */
export default async function OrdersPage() {
  const supabase = await createClient()

  const dayStart = istDayStart(new Date()).toISOString()

  const [
    {
      data: { user },
    },
    { data: rows, error },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('orders')
      .select(
        'id, symbol, side, product, order_type, quantity, filled_quantity, limit_price, average_price, status, rejection_reason, placed_at'
      )
      // Comma-separated conditions inside one `.or()` are an OR; a second
      // `.or()` would AND with this one. RLS scopes the rows to the caller.
      //
      // `executed_at` is the third condition because the first two lose an order
      // at the exact moment it stops being open: one placed before today that
      // fills, cancels or rejects today is neither `OPEN` nor placed today, so it
      // dropped off the page entirely rather than moving to Executed. Every
      // terminal transition stamps `executed_at` — `execute_order` on a fill and
      // on each rejection, `cancel_order` on a cancel — so one condition covers
      // all three. (Phase 4 checkpoint)
      .or(`status.eq.OPEN,placed_at.gte.${dayStart},executed_at.gte.${dayStart}`)
      .order('placed_at', { ascending: false }),
  ])

  // Logged and thrown, so `error.tsx` catches it. An empty order book and a
  // failed read used to render identically — below this line, an empty tab
  // means no orders in that state. (F36)
  throwOnReadError('orders', { orders: error })

  const orders: OrderRow[] = (rows ?? []).map((row) => ({
    id: row.id,
    symbol: row.symbol,
    side: row.side,
    product: row.product,
    orderType: row.order_type,
    quantity: Number(row.quantity),
    filledQuantity: Number(row.filled_quantity),
    // Narrowed rather than coerced: `Number(null)` is 0, and a zero here would
    // be a price the user never set.
    limitPrice: row.limit_price === null ? null : Number(row.limit_price),
    averagePrice: row.average_price === null ? null : Number(row.average_price),
    // Not cast. `side`, `product` and `order_type` above are assigned straight
    // across, and this column is no different — `database.ts` is regenerated
    // after every migration, so an added `order_status` value fails `tsc` here.
    // Cast, it compiled and `OrdersTabs` pushed onto an undefined group at
    // runtime instead, blanking the page through the error boundary.
    status: row.status,
    // Mapped to a known code at the boundary, so nothing downstream can render a
    // raw `rejection_reason` string.
    rejectionReason: row.rejection_reason === null ? null : toRejectionCode(row.rejection_reason),
    placedAt: row.placed_at,
  }))

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
      <h1 className="text-title text-ink">Orders</h1>
      <p className="mt-1 text-body-sm text-muted">
        Today&rsquo;s activity, and every order still open.
      </p>

      {/* Renders nothing. Moves the row between tabs when the tick fills it. */}
      {user ? <OrderChannel userId={user.id} /> : null}

      <div className="mt-6">
        <OrdersTabs orders={orders} />
      </div>
    </div>
  )
}
