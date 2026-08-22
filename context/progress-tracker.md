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
**Last completed:** 19 Realtime quote store and tick interpolation — a Zustand store, one JWT-authenticated Realtime channel mounted in the terminal layout and filtered server-side, and one rAF driver easing each price from its previous anchor to its new one. A SQL update reaches the DOM in well under a second and touches only the affected row
**In progress:** 16 Market tick Edge Function and schedule — built, deployed and green except for two session-dependent items that need Monday; see the blocked note below
**Next:** 20 Data source badge and market status — the shell badge summarising the worst provenance on screen, and per-price provenance on hover. F19 already keeps `provider` and `providerTs` in the store and deliberately stores no `source`, so `deriveSource()` runs on render; the market-status half of this feature was built in F17

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

- **Realtime can subscribe successfully and deliver nothing, silently.** It authorises each subscriber against RLS by JWT, and `quotes` is readable by `authenticated` only; the cookie session loads asynchronously, so subscribing before the token exists opens a socket that reports `SUBSCRIBED` and never fires. Await `getSession()` and `realtime.setAuth(token)` before `.subscribe()`, and always pass a status callback so a channel cannot fail in silence. (F19)
- **The interpolation loop tweens between server anchors and invents nothing.** `build-plan.md` described "micro-ticks ... bounded so it never drifts beyond a small band", which is bounded jitter — figures no provider reported and the market never traded at. `architecture.md` → Interpolated values says the loop "moves prices between server anchors" and outranks a build-plan feature, so the build plan was rewritten. (F19)
- **The interpolation bound is an interval, not a band.** The displayed value always lies on the closed segment between the previous and current anchor — strictly stronger than "within X% of the anchor", and testable at tier 1 with no DOM. (F19)
- **The watchlist's day change is recomputed on the client once prices are live.** `library-docs.md`'s `LiveQuote` carries `prevClose` for exactly this. Display-only and never persisted, so `CLAUDE.md`'s money rule — which forbids computing a figure in TypeScript *and storing it* — is untouched; a ticking price beside a frozen change would be the worse outcome. (F19)
- **Rows read `store ?? prop` with the store seeded in an effect.** Server and first client render both use the prop, so the HTML matches — the lesson F17's `serverNow` pill taught — and a symbol with no quote keeps its em dash instead of flashing into existence. (F19)
- **The watchlist view was filtering twice, and the untested filter was the one that mattered.** It carried both a hand-written `where user_id = auth.uid()` and `security_invoker`; falsification showed the predicate alone was holding the line, leaving the invoker setting free to be dropped with every test still green. The predicate is application code doing RLS's job, so it was removed — `security_invoker` is now load-bearing and falsifiable. (F18)
- **Watchlist search filters a preloaded universe in `cmdk`; no trigram index, no migration, no round trip per keystroke.** 200 rows of symbol/name/exchange is ~12KB and Postgres seq-scans a table that small whatever index sits on it, so the index the build plan called for would never have been used. (F18)
- **Reorder ships as move-up / move-down, not drag.** Drag alone is unreachable by keyboard and the project has no drag-and-drop dependency; buttons are accessible by construction and write the same `sort_order`. Drag becomes a later enhancement over the same Server Action, and F38 inherits a passing surface rather than a filed gap. (F18)
- **The watchlist's change is computed in Postgres, in a `security_invoker` view.** `CLAUDE.md` puts money arithmetic in Postgres and leaves TypeScript formatting it; the view also makes the panel one round trip and gives F30's holdings day change and F33's header the same shape to read. (F18)
- **B and S are not built in F18.** Order entry is F25/F26 and has no destination yet, so shipping the buttons would mean two dead controls — the same call F17 made for the index strip. The chart action links to `/stocks/[symbol]`, which F17 stubbed. (F18)
