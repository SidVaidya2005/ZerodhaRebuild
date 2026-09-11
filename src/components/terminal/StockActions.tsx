'use client'

import { Button } from '@/components/ui/button'
import { openTicket } from '@/lib/stores/order-ticket-store'
import type { OrderProduct } from '@/lib/trading/charges'

/**
 * Buy and Sell for this instrument.
 *
 * Both open the **one** ticket mounted in the terminal layout rather than a
 * dialog of their own — the store holds only which symbol and side were asked
 * for, so a second copy of the form never exists on the page (F25).
 *
 * No product and no quantity are pre-filled: unlike F30's Exit and F31's, this
 * is a fresh order rather than the close of a known lot, so both are genuinely
 * the user's to choose.
 */

export type StockActionsProps = {
  symbol: string
  /** Pre-selects the product when the user already holds or is short this symbol. */
  product?: OrderProduct
}

export function StockActions({ symbol, product }: StockActionsProps) {
  return (
    <div className="flex gap-2">
      <Button onClick={() => openTicket({ symbol, side: 'BUY', product })}>Buy</Button>
      <Button variant="outline" onClick={() => openTicket({ symbol, side: 'SELL', product })}>
        Sell
      </Button>
    </div>
  )
}
