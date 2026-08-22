# Progress Tracker

> **Role:** Live build status — what's done, in progress, and next.
> **Read at the start of every session**; **update after every completed feature.**
> **Relates to:** mirrors `build-plan.md` exactly; evicts old decisions to `constraints.md`.

Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

## How this file is maintained

- **Current Status is overwritten, never appended.** It holds three lines describing only the latest state. Do not keep previous statuses here — the record of what happened lives in `build-journal.md`.
- **Progress checkboxes are edited in place** — tick the box for the completed feature. Never restate, duplicate, or re-list the checklist.
- **Key Decisions holds the 10 most recent decisions, newest first.** When adding an 11th, file the oldest bullet under its topic in `constraints.md`, so this section never exceeds 10. Eviction is a move, never a delete — an old decision can still bind.

---

## Current Status

**Phase:** Phase 4 — Trading Engine (Phase 2 remains open on F16 and its own checkpoint, both blocked on a live session)
**Last completed:** 23 Margin reservation and release — six internal-only functions (`short_margin_buffer`, `short_collateral_requirement`, `reserve_margin`, `release_margin`, `transfer_margin_to_position`, `recompute_position_collateral`), 66 tier-2 assertions across two suites including 500 randomised operations, falsified twice. `trading-contract.md` §6/§7 were wrong in four places and were amended first
**In progress:** nothing
**Next:** 24 Order execution function — `place_order`, `execute_order`, `cancel_order`, `reset_account`. F23's functions are what it sequences: retire the reservation **before** writing the trade and position rows, call `transfer_margin_to_position(id, fill_price, charges)` for a fill that opens a short and write back the two figures it returns, and call `recompute_position_collateral(user, symbol, new_qty)` **before** writing a reduced quantity

**Not verified at this checkpoint, and deliberately so:** the build-plan's own Phase 3 criterion is that "ticking works unattended for a full market session". Today is Saturday 2026-08-22 — the market is closed and `pg_cron`'s window is weekdays only, so no unattended session can be observed. The Realtime half *was* verified: a production build, ten client-side navigations across all six terminal pages, exactly one `SUBSCRIBED` and no channel churn, then a live `UPDATE` reaching the browser. The unattended-session half rides along with F16's pending items on Monday

**Blocked until Monday 2026-08-24, first session after 09:15 IST.** F16's last two verify items and the Phase 2 checkpoint's own "prices land on a schedule" both need a live session, and the cron window is weekdays only. Check with one query:
```sql
select max(fetched_at) as newest, count(*) filter (where provider_ts is null) as simulator_rows,
       array_agg(distinct provider) as providers from quotes;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
```
Expect `fetched_at` advancing every minute across the 10 demanded symbols, every row `SIMULATOR` with a null `provider_ts`, and runs a minute apart with no 401s. Then replace the `PENDING` line in F16's journal entry, tick F16, compact the journal and close the phase

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
- [ ] 24 Order execution function
- [ ] 25 Order ticket UI
- [ ] 26 Place order end to end
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

- **A short reserves its collateral up front, not its notional.** `trading-contract.md` §6 reserved 100% of notional while collateral at fill is 120% plus closing charges, so delta was positive by a fifth of the trade on *every* short — which made §7's short-entry `MARGIN_RELEASE` row a block, falsified §6's own claim that the top-up is the gap-up case, and let a user place a maximum-size short that its own fill then rejected. A short-opening MIS sell now reserves the §6 formula evaluated at the reservation price; buys are unchanged. (F23)

- **`transfer_margin_to_position` runs *before* F24 writes the trade and the position**, taking `(p_order_id, p_fill_price, p_actual_charges)` and returning `(ok, required_collateral, entry_reference_price)`. On a shortfall it releases the whole reservation itself and returns `ok = false`, so nothing needs unwinding — the alternative was a raised exception and a plpgsql subtransaction rollback. It also computes the gross `entry_reference_price`, making the collateral module the only writer of that concept and §12.11 structural. (F23)

- **A fourth function, `recompute_position_collateral`, owns the release side.** Transfer is the block path, recompute is the release path, and both call one `IMMUTABLE` `short_collateral_requirement` — which is what makes §6's "one collateral formula, everywhere" true structurally rather than by care. Without it F23's partial-cover tests would assert against code that does not exist until F24. (F23)

- **An MIS sell crossing zero reserves on the shorting excess only** — `quantity − max(net_quantity, 0)`, with estimated charges for the whole order. The quantity that closes an existing long carries no obligation. The contract covered neither this case nor `delta` on a fill that *adds* to a short, whose §6 step 2 formula double-blocked; both are amended. (F23)

- **A short entry writes three ledger rows, not two.** §6 steps 4 and 6 beat §7's summary table: `MARGIN_RELEASE +|delta|`, `MARGIN_RELEASE +actual_charges`, `CHARGES −actual_charges`. Same net cash, but the paired charge rows make "estimated charges are never paid twice" auditable in the ledger rather than netted away inside the function. (F23)

- **The charge parity test gets a fourth, read-only test tier.** Proving the TypeScript estimator and the Postgres calculator equal needs both in one process, and none of the three tiers can host it: tier 1 has no database, tier 2 is SQL-only, and tier 3 is gated behind `ALLOW_RACE_TESTS` because it commits. `calculate_charges` writes nothing, so `pnpm test:parity` runs read-only and joins `test:all` — putting it in tier 3 would leave the feature's headline test skipped inside a green run. (F22)

- **Postgres holds the charge rates in one `IMMUTABLE` `charge_rates()` composite, not in literals or a table.** Postgres inlines immutable SQL functions, so there is no per-call cost when F24 calls the calculator inside `execute_order` under a row lock, and the parity test can read the rates directly rather than only inferring them from results. A table would have made the function `STABLE` and put a lookup inside the locked transaction. (F22)

- **`calculate_charges` returns `(total numeric, breakdown jsonb)`.** F24 does `select … into` and inserts both `trades.charges` and `trades.charge_breakdown` with no cast on the money path. The jsonb keys are snake_case and were already pinned by the `trades_breakdown_has_all_components` CHECK constraint, so they were never this feature's choice to make. (F22)

- **The index strip is a derived composite over our own priced universe, never a named index.** NIFTY 50 and BANK NIFTY have no row, quote or simulator anchor anywhere and Yahoo is deferred to the end of the project, so the strip reports an equal-weighted mean of per-symbol day change % with its **constituent count on screen** — a breadth statistic, labelled as one. Simulating an index level instead would have invented data in the most prominent chrome on the page. (F21)

- **Dashboard money tiles jump on the anchor and never tween.** `architecture.md` contradicted itself: line 517 listed the dashboard summary tiles as an ambient surface that may interpolate, while the invariant says every monetary total renders the server anchor. The invariant wins and line 517 is corrected in the same change — the index strip stays ambient. Tiles still recompute from anchors so they do not sit frozen beside a ticking watchlist, display-only exactly as F19's `dayChange`. (F21)
