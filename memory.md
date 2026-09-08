# In-flight state

> Everything settled lives in `context/`. This file holds only what has no home there.

## In flight

- **F26 — market-buy toast, the last item before the Phase 4 checkpoint.** Not blocked on a decision: it needs a live session, and 2026-09-08 is a trading day (session 09:15–15:30 IST). Plan: at 09:15 reset the account, then a CNC market buy for the toast and its no-reload arrival in Holdings.
- **F31 — built and green on every non-browser gate, not ticked.** Three browser items need a live MIS position: the short's signed quantity and collateral column, server-rendered provenance, and the 375px scroll region. An MIS buy in the same 09:15 window opens one. The tier-2 exit assertions were deliberately *not* written — `10-orders.sql` already proves the long close, the short cover and deletion at zero, and F31 adds no mutation path of its own.

## Tried and rejected

- Stubbing `market_state` to force a fill — **moot**, and never done. Nobody had checked the calendar; the item only ever wanted the next trading day, which its own Verify block says.
- Giving `place_order` a `p_at` to mirror the tick seam — rejected on security: it is granted to `authenticated`, so it would let any signed-in user trade outside market hours.
- Dispatching a synthetic `pointerdown/…/click` to open the order ticket — captures a null focus trigger, because Chromium focuses a button only on a trusted mousedown. Promoted to `constraints.md`.
- Trusting `supabase functions deploy` to typecheck — it does not without Docker; it warns and uploads regardless.

- **F32 — built and green on every non-browser gate, not ticked.** One browser item left: the reset dialog's rendered counts, which need an unoccluded window. Doing the 09:15 reset through the new UI closes both that and F32's end-to-end criterion.

## Open questions

- **The account reset is agreed but not yet run.** It carries Sunday-dated verification rows (₹76,737.96 cash, 8 orders, 4 trades, TCS ×11). Scheduled for today after 09:15, ahead of the market buy — still needs the go-ahead. **No longer an RPC**: F32 shipped the dialog, so it is now a button on `/funds`.
