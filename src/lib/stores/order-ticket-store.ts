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

/**
 * The element that was focused when the ticket was opened, so closing can put
 * focus back on it.
 *
 * Module scope rather than store state, for two reasons: a DOM node is not
 * state anything renders from, and nothing should re-render because focus
 * moved. Radix restores focus to its `DialogTrigger`, and this ticket has none
 * — it is opened imperatively from anywhere — so the trigger is remembered
 * here instead.
 *
 * Captured at the click, which is the only moment it is knowable: by the time
 * the dialog has mounted, Radix has already moved focus inside it. A mouse user
 * on a browser that does not focus buttons on click leaves this null and gets
 * Radix's default, which is the behaviour focus restoration exists to improve
 * on for **keyboard** users — and a keyboard user is on the trigger by
 * definition.
 */
let ticketTrigger: HTMLElement | null = null

function rememberTrigger(): void {
  const active = typeof document === 'undefined' ? null : document.activeElement
  ticketTrigger = active instanceof HTMLElement && active !== document.body ? active : null
}

/**
 * Returns the remembered trigger once, and forgets it — a second close must not
 * fling focus back to a button from an earlier one.
 */
export function consumeTicketTrigger(): HTMLElement | null {
  const trigger = ticketTrigger
  ticketTrigger = null
  return trigger
}

export const useOrderTicketStore = create<OrderTicketState>()((set) => ({
  request: null,
  openTicket: (request) => {
    rememberTrigger()
    set({ request })
  },
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
