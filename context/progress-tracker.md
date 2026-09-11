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

**Phase:** Phase 5 — Portfolio Pages. **F16 and the Phase 2 checkpoint stay open by decision** — F16 is being finished at the very end of the project, so do not tick it
**Last completed:** **F33 Stock detail.** The candle pipeline F15 and F16 both deferred here: a `CandleProvider` seam, a deterministic simulator seeded per bar, `getCandles` with per-interval TTLs, and `prune_candles()` on its own `pg_cron`. Plus `lightweight-charts` 5.2.1 and the page. All gates green — `pnpm test` 433, `pnpm test:db` 23 files (`18-candles.sql` 14/14), 36 parity, lint/typecheck/format/build clean — and every Verify item confirmed in a signed-in browser
**In progress:** Nothing. Always-read budget ~39.8k/40k
**Next:** **F34 Reports and trade history.** One thing F33 leaves behind: Yahoo candles are still unwritten behind the seam, and `library-docs.md`'s unverified candle-response-shape TODO is deliberately still open

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
- [x] 33 Stock detail page
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

- **A simulated series must be reproducible, or the chart rewrites its own past.** F33's candles are seeded from `(symbol, interval, ts)`, so any candle regenerates byte-identical and a TTL refresh appends without overwriting; the daily series is anchored to `quotes.prev_close`, the same anchor the live quote simulator walks from, so the chart and the header cannot contradict each other. A free-running walk would show a different year of history on every visit — fabricated data that disagrees with itself, which is the thing the provenance rules exist to prevent. (F33)

- **Retention is `prune_candles()` on its own `pg_cron`, not a call inside `market-tick`.** `boundary-patterns.md` put it in the tick handler, but that host is F16 — deliberately parked until the end of the project — and a prune living there can only be verified by deploying and waiting. As SQL it is pure data work with no HTTP dependency and is testable at tier 2. The losing document is corrected in the same change. (F33)

- **The chart draws once per server render; only the header ticks.** The `FIVE_MIN` TTL means the series is at best five minutes fresh, so a live-growing rightmost bar would imply precision the pipeline does not have. It also keeps a canvas out of F19's trap, where subscribing to the quote store re-renders a component ~60×/s for the length of the interpolation window. (F33)

- **A refused flip must write nothing, and that is what the subtransaction buys.** Hoisting the closing leg's `SELL_CREDIT` above the reservation retirement is what stops a flip being refused for money its own sale provides — but it also means a genuine shortfall can no longer simply set `REJECTED` and return, because the credit would survive and identity 1 would hold over a sale that never happened. §7 permits the reordering outright; the `begin/exception` block is the price of it. (Phase 4 checkpoint)

- **A ledger row that names no order cannot be reconciled, and §12.9 counts exactly those rows.** `recompute_position_collateral` took no order id, so a short cover's collateral release referenced nothing: the INFY short summed to −4708.62 against a true cash effect of −18.19, while the long beside it reconciled to the paisa. The cash was never wrong, only unattributable — and the contract already named `MARGIN_RELEASE` among the rows that must be counted, so the implementation was the loser and was fixed. A signature change means a drop, which discards the ACL Supabase then re-grants. (Phase 4 checkpoint)

- **A page that filters on placement loses a row the moment it transitions.** `/orders` listed `status=OPEN` or `placed_at` today, and an order placed earlier that filled today matched neither — so it vanished rather than moving to Executed. `executed_at` is stamped by every terminal transition, so one condition closes the fill, cancel and reject variants together. The lesson generalises to every dated page Phase 5 still has to build. (Phase 4 checkpoint)

- **The closing-leg guarantee covers pure covers and square-offs, not any order containing a closing leg.** A flip cannot honour it: §1 forbids partial fills, so an uncollateralisable opening leg rejects the whole order. `execute_order`'s comment claimed otherwise; §6 now states the narrow rule, and F29's pure-cover fix still stands beneath it. (Phase 4 checkpoint)

- **A table's scroll region can be entirely correct while its page still scrolls sideways, so the assertion belongs to the page, not the component.** F31's region was focusable, labelled and `relative` — and `/positions` still overflowed 94px, because the shared `TopNav` did; meanwhile `/holdings` overflowed 525px because F30's wrapper never received the `relative` the constraint had already mandated, and F30's own 375px item had been scoped to the region rather than the page. One component-level check passed on four pages that were all broken. Measure `documentElement.scrollWidth` against `clientWidth` **per page**, and re-measure every page after touching shared chrome. (F31, F30, F27)

- **Funds shows realised P&L only, and therefore reads no prices at all.** `Σ trades.realised_pnl` — closed legs net of their closing charges (§9). Including unrealised would drag live quotes onto the page and with them provenance disclosure, the anchor rule and the unpriced-count problem, to restate a figure Dashboard and Holdings already carry; §9 is explicit that realised and unrealised answer different questions. The page being quote-free is a property worth protecting, not an accident. `funds_overview` supplies the sum and the five counts the reset dialog names, so no money figure is computed outside Postgres. (F32)

- **The Edge Function gets the same testing seam every other layer already has.** `market_state(p_at)` and `square_off_mis(p_at)` both take a timestamp so their boundaries are testable; `market-tick` took none, which is what queued seven verification items behind a weekday 09:15–15:30 window and made the 15:20 square-off a once-a-day shot. `session_at` in the request body overrides the session gate and the square-off boundary **only** — `now` still stamps every recorded timestamp, so `fetched_at` stays true and §5's staleness window keeps meaning what it says. Read after the secret check, so it is exactly as restricted as the Vault credential, and answered with `sessionOverride: true` so an overridden run is never mistaken for a real one in `net._http_response`. **It does not open `place_order`**, whose gate is Postgres `market_state`. (Phase 4 checkpoint)

