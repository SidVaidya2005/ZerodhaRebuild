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

**Phase:** Phase 5 — Portfolio Pages. **The Phase 4 checkpoint is closed and ticked** (2026-09-11), journal compacted. **F16 and the Phase 2 checkpoint stay open by decision** — F16 is being finished at the very end of the project, so do not tick it
**Last completed:** **The Phase 4 checkpoint.** The two steps blocked on market hours both ran against a flat account: tier 3's square-off suites (6 files / 10 tests) and §12 identities 7, 9 and 10. Identity 10 was verified on both formulas by replaying each closed position's `average_price` from its opening leg — the position rows are deleted on full close, so it cannot be read back. **Identity 9 failed on the short cover** and was fixed rather than reworded. Three code fixes shipped: `4.00.19` `/orders` keeping an order once it fills, `4.00.20` the collateral release naming its order, `4.00.21` a flip settling its sale before reserving. All four tiers green — tier 1 381, tier 2 22 files with `10-orders` at 107/107, tier 3 10, tier 4 36 — plus typecheck, lint, `format:check` and `build`
**In progress:** Nothing. Always-read budget passing at ~39.8k/40k after demoting the browser-verification lore to `constraints/verification.md`
**Next:** **F33 Stock detail** — `lightweight-charts`, the `candles` / `candle_sync` tables, and the retention logic F15/F16 deferred to it. Read F33's section of `build-plan/phase-5.md` and nothing else of that file. One thing to know first: the Phase 2 checkpoint stays open behind F16

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
- [x] 27 Orders page
- [x] 28 Limit order matching
- [x] 29 MIS auto square-off
- [x] Phase checkpoint — verify Phase 4 — Trading Engine is stable before starting the next phase

### Phase 5 — Portfolio Pages

- [x] 30 Holdings page
- [x] 31 Positions page
- [x] 32 Funds page
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

- **A refused flip must write nothing, and that is what the subtransaction buys.** Hoisting the closing leg's `SELL_CREDIT` above the reservation retirement is what stops a flip being refused for money its own sale provides — but it also means a genuine shortfall can no longer simply set `REJECTED` and return, because the credit would survive and identity 1 would hold over a sale that never happened. §7 permits the reordering outright; the `begin/exception` block is the price of it. (Phase 4 checkpoint)

- **A ledger row that names no order cannot be reconciled, and §12.9 counts exactly those rows.** `recompute_position_collateral` took no order id, so a short cover's collateral release referenced nothing: the INFY short summed to −4708.62 against a true cash effect of −18.19, while the long beside it reconciled to the paisa. The cash was never wrong, only unattributable — and the contract already named `MARGIN_RELEASE` among the rows that must be counted, so the implementation was the loser and was fixed. A signature change means a drop, which discards the ACL Supabase then re-grants. (Phase 4 checkpoint)

- **A page that filters on placement loses a row the moment it transitions.** `/orders` listed `status=OPEN` or `placed_at` today, and an order placed earlier that filled today matched neither — so it vanished rather than moving to Executed. `executed_at` is stamped by every terminal transition, so one condition closes the fill, cancel and reject variants together. The lesson generalises to every dated page Phase 5 still has to build. (Phase 4 checkpoint)

- **The closing-leg guarantee covers pure covers and square-offs, not any order containing a closing leg.** A flip cannot honour it: §1 forbids partial fills, so an uncollateralisable opening leg rejects the whole order. `execute_order`'s comment claimed otherwise; §6 now states the narrow rule, and F29's pure-cover fix still stands beneath it. (Phase 4 checkpoint)

- **A table's scroll region can be entirely correct while its page still scrolls sideways, so the assertion belongs to the page, not the component.** F31's region was focusable, labelled and `relative` — and `/positions` still overflowed 94px, because the shared `TopNav` did; meanwhile `/holdings` overflowed 525px because F30's wrapper never received the `relative` the constraint had already mandated, and F30's own 375px item had been scoped to the region rather than the page. One component-level check passed on four pages that were all broken. Measure `documentElement.scrollWidth` against `clientWidth` **per page**, and re-measure every page after touching shared chrome. (F31, F30, F27)

- **Funds shows realised P&L only, and therefore reads no prices at all.** `Σ trades.realised_pnl` — closed legs net of their closing charges (§9). Including unrealised would drag live quotes onto the page and with them provenance disclosure, the anchor rule and the unpriced-count problem, to restate a figure Dashboard and Holdings already carry; §9 is explicit that realised and unrealised answer different questions. The page being quote-free is a property worth protecting, not an accident. `funds_overview` supplies the sum and the five counts the reset dialog names, so no money figure is computed outside Postgres. (F32)

- **F31's exit places an order and never calls a collateral function directly.** Exit opens the pre-filled ticket and the close goes through `place_order` → `execute_order`, which takes `orders → funds → positions`. `recompute_position_collateral` inverts the last pair and is safe *only* because `execute_order` holds both rows before calling it — so the shortcut of releasing collateral from a Server Action is exactly the ABBA cycle `constraints.md` names F31 as the likely source of. The page therefore adds no new mutation path at all, and `margin.ts` — already position-aware and proven equal to the engine at tier 4 — needs no change for a covering buy. (F31)

- **The Edge Function gets the same testing seam every other layer already has.** `market_state(p_at)` and `square_off_mis(p_at)` both take a timestamp so their boundaries are testable; `market-tick` took none, which is what queued seven verification items behind a weekday 09:15–15:30 window and made the 15:20 square-off a once-a-day shot. `session_at` in the request body overrides the session gate and the square-off boundary **only** — `now` still stamps every recorded timestamp, so `fetched_at` stays true and §5's staleness window keeps meaning what it says. Read after the secret check, so it is exactly as restricted as the Vault credential, and answered with `sessionOverride: true` so an overridden run is never mistaken for a real one in `net._http_response`. **It does not open `place_order`**, whose gate is Postgres `market_state`. (Phase 4 checkpoint)

- **A surface that renders the *anchor* must not describe it with `provenanceOf`.** That helper derives `isInterpolated` from the store — `quote.ltp !== quote.anchor` — so it reports whatever the tween is doing, not what the caller chose to render. Every monetary surface renders the anchor by invariant, so passing it into `PriceWithProvenance` announces "interpolated" over a figure that is literally the last reported price. F21's tiles never hit it because they render no single-symbol price; F30 is the first that does, and F31 and F33 are next. `anchorProvenance()` is the fix, and it takes the three fields it reads rather than a whole `LiveQuote`, because the F19 re-render rule means its callers never hold one. (F30)

- **`square_off_mis` locks the user's `funds` row before the position row, matching `execute_order`.** It holds the position lock across the `execute_order` call it makes, and `execute_order` takes funds first — so the re-read added in `4.29.01` made this the one path in the system that inverted the pair, and any concurrent order on the same user and symbol closed an ABBA cycle. The sweep lost, `exception when others` counted the `40P01` as a fault, and the position stayed open past 15:20 against an invariant that states it cannot. **A guard added under a lock is also a change to lock order** — check it against every other holder of the same rows. (F29)
