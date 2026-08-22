import { create } from 'zustand'

import type { OrderProduct, OrderSide } from '@/lib/trading/charges'

/**
 * Which symbol the order ticket is open on, if any.
 *
 * The ticket is mounted **once**, in the terminal layout, and every call site
 * gets a button rather than a dialog. That is not premature: F18's watchlist
 * panel renders twice — the `md` rail and the mobile sheet, both always mounted
 * — so a per-row dialog would put two copies of the same form on the page for
 * one symbol, with two sets of field state and two position fetches.
 *
 * Deliberately holds only what opens the ticket. The form's own state belongs to
 * `react-hook-form` inside the dialog, and lifting it here would mean every
 * keystroke re-rendered anything else subscribed to this store.
 */

export type OrderTicketRequest = {
  symbol: string
  side: OrderSide
  /** Optional starting values, for call sites that know them (F31's exit). */
  product?: OrderProduct
  quantity?: number
}

type OrderTicketState = {
  request: OrderTicketRequest | null
  openTicket: (request: OrderTicketRequest) => void
  closeTicket: () => void
}

export const useOrderTicketStore = create<OrderTicketState>()((set) => ({
  request: null,
  openTicket: (request) => set({ request }),
  closeTicket: () => set({ request: null }),
}))

/**
 * Opens the ticket from anywhere, including outside React.
 *
 * A plain function rather than a hook so a call site spends no subscription on
 * it: a watchlist row that only ever *opens* the ticket must not re-render when
 * the ticket opens on some other symbol.
 */
export function openTicket(request: OrderTicketRequest): void {
  useOrderTicketStore.getState().openTicket(request)
}
