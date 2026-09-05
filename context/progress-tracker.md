# Progress Tracker

> **Role:** Live build status — what's done, in progress, and next.
> **Read at the start of every session**; **update after every completed feature.**
> **Relates to:** mirrors the phase files under `build-plan/` exactly; evicts old decisions to `constraints.md`.
> **Read first every session** — it names the current feature, which is what decides the rest of what gets read.

Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

## How this file is maintained

- **Current Status is overwritten, never appended.** It holds three lines describing only the latest state. Do not keep previous statuses here — the record of what happened lives in `build-journal.md`.
- **Progress checkboxes are edited in place** — tick the box for the completed feature. Never restate, duplicate, or re-list the checklist.
- **Key Decisions holds the 10 most recent decisions, newest first.** When adding an 11th, file the oldest bullet under its topic in `constraints.md`, so this section never exceeds 10. Eviction is a move, never a delete — an old decision can still bind.

---

## Current Status

**Phase:** Phase 4 — Trading Engine. **F16 and the Phase 2 checkpoint stay open by decision — F16 is being finished at the very end of the project, so do not tick it.** Two of its verify items are nonetheless now evidenced (2026-09-04): 300 consecutive one-minute ticks refreshing 10 symbols, the gate flipping to `MARKET_CLOSED` exactly at 15:30 IST, 4,803 cron runs since 2026-08-21 all `succeeded` with no 401s, and zero provenance violations in `quotes` — recorded in the journal so the evidence is not gathered twice
**Last completed:** 26 Place order end to end, plus a context-docs restructure (`4.00.02`): `context/` is now read in tiers, cutting session start from >100k tokens to ~36k. `pnpm context:cost` guards the always-read budget and the tracker/constraints split
**In progress:** 27 Orders page — three of its five browser items pass (see below); **two remain**. 28 Limit order matching is **built and green on every check that does not need a live session**: `match_open_orders` applied, wired into the tick after the upsert, `database.ts` regenerated, tier 2 at 19/19 in `13-match-open-orders.sql`, tier 3 at 8, and both falsifiability checks confirmed failing
**Next:** three things wait on **an open market, earliest Monday 2026-09-07**, and they are one errand on one account: F27's modify-refused-on-an-executed-row and its Open→Executed fill without a reload, F26's filled path, and F28's "a limit order placed just off the market fills within two minutes". Only MARKET orders are gated by `market_state`, so a LIMIT order rests fine off-session; prices come from the simulator, so no upstream API is needed for any of it. **Two verification traps, both hit on 2026-09-05:** read `document.visibilityState` first — a minimised window silently stopped delivering the extension's clicks entirely; and a Radix dialog closed in a hidden tab never finishes its exit animation, leaving a `z-50` overlay that swallows every later click

---

## Progress

### Phase 1 — Foundation & Public Site

- [x] 01 Project scaffold and tooling
- [x] 02 Design system and theme tokens
- [x] 03 Public layout shell
- [x] 04 Home page
- [x] 05 About page
- [x] 06 Pricing page
- [x] 07 Support page and contact form
- [x] 08 Legal, error, and not-found pages
- [x] Phase checkpoint — verify Phase 1 — Foundation & Public Site is stable before starting the next phase

### Phase 2 — Data Foundation & Auth

- [x] 09 Test harness
- [x] 10 Database schema: identity and market data
- [x] 11 Database schema: funds, orders, and portfolio
- [x] 12 Google sign-in and route protection
- [x] 13 Account bootstrap on first sign-in
- [x] 14 Instrument and holiday calendar seed
- [x] 15 Quote provider chain
- [ ] 16 Market tick Edge Function and schedule
- [ ] Phase checkpoint — verify Phase 2 — Data Foundation & Auth is stable before starting the next phase

### Phase 3 — Terminal Shell & Live Prices

- [x] 17 Terminal shell layout
- [x] 18 Watchlist sidebar
- [x] 19 Realtime quote store and tick interpolation
- [x] 20 Data source badge and provenance
- [x] 21 Dashboard home
- [x] Phase checkpoint — verify Phase 3 — Terminal Shell & Live Prices is stable before starting the next phase

### Phase 4 — Trading Engine

- [x] 22 Charge calculator
- [x] 23 Margin reservation and release
- [x] 24 Order execution function
- [x] 25 Order ticket UI
- [x] 26 Place order end to end
- [ ] 27 Orders page
- [ ] 28 Limit order matching
- [ ] 29 MIS auto square-off
- [ ] Phase checkpoint — verify Phase 4 — Trading Engine is stable before starting the next phase

