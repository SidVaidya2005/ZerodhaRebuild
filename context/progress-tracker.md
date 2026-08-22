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
**Last completed:** 24 Order execution function — `place_order`, `execute_order`, `cancel_order`, `reset_account`, plus `market_state`/`market_constants`. 89 tier-2 assertions across two new suites including 500 randomised orders, two tier-3 concurrency tests, and session parity at tier 4. **Four defects found and fixed along the way**, three of them in already-shipped code: §7's cover row double-debited entry charges, `reserve_margin` made covers unaffordable, `execute_order` wrote two CHARGES rows on a short entry, and the capped-loss path credited the shortfall on top of a partial debit
**In progress:** nothing
**Next:** 25 Order ticket UI — the first Phase 4 feature with a screen. The engine is complete and proven in SQL; F25 builds the ticket, F26 wires the Server Action to `place_order`, whose `(order_id, status, rejection_reason)` composite is what lets the action tell a fill from a rejection. `modify_order` is still unbuilt and filed against F27

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
- [x] 24 Order execution function
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

- **Reported P&L and settled cash are different numbers on a short cover.** §7 settled from `average_price`, which is net of entry charges that were already debited at entry — so every cover debited them twice and identity 1 failed. The cash row now uses the gross `entry_reference_price`; `trades.realised_pnl` keeps the net average per §9. §12.11 narrowed to say what it meant: the *reported* P&L never reads the gross average. (F24)

- **A cover is reserved from its collateral, not from cash.** F23's `reserve_margin` asked for `quantity × price` on every buy, so a user who shorted most of their balance could not close their own position — the money was in `used_margin` by construction. Symmetric to the sell rule it already had. Found by F24 reading the cash path, not by a test. (F23, fixed at F24)

- **`now()` ties every row a transaction writes, and three columns ordered by it.** `fund_ledger.created_at`, `trades.traded_at` and `orders.placed_at` are all `clock_timestamp()` now. Not cosmetic: F28's matcher fills every crossed order in one run and F29's square-off closes every position in one, so Reports would order a whole square-off arbitrarily. (F23, F24)

- **`place_order` returns `(order_id, status, rejection_reason)`, not a bare uuid.** A business rejection returns normally per `code-standards.md`, so `error` is null and the Server Action cannot tell a fill from a rejection; raising instead would roll back the REJECTED row §4 and the Orders page both require. `architecture.md`'s example and `toRejectionCode`'s role are corrected in the same change. (F24)

- **Session logic gets a second implementation, in Postgres, and tier 4 proves the two equal.** `market_state(at)` reads `market_holidays` so `place_order` can reject a MARKET order with `MARKET_CLOSED`. A Server Action gate would sit outside the security boundary — `place_order` is granted to `authenticated`, so anyone calling the RPC directly would trade at any hour. `architecture.md`'s "one place decides market time" invariant is amended to name both rather than quietly broken. (F24)

- **`execute_order` enforces §5's staleness window**, with `market_constants()` mirroring `_shared/market-constants.ts` exactly as `charge_rates()` mirrors the rate table and tier 4 comparing them. Without it "never filled at a stale price" has no implementation anywhere and a Monday fill can execute against Friday's close. (F24)

- **A fill crossing zero apportions its charges pro-rata by quantity**, closing share rounded and the remainder to the opening leg so the two always sum to `trades.charges`. §8 never covered the case; rejecting it would make F23's shorting-excess reservation and flip-to-long path unreachable. (F24)

- **A short reserves its collateral up front, not its notional.** `trading-contract.md` §6 reserved 100% of notional while collateral at fill is 120% plus closing charges, so delta was positive by a fifth of the trade on *every* short — which made §7's short-entry `MARGIN_RELEASE` row a block, falsified §6's own claim that the top-up is the gap-up case, and let a user place a maximum-size short that its own fill then rejected. A short-opening MIS sell now reserves the §6 formula evaluated at the reservation price; buys are unchanged. (F23)

- **`transfer_margin_to_position` runs *before* F24 writes the trade and the position**, taking `(p_order_id, p_fill_price, p_actual_charges)` and returning `(ok, required_collateral, entry_reference_price)`. On a shortfall it releases the whole reservation itself and returns `ok = false`, so nothing needs unwinding — the alternative was a raised exception and a plpgsql subtransaction rollback. It also computes the gross `entry_reference_price`, making the collateral module the only writer of that concept and §12.11 structural. (F23)

- **A fourth function, `recompute_position_collateral`, owns the release side.** Transfer is the block path, recompute is the release path, and both call one `IMMUTABLE` `short_collateral_requirement` — which is what makes §6's "one collateral formula, everywhere" true structurally rather than by care. Without it F23's partial-cover tests would assert against code that does not exist until F24. (F23)
