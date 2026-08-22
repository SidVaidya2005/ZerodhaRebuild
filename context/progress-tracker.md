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
**Last completed:** 22 Charge calculator — `charge_rates()` and `calculate_charges()` in Postgres, proven byte-equal to F06's TypeScript estimator over 132 inputs by a new read-only **tier 4** (`pnpm test:parity`), falsified by perturbing a rate. Both Phase 1 carried-over items closed and falsified. §3's rates re-verified against zerodha.com/charges, all unchanged
**In progress:** nothing
**Next:** 23 Margin reservation and release — `reserve_margin`, `release_margin` and `transfer_margin_to_position` per `trading-contract.md` §6, including the six-step top-up path and the rule that a collateral move writes **no** ledger row because no cash changes. All three internal-only. The reconciliation identities in §12 are what the tests assert

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
- [ ] 23 Margin reservation and release
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

- **The charge parity test gets a fourth, read-only test tier.** Proving the TypeScript estimator and the Postgres calculator equal needs both in one process, and none of the three tiers can host it: tier 1 has no database, tier 2 is SQL-only, and tier 3 is gated behind `ALLOW_RACE_TESTS` because it commits. `calculate_charges` writes nothing, so `pnpm test:parity` runs read-only and joins `test:all` — putting it in tier 3 would leave the feature's headline test skipped inside a green run. (F22)

- **Postgres holds the charge rates in one `IMMUTABLE` `charge_rates()` composite, not in literals or a table.** Postgres inlines immutable SQL functions, so there is no per-call cost when F24 calls the calculator inside `execute_order` under a row lock, and the parity test can read the rates directly rather than only inferring them from results. A table would have made the function `STABLE` and put a lookup inside the locked transaction. (F22)

- **`calculate_charges` returns `(total numeric, breakdown jsonb)`.** F24 does `select … into` and inserts both `trades.charges` and `trades.charge_breakdown` with no cast on the money path. The jsonb keys are snake_case and were already pinned by the `trades_breakdown_has_all_components` CHECK constraint, so they were never this feature's choice to make. (F22)

- **The index strip is a derived composite over our own priced universe, never a named index.** NIFTY 50 and BANK NIFTY have no row, quote or simulator anchor anywhere and Yahoo is deferred to the end of the project, so the strip reports an equal-weighted mean of per-symbol day change % with its **constituent count on screen** — a breadth statistic, labelled as one. Simulating an index level instead would have invented data in the most prominent chrome on the page. (F21)

- **Dashboard money tiles jump on the anchor and never tween.** `architecture.md` contradicted itself: line 517 listed the dashboard summary tiles as an ambient surface that may interpolate, while the invariant says every monetary total renders the server anchor. The invariant wins and line 517 is corrected in the same change — the index strip stays ambient. Tiles still recompute from anchors so they do not sit frozen beside a ticking watchlist, display-only exactly as F19's `dayChange`. (F21)

- **Day's P&L is `Σ quantity × (ltp − prev_close)` over holdings**, recorded in `trading-contract.md` §9, which defined realised and unrealised P&L but never this one. It is the same basis as the watchlist's change column, so the two cannot disagree on screen, and it needs no read of `trades` — which matters because no trading engine exists to write them yet. (F21)

- **The dashboard aggregates holdings only; MIS positions stay on `/positions`.** Portfolio value is `available_cash + Σ(quantity × ltp)`, invested is `Σ(quantity × average_price)` with charges already capitalised per §8, and overall P&L is unrealised only. Kite's own split, and it keeps the intraday sign handling out of a donut that would have to draw a negative slice. (F21)

- **A backgrounded tab dispatches no focus events and runs no animation frames.** `element.focus()` sets `document.activeElement` and fires nothing — not even native listeners attached directly. Three features have now lost time to this family: F17's frozen exit animation, F19's frozen `requestAnimationFrame`, F20's focus handlers. Check `document.visibilityState` **first** whenever an automated browser check says an interaction does nothing. (F20)

- **One ticking clock provided from the terminal layout, so the badge and every price read the same instant.** Otherwise a row can render DELAYED under a badge saying STALE — a contradiction the visitor can see. **F17's pill keeps its own timer**, because it deliberately lands *on* the session boundary rather than up to a heartbeat late. (F20)

- **Only symbols currently rendering a price feed the data-source badge.** `worstSource([])` returns STALE by design, so counting the symbols with no quote row would pin the badge to STALE on account of absent data and say nothing about the prices actually visible. A row showing an em dash makes no claim and cannot be dishonest. (F20)
