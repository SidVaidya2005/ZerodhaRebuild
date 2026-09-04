'use client'

import Link from 'next/link'

import { CancelOrderButton } from '@/components/terminal/CancelOrderButton'
import { ModifyOrderDialog } from '@/components/terminal/ModifyOrderDialog'
import { ORDER_ERROR_COPY } from '@/lib/trading/order-copy'
import type { OrderRow } from '@/lib/trading/types'
import { cn, formatCurrency } from '@/lib/utils'

/**
 * One tab's orders.
 *
 * No live price column, deliberately: every price here is history — the limit
 * the user set, or the price the order filled at — and neither moves. A ticking
 * LTP beside them would need `PriceWithProvenance` and the `serverProvenance`
 * fallback for the server render, which is real cost for a column the feature
 * was never asked for.
 */

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const STATUS_TONE: Record<OrderRow['status'], string> = {
  COMPLETE: 'text-ink',
  OPEN: 'text-brand',
  CANCELLED: 'text-muted',
  REJECTED: 'text-down',
}

export function OrdersTable({ orders, label }: { orders: OrderRow[]; label: string }) {
  const hasActions = orders.some((order) => order.status === 'OPEN')

  // Focusable and labelled: below ~720px this table overflows, and a scroll
  // container that cannot be focused leaves keyboard users unable to reach the
  // columns past the right edge. Lighthouse does not audit this; axe does.
  return (
    <div
      role="region"
      aria-label={`${label} orders, scrollable`}
      tabIndex={0}
      className="overflow-x-auto rounded-xs focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
    >
      <table className="w-full min-w-[720px] text-body-sm">
        <caption className="sr-only">{label} orders, newest first.</caption>
        <thead>
          <tr className="text-caption text-muted">
            <th scope="col" className="pb-2 text-left font-medium">
              Time
            </th>
            <th scope="col" className="pb-2 text-left font-medium">
              Instrument
            </th>
            <th scope="col" className="pb-2 text-left font-medium">
              Type
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Qty
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Price
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Avg price
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Status
            </th>
            {hasActions ? (
              <th scope="col" className="pb-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-t border-hairline align-top">
              <td className="py-2 whitespace-nowrap text-muted-strong tabular-nums">
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
                {/* The reason sits under the instrument rather than in its own
                    column: only rejected rows carry one, and a column that is
                    empty on three tabs out of four is mostly whitespace. */}
                {order.rejectionReason ? (
                  <span className="mt-1 block text-caption text-down">
                    {ORDER_ERROR_COPY[order.rejectionReason]}
                  </span>
                ) : null}
              </th>

              <td className="py-2 text-muted-strong">{order.orderType}</td>

              <td className="py-2 text-right text-ink tabular-nums">
                {order.filledQuantity}/{order.quantity}
              </td>

              {/* The order's own price: the limit the user set. A market order
                  never had one, and an em dash says so — a zero would be a
                  price. */}
              <td className="py-2 text-right text-ink tabular-nums">
                {order.limitPrice === null ? '—' : formatCurrency(order.limitPrice)}
              </td>

              <td className="py-2 text-right text-ink tabular-nums">
                {order.averagePrice === null ? '—' : formatCurrency(order.averagePrice)}
              </td>

              <td
                className={cn(
                  'py-2 text-right text-caption font-medium',
                  STATUS_TONE[order.status]
                )}
              >
                {order.status}
              </td>

              {hasActions ? (
                <td className="py-2 text-right">
                  {order.status === 'OPEN' ? (
                    <span className="inline-flex items-center justify-end gap-1">
                      <ModifyOrderDialog order={order} />
                      <CancelOrderButton order={order} />
                    </span>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
