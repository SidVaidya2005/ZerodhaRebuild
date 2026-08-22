import Link from 'next/link'

import type { RecentOrder } from '@/lib/portfolio/types'
import { cn, formatCurrency } from '@/lib/utils'

/**
 * The last handful of orders.
 *
 * A Server Component: nothing here ticks. An order's price is the price it
 * filled at, which is history and never moves — rendering it through the live
 * store would be wrong, not merely unnecessary.
 *
 * **Nothing writes `orders` until F26**, so this list is empty for every account
 * today. It is built now because the dashboard's empty state has to be able to
 * tell "never traded" from "traded and closed out", and that distinction needs
 * both halves to exist.
 */

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const STATUS_TONE: Record<string, string> = {
  COMPLETE: 'text-ink',
  OPEN: 'text-brand',
  CANCELLED: 'text-muted',
  REJECTED: 'text-down',
}

export function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  if (orders.length === 0) {
    return <p className="text-body-sm text-muted">No orders yet.</p>
  }

  // Focusable and labelled, per the F05 constraint: below ~520px this table
  // overflows, and a scroll container that cannot be focused leaves keyboard
  // users unable to reach the columns off the right edge. Lighthouse does not
  // catch this — axe does.
  return (
    <div
      role="region"
      aria-label="Recent orders, scrollable"
      tabIndex={0}
      className="overflow-x-auto rounded-xs focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
    >
      <table className="w-full min-w-[520px] text-body-sm">
        <caption className="sr-only">Your most recent orders, newest first.</caption>
        <thead>
          <tr className="text-caption text-muted">
            <th scope="col" className="pb-2 text-left font-medium">
              Time
            </th>
            <th scope="col" className="pb-2 text-left font-medium">
              Instrument
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Qty
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Price
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t border-hairline">
              <td className="py-2 text-muted-strong tabular-nums">
                {timeFormatter.format(new Date(order.placedAt))}
              </td>
              <th scope="row" className="py-2 text-left font-normal">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-xs px-1.5 py-0.5 text-caption font-medium',
                      order.side === 'BUY' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                    )}
                  >
                    {order.side}
                  </span>
                  <Link href={`/stocks/${order.symbol}`} className="text-ink hover:underline">
                    {order.symbol}
                  </Link>
                  <span className="text-caption text-muted">{order.product}</span>
                </span>
              </th>
              <td className="py-2 text-right text-ink tabular-nums">
                {order.filledQuantity}/{order.quantity}
              </td>
              {/* An unfilled order has no execution price. An em dash, not a
                  zero — a zero would be a price. */}
              <td className="py-2 text-right text-ink tabular-nums">
                {order.averagePrice === null ? '—' : formatCurrency(order.averagePrice)}
              </td>
              <td
                className={cn(
                  'py-2 text-right text-caption font-medium',
                  STATUS_TONE[order.status] ?? 'text-muted-strong'
                )}
              >
                {order.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