### Phase 5 — Portfolio Pages

- [ ] 30 Holdings page
- [ ] 31 Positions page
- [ ] 32 Funds page
- [ ] 33 Stock detail page
- [ ] 34 Reports and trade history
- [ ] 35 Profile and settings
- [ ] Phase checkpoint — verify Phase 5 — Portfolio Pages is stable before starting the next phase

### Phase 6 — Polish & Ship

- [ ] 36 States, skeletons, and error boundaries
- [ ] 37 Responsive pass
- [ ] 38 Accessibility pass
- [ ] 39 Deploy
- [ ] 40 README, demo, and handoff
- [ ] Phase checkpoint — verify Phase 6 — Polish & Ship is stable before starting the next phase

---

## Key Decisions

- **`match_open_orders` wraps each `execute_order` call in its own subtransaction.** A genuine fault rolls back that order alone, logs `raise warning`, and the run continues, because the alternative lets one poisoned order block every user's fills on every tick until someone notices. Business rejections never reach the handler — `execute_order` files those as `REJECTED` rows and returns normally. (F28)

- **The matcher's selection is an optimisation, not a correctness boundary.** `execute_order` already re-checks `status = 'OPEN'` *and* limit eligibility under the row lock, so the `WHERE` clause exists only to avoid taking locks on orders that would decline anyway — a bug in it can cost a fill a tick, but cannot cause a wrong one. That is also why the matcher takes no symbol argument: sweeping everything is simpler and catches an order placed between ticks that already crosses. (F28)

- **The Orders page lists today's orders plus every `OPEN` order, whatever its age.** A strict today filter drops a Friday limit order from the terminal on Monday while it is still holding margin, and F34 covers completed *trades* rather than orders — so a cancelled order from last week would have no surface at all. The open-order exemption is what makes the date filter safe, and it costs one `.or()` clause. (F27)

- **`modify_order` reuses `reserve_margin` inside a plpgsql subtransaction rather than recomputing the requirement.** `release_margin` → write the new terms → `reserve_margin`, in a block with an `EXCEPTION` clause: a failed re-reservation raises inside the block, rolls back only that block, and the function returns `(false,'INSUFFICIENT_FUNDS')` normally, leaving the order on its original terms and its original reservation. Computing the requirement in place would be a second copy of §6, which `constraints.md` rules out, and the release must come first because `reserve_margin` returns early when `blocked_margin <> 0`. (F27)

- **Realtime on `orders` calls `router.refresh()` rather than patching client state.** Orders are server state and never enter Zustand, and a refresh also picks up the cash and margin the same fill moved — which a row-level patch would leave stale in the header beside a row that had updated. The channel still filters `user_id` server-side: RLS scopes delivery, but an unfiltered subscription has every row delivered to and authorised for every subscriber. (F27)

- **A tier-2 suite that empties a reference table must empty its dependants too.** F26 made the app able to write `orders`, and the first real order turned `pnpm test:db` red permanently on `orders_symbol_fkey` — a failing test tier caused by using the product. The deletes roll back, so the fix is cheap; the bug it prevents is a suite whose result depends on what the account holds. (F26)

- **A rejection is `ok:false` with `code` set to the reason; a fault is the only thing that is not a normal return.** `place_order` hands back `REJECTED`, `OPEN` and `COMPLETE` identically, with `error` null in all three. Putting a rejection on the failure branch means every caller uses the one branch it already has and `code-standards.md`'s toast-on-failure rule applies unchanged. The rejected order's id is not returned — F27's page is where one is inspected. (F26)

- **A rejection closes the ticket.** The row is already filed as `REJECTED`; leaving the dialog open would imply it is still editable, and each retry would file another order. F25's inline `failure` state becomes unreachable and goes with it. (F26)

- **The success toast names the fill price, read back rather than returned.** One extra RLS-scoped select on `orders` after a `COMPLETE`. Widening `place_order`'s return would have meant a migration against a function already proven at three tiers, for one string. (F26)

- **F26's filled path is verified on the next trading day, and the feature ships without waiting for it.** Every MARKET order is rejected `MARKET_CLOSED` outside a session, so the rejection paths, the resting LIMIT order, the toasts and the revalidation are all checkable now; only `COMPLETE` waits. The fill itself is already proven at tiers 2–4. (F26)

