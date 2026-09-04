'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cancelOrder } from '@/server/actions/orders'
import type { OrderRow } from '@/lib/trading/types'

/**
 * Cancels one open order.
 *
 * No confirmation step. A cancel releases the reservation and files a
 * `CANCELLED` row — it destroys nothing the user cannot immediately re-create,
 * and the order ticket is one click away. A dialog here would cost every
 * deliberate cancel two clicks to guard against an accidental one that is
 * cheaply undone.
 *
 * The in-flight guard matters more than it looks: a second cancel arriving while
 * the first is in flight is harmless at the database — `cancel_order` re-checks
 * the status under the row lock and returns false — but it would toast a failure
 * for an order the user did in fact just cancel.
 */
export function CancelOrderButton({ order }: { order: OrderRow }) {
  const [pending, startTransition] = useTransition()

  function onCancel() {
    startTransition(async () => {
      const result = await cancelOrder({ orderId: order.id })

      if (!result.ok) {
        toast.error(result.error.message)
        return
      }

      toast.success(`Cancelled ${order.quantity} ${order.symbol}.`)
    })
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={onCancel}
      // The row is one of many, so the label has to name which order it acts on.
      aria-label={`Cancel ${order.side.toLowerCase()} order for ${order.quantity} ${order.symbol}`}
    >
      {pending ? 'Cancelling…' : 'Cancel'}
    </Button>
  )
}
