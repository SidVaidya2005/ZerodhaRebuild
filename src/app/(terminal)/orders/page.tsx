import type { Metadata } from 'next'

import { OrderChannel } from '@/components/terminal/OrderChannel'
import { OrdersTabs } from '@/components/terminal/OrdersTabs'
import { istDayStart } from '@/lib/market/market-hours'
import { toRejectionCode } from '@/lib/trading/order-copy'
import type { OrderRow, OrderStatus } from '@/lib/trading/types'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Orders — ZerodhaRebuild',
}

/**
 * Today's orders, plus every open order whatever its age.
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
      .or(`status.eq.OPEN,placed_at.gte.${dayStart}`)
      .order('placed_at', { ascending: false }),
  ])

  // Logged rather than thrown: an empty order book and a failed read render
  // identically, and that is exactly how a broken query hides behind a plausible
  // empty state.
  if (error) console.error('[orders] orders', error)

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
    status: row.status as OrderStatus,
    // Mapped to a known code at the boundary, so nothing downstream can render a
    // raw `rejection_reason` string.
    rejectionReason: row.rejection_reason === null ? null : toRejectionCode(row.rejection_reason),
    placedAt: row.placed_at,
  }))

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
      <h1 className="text-title text-ink">Orders</h1>
      <p className="mt-1 text-body-sm text-muted">
        Today&rsquo;s orders, and every order still open.
      </p>

      {/* Renders nothing. Moves the row between tabs when the tick fills it. */}
      {user ? <OrderChannel userId={user.id} /> : null}

      <div className="mt-6">
        <OrdersTabs orders={orders} />
      </div>
    </div>
  )
}
