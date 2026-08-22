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
**Last completed:** 18 Watchlist sidebar — rows with LTP and a change computed in a `security_invoker` view, a deterministic search palette over a preloaded universe, remove and chart actions, accessible move-up/move-down reorder, and `touch_symbol_demand` marking what is on screen
**In progress:** 16 Market tick Edge Function and schedule — built, deployed and green except for two session-dependent items that need Monday; see the blocked note below
**Next:** 19 Realtime quote store and tick interpolation — the Zustand store, one Supabase Realtime channel mounted in the terminal layout, and a `requestAnimationFrame` driver. F18's rows are deliberately static, so this is where they start moving; note that nine of the ten seeded symbols still have no `quotes` row at all

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

- **The watchlist view was filtering twice, and the untested filter was the one that mattered.** It carried both a hand-written `where user_id = auth.uid()` and `security_invoker`; falsification showed the predicate alone was holding the line, leaving the invoker setting free to be dropped with every test still green. The predicate is application code doing RLS's job, so it was removed — `security_invoker` is now load-bearing and falsifiable. (F18)
- **Watchlist search filters a preloaded universe in `cmdk`; no trigram index, no migration, no round trip per keystroke.** 200 rows of symbol/name/exchange is ~12KB and Postgres seq-scans a table that small whatever index sits on it, so the index the build plan called for would never have been used. (F18)
- **Reorder ships as move-up / move-down, not drag.** Drag alone is unreachable by keyboard and the project has no drag-and-drop dependency; buttons are accessible by construction and write the same `sort_order`. Drag becomes a later enhancement over the same Server Action, and F38 inherits a passing surface rather than a filed gap. (F18)
- **The watchlist's change is computed in Postgres, in a `security_invoker` view.** `CLAUDE.md` puts money arithmetic in Postgres and leaves TypeScript formatting it; the view also makes the panel one round trip and gives F30's holdings day change and F33's header the same shape to read. (F18)
- **B and S are not built in F18.** Order entry is F25/F26 and has no destination yet, so shipping the buttons would mean two dead controls — the same call F17 made for the index strip. The chart action links to `/stocks/[symbol]`, which F17 stubbed. (F18)
- **The watchlist rail lives in the layout beside `<main>`; only the sheet trigger lives in the nav.** Exporting one component that rendered both shells put the 288px `aside` inside the header's 64px flex row, where it was clipped to the nav's height and pushed the brand, index strip and pill until they wrapped. `WatchlistRail` and `WatchlistSheet` are separate exports over one shared `WatchlistPanel`, so F18 fills the panel once and both breakpoints follow. (F17)
- **The index strip ships as a slot with no values, and index data moves to F21.** NIFTY 50, SENSEX and BANK NIFTY exist nowhere in the data — `instruments` holds 200 NSE equities, so there is no row, no quote and no simulator anchor for any of them, and SENSEX is BSE against an NSE-only scope. Three fabricated numbers in the most prominent chrome on the page is the worst place in the app to invent data. `project-overview.md` already puts an index strip on the Dashboard, so F21 gets it. (F17)
- **The market-status pill is F17's, and it recomputes on a timer.** F20 turns out to be only the data-source badge — its UI and Logic bullets never mention market status despite its title. Server-rendering the pill once would leave a tab open past 15:30 still reading OPEN, so the server passes the holiday set as a `string[]` and a client component calls the same pure `marketStatusAt` the tick gates on. (F17)
- **The `(terminal)` layout checks the session once and pages trust it.** `dashboard/page.tsx` re-checked it itself on the argument that the proxy is only a convenience; with a layout that argument buys nothing, because every page beneath reads through RLS-scoped queries that return nothing without a session. One `getUser()` per navigation instead of one per page, and no future page can forget to check. (F17)
- **The sidebar collapses via shadcn `Sheet`.** Already installed and unused, matches DESIGN.md's full-screen sheet under 768px, and F18 needs the sidebar to be a client component for search and reorder regardless. (F17)
