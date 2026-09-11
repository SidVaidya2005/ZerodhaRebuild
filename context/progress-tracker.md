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
**Last completed:** **F34 Reports and trade history**, in two commits — the history table with its filters and P&L summary (`5.34.01`), then the CSV export (`5.34.02`). `trade_history` and `traded_symbols` views, `reports_summary`, and `/reports/export` as the third route handler. All gates green: 485 tier-1, 24 pgTAP files with `19-reports.sql` at 16/16, 36 parity, lint/typecheck/format/build clean, verified signed in against direct SQL
**In progress:** **F35 Profile and settings**, planned and confirmed — two commits: the page, then theme persistence (a narrowed `update (theme)` grant, a Server Action, and a client sync). Always-read budget is at its limit, so F35 must evict rather than add
**Next:** the **Phase 5 checkpoint**, which closes the phase

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
- [x] 34 Reports and trade history
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

- **A preference that must follow the account is applied client-side, because `next-themes` accepts no server value.** Its injected script reads `localStorage` and `setTheme` is the only write path (confirmed against Context7), so the terminal layout passes `profiles.theme` down and a client component calls `setTheme` once per full load. That leaves the library sole owner of the class *and* the storage key; the price is one frame of the wrong theme on a browser that has never seen this account, inside the terminal only. A blocking script would remove that frame by hand-writing a key the library owns and racing its hydration. (F35)

- **Both terminal toggles persist, the marketing one cannot, and the `profiles` grant narrows in the same change.** Reading a session in the public header would force dynamic rendering on every marketing page (F12), so `SiteHeader` stays `localStorage`-only — and if the top-bar toggle did not persist, the layout's stored value would silently revert it on the next full load. F35 is also the first feature to write `profiles`, so it is where `grant select, update` narrows to `update (theme)`, which today still lets a user rewrite their own `client_id` by direct PostgREST call. (F35)

- **A read that produces a file is a route handler, not a Server Action.** `/reports/export` becomes the third entry on `code-standards.md`'s closed two-handler list, amended in the same change rather than left contradicting the code. The Server Action rule governs *mutations*; routing a CSV through one would cost a `'use client'` Blob dance, a JS-only download, and the whole export squeezed through an action payload — to protect a rule it does not break. (F34)

- **A date filter compares a `date` column the view computes, so no caller does timezone arithmetic.** `trade_history.traded_on` is `(traded_at at time zone 'Asia/Kolkata')::date`. F33 lost a session to the mirror image of this — Lightweight Charts treating every instant as UTC — and a dated page is where it recurs: the boundary is one `at time zone` away from silently filing a 23:45 IST trade on the previous day. (F34)

- **A simulated series must be reproducible, or the chart rewrites its own past.** F33's candles are seeded from `(symbol, interval, ts)`, so any candle regenerates byte-identical and a TTL refresh appends without overwriting; the daily series is anchored to `quotes.prev_close`, the same anchor the live quote simulator walks from, so the chart and the header cannot contradict each other. A free-running walk would show a different year of history on every visit — fabricated data that disagrees with itself, which is the thing the provenance rules exist to prevent. (F33)

- **Retention is `prune_candles()` on its own `pg_cron`, not a call inside `market-tick`.** `boundary-patterns.md` put it in the tick handler, but that host is F16 — deliberately parked until the end of the project — and a prune living there can only be verified by deploying and waiting. As SQL it is pure data work with no HTTP dependency and is testable at tier 2. The losing document is corrected in the same change. (F33)

- **The chart draws once per server render; only the header ticks.** The `FIVE_MIN` TTL means the series is at best five minutes fresh, so a live-growing rightmost bar would imply precision the pipeline does not have. It also keeps a canvas out of F19's trap, where subscribing to the quote store re-renders a component ~60×/s for the length of the interpolation window. (F33)

- **A refused flip must write nothing, and that is what the subtransaction buys.** Hoisting the closing leg's `SELL_CREDIT` above the reservation retirement is what stops a flip being refused for money its own sale provides — but it also means a genuine shortfall can no longer simply set `REJECTED` and return, because the credit would survive and identity 1 would hold over a sale that never happened. §7 permits the reordering outright; the `begin/exception` block is the price of it. (Phase 4 checkpoint)

- **A ledger row that names no order cannot be reconciled, and §12.9 counts exactly those rows.** `recompute_position_collateral` took no order id, so a short cover's collateral release referenced nothing: the INFY short summed to −4708.62 against a true cash effect of −18.19, while the long beside it reconciled to the paisa. The cash was never wrong, only unattributable — and the contract already named `MARGIN_RELEASE` among the rows that must be counted, so the implementation was the loser and was fixed. A signature change means a drop, which discards the ACL Supabase then re-grants. (Phase 4 checkpoint)

- **A page that filters on placement loses a row the moment it transitions.** `/orders` listed `status=OPEN` or `placed_at` today, and an order placed earlier that filled today matched neither — so it vanished rather than moving to Executed. `executed_at` is stamped by every terminal transition, so one condition closes the fill, cancel and reject variants together. The lesson generalises to every dated page Phase 5 still has to build. (Phase 4 checkpoint)
