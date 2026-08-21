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
**Last completed:** 15 Quote provider chain — NSE session logic, provenance where `LIVE` is structurally unreachable, a simulator anchored on real bhavcopy closes, and a provider chain with a per-provider circuit breaker
**In progress:** 16 Market tick Edge Function and schedule — **built, deployed and verified except for two session-dependent items.** `market-tick` is live at v6 behind `pg_cron` (`* 3-10 * * 1-5`) with Vault credentials; the session logic is one shared copy under `@shared/*`; 152 tier-1 and 13 pgTAP assertions pass; lint, typecheck and build are zero. The gateway was measured directly: **the publishable key that ships in the browser bundle satisfies `verify_jwt`**, so the Vault-held `x-scheduler-secret` compared in the handler is the real access control
**Next — Monday 2026-08-24, first session after 09:15 IST.** Two verify items need a live trading session and the cron window is weekdays only, so nothing can close them before then. Check both with one query against the project database:
```sql
select max(fetched_at) as newest, count(*) filter (where provider_ts is null) as simulator_rows,
       array_agg(distinct provider) as providers from quotes;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
```
Expect `quotes.fetched_at` advancing every minute across the 10 demanded symbols, every row `SIMULATOR` with a null `provider_ts`, and runs one minute apart with no 401s. Timing comes from `net._http_response`. Then tick the box, and F16's `build-journal.md` entry has a placeholder line to replace

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

- **Watchlists join the tick's demand union.** `symbol_demand` has no write path until F18 and nobody holds anything yet, so the union as originally specified would select zero symbols and the whole write path — upsert, provenance columns, `fetched_at` — would ship untested. A watched symbol is genuinely demanded, and this stays correct once F18 narrows refreshes to what is on screen. (F16)
- **The market-hours core is shared, not duplicated, so the planned drift test was never written.** An Edge Function cannot import from `src/` — but nothing stops the dependency running the other way. The pure logic moved into `supabase/functions/_shared/`, Deno reads it relatively and the app through a new `@shared/*` alias, leaving one copy that tier 1 already covers. A drift test earns its place when duplication is forced, as with the F05 stack table; here removing the duplication removes the failure instead of policing it. **`loadHolidays` and the session wrappers moved too**, once the tick was found carrying its own untested copy: they take a structurally-typed client so `_shared/` still imports nothing, and a compile-time assertion in the tier-1 suite proves a real `SupabaseClient` satisfies that shape, since nothing calls them from the app until F20. (F16)
- **The candle prune moves from F16 to F33.** Candles left F15, so retention logic here would run against a table nothing populates and its assertion would pass whether or not the rules were right. F33 builds the pipeline and its retention together. (F16)
- **The simulator walks from a real NSE close, seeded into `instruments.prev_close` from bhavcopy.** `library-docs.md` said it seeds from "instruments reference data", but that table carried no price, so a cold start had nothing to walk from. Bhavcopy is on the reachable archive host, not the blocked API. The close is a seed and never a quote — no `NSE_BHAVCOPY` enum value, no provenance rewrite, and every price still badges `SIMULATED`. (F15)
- **The provider seam is built but the limiter is not.** `QuoteProvider`, an ordered chain and a per-provider circuit breaker, all exercised against a deliberately failing fake — retrofitting a chain around a hardcoded simulator later is worse than the seam costing a little now, and F14 proved the breaker is the piece that matters. A token bucket in front of a local simulator caps nothing, so it waits for a provider that makes outbound requests. (F15)
- **Candles move out of F15 to F33.** No source covers the 1D and 1W intraday ranges — bhavcopy gives one daily bar, Yahoo's chart endpoint is deferred — and F33 is the first feature that draws a chart. Designing a chart pipeline four features before anything renders one is the thing being avoided. (F15)
- **`market-hours.ts` exposes a pure core and an async wrapper.** `marketStatusAt(date, holidays)` takes its holidays as an argument so tier 1 can falsify it; `isTradingSession(supabase, date)` is the shape `code-standards.md` already shows callers using. `getMarketStatus()` also returns the next transition, so F20's pill renders a value rather than re-deriving IST and holiday arithmetic. (F15)
- **Yahoo is deferred to the end of the project, so Phase 3 runs on the simulator.** A 200-symbol validation probe got this machine's IP blocked for over 40 minutes, and with Twelve Data carrying no NSE symbols and NSE's own quote endpoint returning 403, no live source remains. F15 still builds the chain, breaker, limiter and provenance helpers against a fake provider — a real provider drops into a finished chain, not the reverse — and every price badges `SIMULATED`. The open risk is copy: `/` and `/about` promise real prices. (F14)
- **Twelve Data is dropped, not stubbed.** Its free plan returns 404 for every NSE symbol — "available starting with the Grow or Venture plan" — verified against the live API with a real key while `AAPL` returned a quote, so it is an entitlement limit, not a symbol-format problem. A provider that can only ever report unavailable is dead code. (F14)
- **The universe is seeded but unvalidated, and the JSON says so.** `yahoo_validated: false` is recorded in `nifty200.json`, and the probe ships behind `--probe` rather than being deleted, because it is exactly what must run when Yahoo returns. `${symbol}.NS` remains a derivation nothing has confirmed. (F14)
