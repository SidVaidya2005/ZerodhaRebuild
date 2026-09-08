# In-flight state

> Everything settled lives in `context/`. This file holds only what has no home there.

## In flight

- **F26 — market-buy toast, the last item before the Phase 4 checkpoint.** Not blocked on a decision: it needs a live session, and 2026-09-08 is a trading day (session 09:15–15:30 IST). Plan: at 09:15 reset the account, then a CNC market buy for the toast and its no-reload arrival in Holdings.

## Tried and rejected

- Stubbing `market_state` to force a fill — **moot**, and never done. Nobody had checked the calendar; the item only ever wanted the next trading day, which its own Verify block says.
- Giving `place_order` a `p_at` to mirror the tick seam — rejected on security: it is granted to `authenticated`, so it would let any signed-in user trade outside market hours.
- Dispatching a synthetic `pointerdown/…/click` to open the order ticket — captures a null focus trigger, because Chromium focuses a button only on a trusted mousedown. Promoted to `constraints.md`.
- Trusting `supabase functions deploy` to typecheck — it does not without Docker; it warns and uploads regardless.

## Open questions

- **The account reset is agreed but not yet run.** It carries Sunday-dated verification rows (₹76,737.96 cash, 8 orders, 4 trades, TCS ×11). Scheduled for today after 09:15, ahead of the market buy — still needs the go-ahead, since `reset_account()` has no UI until F32/F35 and would go via RPC.
