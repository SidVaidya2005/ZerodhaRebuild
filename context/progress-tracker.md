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

**Phase:** Phase 6 — Polish & Ship. No numbered feature started yet; `constraints.md` was split into a core plus reference halves first (6.00.02). Phase 5 is closed and compacted. **F16 and the Phase 2 checkpoint stay open by decision** — F16 is being finished at the very end of the project, so do not tick it
**Last completed:** the **Phase 5 checkpoint**. All four tiers green (516 tier-1 / 25 pgTAP files / 10 race / 36 parity) plus lint, typecheck, format and build. The phase-diff review's **seven findings were all fixed**, each with a test falsified against the code it replaced, and §11 reset was finally proven from `/settings` — closing Phase 5's last open `**Verify:**` line. Phase 5 is compacted; **every Phase 5 feature and the checkpoint are ticked**
**In progress:** Nothing
**Next:** **Phase 6 F36 States, skeletons, and error boundaries**, which also owns the missing `loading.tsx`/`error.tsx` across all eight terminal segments — `code-standards.md` states the rule and records that F36 is where it becomes true. Two items are filed for Phase 6 and not yet started: `text-brand`'s 1.37:1 contrast on light (F38) and the 768–1024px terminal having no page navigation (F37). **Before F39 deploys**, either Yahoo lands or `/` and `/about` are reconciled — every price badges `SIMULATED` today. **One finding is open from the split:** `trading-contract.md` §13's money sweep has never covered `constraints.md`, so `constraints/trading.md`'s charge and margin rationale sits outside it

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
- [x] 35 Profile and settings
- [x] Phase checkpoint — verify Phase 5 — Portfolio Pages is stable before starting the next phase

### Phase 6 — Polish & Ship

- [ ] 36 States, skeletons, and error boundaries
- [ ] 37 Responsive pass
- [ ] 38 Accessibility pass
- [ ] 39 Deploy
- [ ] 40 README, demo, and handoff
- [ ] Phase checkpoint — verify Phase 6 — Polish & Ship is stable before starting the next phase

---

## Key Decisions

- **`constraints.md` is now a core plus reference halves, and the always-read set has room again.** Five topics that bind only one kind of work — money and the order engine, market data, testing, security, marketing — moved to `context/constraints/` behind triggers in `CLAUDE.md`, taking the always-read set from 39,770 to 31,807 of 40,000. Accessibility, theming, shadcn/ui and Next.js behaviour stayed, because Phase 6 is UI polish and they bind every change in it. Adding a constraint now means first asking which side of the line it belongs on. (6.00.02)

- **A preference that must follow the account is applied client-side, because `next-themes` accepts no server value.** Its injected script reads `localStorage` and `setTheme` is the only write path (confirmed against Context7), so the terminal layout passes `profiles.theme` down and a client component calls `setTheme` once per full load. That leaves the library sole owner of the class *and* the storage key; the price is one frame of the wrong theme on a browser that has never seen this account, inside the terminal only. A blocking script would remove that frame by hand-writing a key the library owns and racing its hydration. (F35)

- **Both terminal toggles persist, the marketing one cannot, and the `profiles` grant narrows in the same change.** Reading a session in the public header would force dynamic rendering on every marketing page (F12), so `SiteHeader` stays `localStorage`-only — and if the top-bar toggle did not persist, the layout's stored value would silently revert it on the next full load. F35 is also the first feature to write `profiles`, so it is where `grant select, update` narrows to `update (theme)`, which today still lets a user rewrite their own `client_id` by direct PostgREST call. (F35)

- **A read that produces a file is a route handler, not a Server Action.** `/reports/export` becomes the third entry on `code-standards.md`'s closed two-handler list, amended in the same change rather than left contradicting the code. The Server Action rule governs *mutations*; routing a CSV through one would cost a `'use client'` Blob dance, a JS-only download, and the whole export squeezed through an action payload — to protect a rule it does not break. (F34)

- **A date filter compares a `date` column the view computes, so no caller does timezone arithmetic.** `trade_history.traded_on` is `(traded_at at time zone 'Asia/Kolkata')::date`. F33 lost a session to the mirror image of this — Lightweight Charts treating every instant as UTC — and a dated page is where it recurs: the boundary is one `at time zone` away from silently filing a 23:45 IST trade on the previous day. (F34)

- **A simulated series must be reproducible, or the chart rewrites its own past.** Candles are seeded from `(symbol, interval, ts)`, so each regenerates byte-identical and a refresh appends without overwriting; a free-running walk would show a different year of history on every visit. **The forming bar is the one exception and closes on `ltp`** — the Phase 5 checkpoint corrected an earlier `prev_close` anchor here, which closed *today's* bar at yesterday's close and produced the chart-header contradiction this rule exists to prevent. (F33, corrected at the Phase 5 checkpoint)

- **Retention is `prune_candles()` on its own `pg_cron`, not a call inside `market-tick`.** `boundary-patterns.md` put it in the tick handler, but that host is F16 — deliberately parked until the end of the project — and a prune living there can only be verified by deploying and waiting. As SQL it is pure data work with no HTTP dependency and is testable at tier 2. The losing document is corrected in the same change. (F33)

- **The chart draws once per server render; only the header ticks.** The `FIVE_MIN` TTL means the series is at best five minutes fresh, so a live-growing rightmost bar would imply precision the pipeline does not have. It also keeps a canvas out of F19's trap, where subscribing to the quote store re-renders a component ~60×/s for the length of the interpolation window. (F33)

- **A refused flip must write nothing, and that is what the subtransaction buys.** Hoisting the closing leg's `SELL_CREDIT` above the reservation retirement is what stops a flip being refused for money its own sale provides — but it also means a genuine shortfall can no longer simply set `REJECTED` and return, because the credit would survive and identity 1 would hold over a sale that never happened. §7 permits the reordering outright; the `begin/exception` block is the price of it. (Phase 4 checkpoint)

- **A ledger row that names no order cannot be reconciled, and §12.9 counts exactly those rows.** `recompute_position_collateral` took no order id, so a short cover's collateral release referenced nothing: the INFY short summed to −4708.62 against a true cash effect of −18.19, while the long beside it reconciled to the paisa. The cash was never wrong, only unattributable — and the contract already named `MARGIN_RELEASE` among the rows that must be counted, so the implementation was the loser and was fixed. A signature change means a drop, which discards the ACL Supabase then re-grants. (Phase 4 checkpoint)

