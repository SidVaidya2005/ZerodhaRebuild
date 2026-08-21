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

**Phase:** Phase 2 — Data Foundation & Auth
**Last completed:** 14 Instrument and holiday calendar seed — 200 Nifty 200 constituents and 20 published 2026 NSE closures, refreshed by `pnpm fetch:reference` and seeded idempotently by `pnpm seed` through the service role. 8 pgTAP files / 148 assertions green, and F13's default watchlist finally seeds ten rows. Two upstream findings: Twelve Data's free plan carries no NSE symbols at all, and Yahoo IP-blocked this machine for 40+ minutes after a 200-symbol probe
**Next:** 15 Quote provider chain — **and it ships simulator-backed**: Yahoo is deferred to the end of the project by decision, Twelve Data is dropped outright, and NSE's own quote endpoint 403s. The interface, circuit breaker, limiter, provenance helpers and `market-hours.ts` are all still built here, tested against a fake provider. `/` and `/about` promise real prices, so either Yahoo lands or that copy is reconciled before F39 deploys

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
- [ ] 15 Quote provider chain
- [ ] 16 Market tick Edge Function and schedule
- [ ] Phase checkpoint — verify Phase 2 — Data Foundation & Auth is stable before starting the next phase

### Phase 3 — Terminal Shell & Live Prices

- [ ] 17 Terminal shell layout
- [ ] 18 Watchlist sidebar
- [ ] 19 Realtime quote store and tick interpolation
- [ ] 20 Data source badge and market status
- [ ] 21 Dashboard home
- [ ] Phase checkpoint — verify Phase 3 — Terminal Shell & Live Prices is stable before starting the next phase

### Phase 4 — Trading Engine

- [ ] 22 Charge calculator
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

- **Yahoo is deferred to the end of the project, so Phase 3 runs on the simulator.** A 200-symbol validation probe got this machine's IP blocked for over 40 minutes, and with Twelve Data carrying no NSE symbols and NSE's own quote endpoint returning 403, no live source remains. F15 still builds the chain, breaker, limiter and provenance helpers against a fake provider — a real provider drops into a finished chain, not the reverse — and every price badges `SIMULATED`. The open risk is copy: `/` and `/about` promise real prices. (F14)
- **Twelve Data is dropped, not stubbed.** Its free plan returns 404 for every NSE symbol — "available starting with the Grow or Venture plan" — verified against the live API with a real key while `AAPL` returned a quote, so it is an entitlement limit, not a symbol-format problem. A provider that can only ever report unavailable is dead code. (F14)
- **The universe is seeded but unvalidated, and the JSON says so.** `yahoo_validated: false` is recorded in `nifty200.json`, and the probe ships behind `--probe` rather than being deleted, because it is exactly what must run when Yahoo returns. `${symbol}.NS` remains a derivation nothing has confirmed. (F14)
- **Refresh and seed are separate acts.** `fetch-reference-data.mts` hits NSE and Yahoo and rewrites committed JSON; `seed-reference.mts` reads that JSON and upserts. NSE's endpoints are undocumented — its warm-up URL already 403s from this machine while the API call succeeds — so a seed depending on them live breaks unpredictably and offers no diff to review before ~200 rows change. (F14)
- **Every `yahoo_symbol` is probed at refresh time, not sampled.** `${symbol}.NS` is wrong for a few names every year, and Yahoo's clean 200/404 makes full validation cheap; the fetch refuses to write on any failure. The build plan's five-symbol spot check would sample 2.5% of the universe and miss a symbol that never quotes until Phase 5. (F14)
- **The seed authenticates as the service role, not through a test connection string.** `instruments` and `market_holidays` grant `select` only, and seeding reference data is the administrative act that key exists for — `TEST_DATABASE_URL` is named for tests and should not become load-bearing for ops. (F14)
- **`isTradingSession()` coverage moves from F14 to F15**, which is where the function and its unit tests already live. F14 proves the seeded data instead: the published dates are present, correctly dated in `Asia/Kolkata`, and described. Same precedent F13 set when its watchlist check moved here. (F14)
- **The default watchlist seeds by `INSERT…SELECT` against `instruments`.** F14 populates that table and runs *after* F13, so a plain insert would violate `watchlist_items`' foreign key today. Intersecting a fixed symbol list against whatever is seeded is FK-safe by construction, idempotent, and needs no change when F14 lands. The "populated watchlist" half of F13's original verify moves to F14, which is where it becomes checkable. (F13)
- **No backfill: the orphan account is deleted and re-created.** `auth.users` held one row with no profile, created while verifying F12, and a trigger on `auth.users` fires only on insert. Deleting it keeps signup as the only path that ever creates an account — worth more than sparing the test account. (F13)
- **`OPENING_BALANCE` is a literal in SQL, pinned from both sides.** The trigger cannot import `src/lib/constants.ts`, so the migration writes `100000.00` citing `trading-contract.md` §11, pgTAP asserts a bootstrapped account holds exactly that, and a tier-1 test pins the TypeScript constant. Both anchor to the contract rather than to each other, so drift fails a test instead of going unnoticed. (F13)
