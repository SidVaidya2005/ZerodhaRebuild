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
**Last completed:** 20 Data source badge and provenance — the shell badge summarising the worst source among the prices actually on screen, per-price provenance announced to screen readers as well as shown on hover, STALE muting, and one shared clock so freshness is derived rather than frozen
**In progress:** 16 Market tick Edge Function and schedule — built, deployed and green except for two session-dependent items that need Monday; see the blocked note below
**Next:** 21 Dashboard home — portfolio value, day P&L, the index strip with real data at last, a top-10 holdings donut and recent orders. `PriceWithProvenance` exists for every price it renders, and the index strip has been a labels-only slot since F17 waiting for this

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

- **A backgrounded tab dispatches no focus events and runs no animation frames.** `element.focus()` sets `document.activeElement` and fires nothing — not even native listeners attached directly. Three features have now lost time to this family: F17's frozen exit animation, F19's frozen `requestAnimationFrame`, F20's focus handlers. Check `document.visibilityState` **first** whenever an automated browser check says an interaction does nothing. (F20)
- **One ticking clock provided from the terminal layout, so the badge and every price read the same instant.** Otherwise a row can render DELAYED under a badge saying STALE — a contradiction the visitor can see. **F17's pill keeps its own timer**, because it deliberately lands *on* the session boundary rather than up to a heartbeat late. (F20)
- **Only symbols currently rendering a price feed the data-source badge.** `worstSource([])` returns STALE by design, so counting the symbols with no quote row would pin the badge to STALE on account of absent data and say nothing about the prices actually visible. A row showing an em dash makes no claim and cannot be dishonest. (F20)
- **Provenance is announced, not merely hoverable.** The facts render as `sr-only` text tied to the price by `aria-describedby` as well as in a HoverCard, because hover does not exist on touch and never fires for a screen reader — and the guarantee is that *no* price renders without accessible provenance. (F20)
- **Only STALE prices are muted, not SIMULATED.** Every price in this build is simulated, so muting them all would render the whole terminal grey and the treatment would stop carrying information. The badge and the per-price disclosure carry that honesty instead, which is what `architecture.md` specifies. (F20)
- **Realtime can subscribe successfully and deliver nothing, silently.** It authorises each subscriber against RLS by JWT, and `quotes` is readable by `authenticated` only; the cookie session loads asynchronously, so subscribing before the token exists opens a socket that reports `SUBSCRIBED` and never fires. Await `getSession()` and `realtime.setAuth(token)` before `.subscribe()`, and always pass a status callback so a channel cannot fail in silence. (F19)
- **The interpolation loop tweens between server anchors and invents nothing.** `build-plan.md` described "micro-ticks ... bounded so it never drifts beyond a small band", which is bounded jitter — figures no provider reported and the market never traded at. `architecture.md` → Interpolated values says the loop "moves prices between server anchors" and outranks a build-plan feature, so the build plan was rewritten. (F19)
- **The interpolation bound is an interval, not a band.** The displayed value always lies on the closed segment between the previous and current anchor — strictly stronger than "within X% of the anchor", and testable at tier 1 with no DOM. (F19)
- **The watchlist's day change is recomputed on the client once prices are live.** `library-docs.md`'s `LiveQuote` carries `prevClose` for exactly this. Display-only and never persisted, so `CLAUDE.md`'s money rule — which forbids computing a figure in TypeScript *and storing it* — is untouched; a ticking price beside a frozen change would be the worse outcome. (F19)
- **Rows read `store ?? prop` with the store seeded in an effect.** Server and first client render both use the prop, so the HTML matches — the lesson F17's `serverNow` pill taught — and a symbol with no quote keeps its em dash instead of flashing into existence. (F19)
