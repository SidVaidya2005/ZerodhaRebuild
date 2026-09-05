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

**Phase:** Phase 5 — Portfolio Pages, opened ahead of the Phase 4 checkpoint because F27 and F28 are blocked on market hours and F30 was not. **F16 and the Phase 2 checkpoint stay open by decision** — F16 is being finished at the very end of the project, so do not tick it
**Last completed:** 29 MIS auto square-off. 30 Holdings page is **built and unticked**: every automated tier is green — `pnpm test` 330, `10-orders.sql` 79/79 with the new §M, lint, typecheck and build clean — and both new assertions were proven falsifiable against a deliberately broken build. It needed no migration and no new SQL, because F21's `portfolio_holdings` and `portfolio_summary` already compute every figure on it
**In progress:** 27 Orders page (three of five browser items pass), 28 Limit order matching (the live fill is unproven), and 30's four browser items. All three want the same errand. The account currently holds nothing, so F30's populated table cannot be rendered at all until a CNC buy fills — which needs market hours, correcting the plan's claim that F30's browser checks did not
**Next:** Monday 2026-09-07 in market hours — F27's last two browser items, F26's filled path, F28's live fill, and then F30's four on the holding that fill creates. One errand on one account. Then the Phase 4 checkpoint: `/code-review` over the phase diff and the §12 identity reconciliation. The remaining `40P01` question is narrowed to a counter split and deferred to Phase 5, recorded under F29 in `build-plan/phase-4.md`

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
- [x] 29 MIS auto square-off
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

- **A surface that renders the *anchor* must not describe it with `provenanceOf`.** That helper derives `isInterpolated` from the store — `quote.ltp !== quote.anchor` — so it reports whatever the tween is doing, not what the caller chose to render. Every monetary surface renders the anchor by invariant, so passing it into `PriceWithProvenance` announces "interpolated" over a figure that is literally the last reported price. F21's tiles never hit it because they render no single-symbol price; F30 is the first that does, and F31 and F33 are next. `anchorProvenance()` is the fix, and it takes the three fields it reads rather than a whole `LiveQuote`, because the F19 re-render rule means its callers never hold one. (F30)

- **`square_off_mis` locks the user's `funds` row before the position row, matching `execute_order`.** It holds the position lock across the `execute_order` call it makes, and `execute_order` takes funds first — so the re-read added in `4.29.01` made this the one path in the system that inverted the pair, and any concurrent order on the same user and symbol closed an ABBA cycle. The sweep lost, `exception when others` counted the `40P01` as a fault, and the position stayed open past 15:20 against an invariant that states it cannot. **A guard added under a lock is also a change to lock order** — check it against every other holder of the same rows. (F29)

- **A guard's race test must assert what the sweep *returns*, not only what it left behind.** `squareoff.race.test.ts` passed against a build with `square_off_mis`'s position re-read removed, because on that build the two runs deadlocked, `exception when others` swallowed the `40P01`, and the naked short was never written — an identical end state reached for the opposite reason. Asserting the returned `(squared, faulted)` pair is what made it falsifiable, and restaging it on the funds row later made it fail on the hazard itself. (F29)

- **`square_off_mis` re-reads the position under its own lock before writing an exit order.** Without it two overlapping runs both select a position, the first closes it, and the second's exit order executes against nothing — which `execute_order` correctly reads as *opening* a short, so the 15:20 job could create a naked position with collateral blocked against it. Reproduced deterministically before the guard was written. (F29)

- **A closing leg is never rejected for want of funds, and `execute_order` did not implement that.** Its solvency check demanded `available_cash >= charges` even with no opening leg, while the collateral about to pay them sits in `positions.blocked_margin` where the check cannot see it — so an account already floored at zero by one capped square-off had its *second* underwater short rejected and stranded past 15:20. Fixed with `v_open_quantity > 0`; the code comment had claimed this was already true. (F29)

- **`match_open_orders` wraps each `execute_order` call in its own subtransaction.** A genuine fault rolls back that order alone, logs `raise warning`, and the run continues, because the alternative lets one poisoned order block every user's fills on every tick until someone notices. Business rejections never reach the handler — `execute_order` files those as `REJECTED` rows and returns normally. (F28)

- **The matcher's selection is an optimisation, not a correctness boundary.** `execute_order` already re-checks `status = 'OPEN'` *and* limit eligibility under the row lock, so the `WHERE` clause exists only to avoid taking locks on orders that would decline anyway — a bug in it can cost a fill a tick, but cannot cause a wrong one. That is also why the matcher takes no symbol argument: sweeping everything is simpler and catches an order placed between ticks that already crosses. (F28)

- **The Orders page lists today's orders plus every `OPEN` order, whatever its age.** A strict today filter drops a Friday limit order from the terminal on Monday while it is still holding margin, and F34 covers completed *trades* rather than orders — so a cancelled order from last week would have no surface at all. The open-order exemption is what makes the date filter safe, and it costs one `.or()` clause. (F27)

- **`modify_order` reuses `reserve_margin` inside a plpgsql subtransaction rather than recomputing the requirement.** `release_margin` → write the new terms → `reserve_margin`, in a block with an `EXCEPTION` clause: a failed re-reservation raises inside the block, rolls back only that block, and the function returns `(false,'INSUFFICIENT_FUNDS')` normally, leaving the order on its original terms and its original reservation. Computing the requirement in place would be a second copy of §6, which `constraints.md` rules out, and the release must come first because `reserve_margin` returns early when `blocked_margin <> 0`. (F27)

- **Realtime on `orders` calls `router.refresh()` rather than patching client state.** Orders are server state and never enter Zustand, and a refresh also picks up the cash and margin the same fill moved — which a row-level patch would leave stale in the header beside a row that had updated. The channel still filters `user_id` server-side: RLS scopes delivery, but an unfiltered subscription has every row delivered to and authorised for every subscriber. (F27)
