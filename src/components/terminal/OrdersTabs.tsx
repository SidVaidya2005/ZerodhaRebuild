'use client'

import { useMemo } from 'react'

import { OrdersTable } from '@/components/terminal/OrdersTable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ORDER_TABS, type OrderRow, type OrderStatus } from '@/lib/trading/types'

/**
 * The four status tabs.
 *
 * Partitioned here rather than by four queries: the counts have to be right for
 * every tab whatever is on screen, so all four sets are needed on every render
 * anyway. The page's single select is bounded by one IST day plus the open
 * orders, and `reset_account` empties the table, so there is nothing here that
 * grows without bound.
 */

const EMPTY_COPY: Readonly<Record<OrderStatus, string>> = {
  OPEN: 'No open orders. A limit order waiting to fill will appear here.',
  COMPLETE: 'Nothing executed today.',
  CANCELLED: 'Nothing cancelled today.',
  REJECTED: 'Nothing rejected today.',
}

export function OrdersTabs({ orders }: { orders: OrderRow[] }) {
  const byStatus = useMemo(() => {
    const groups: Record<OrderStatus, OrderRow[]> = {
      OPEN: [],
      COMPLETE: [],
      CANCELLED: [],
      REJECTED: [],
    }
    for (const order of orders) groups[order.status].push(order)
    return groups
  }, [orders])

  return (
    <Tabs defaultValue="OPEN">
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        {ORDER_TABS.map(({ status, label }) => (
          <TabsTrigger key={status} value={status} className="flex-none px-3">
            {label}
            {/* The count is part of the tab's accessible name, so a screen
                reader hears "Open, 2" rather than announcing a loose number
                after the label. */}
            <span className="ml-1.5 text-caption text-muted tabular-nums">
              {byStatus[status].length}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {ORDER_TABS.map(({ status, label }) => (
        <TabsContent key={status} value={status} className="pt-4">
          {byStatus[status].length === 0 ? (
            <p className="py-8 text-center text-body-sm text-muted">{EMPTY_COPY[status]}</p>
          ) : (
            <OrdersTable orders={byStatus[status]} label={label} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}
