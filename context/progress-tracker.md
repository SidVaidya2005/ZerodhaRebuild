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

**Phase:** Phase 1 — Foundation & Public Site
**Last completed:** 08 Legal, error, and not-found pages — disclaimer plus six named simulation divergences, branded 404 with full chrome, root error boundary proven to catch a real throw; Lighthouse /legal 96
**Next:** 09 Test harness, once the Supabase CLI is authenticated and the dev + test projects exist. F07 (Support) then follows F09 rather than preceding it — its RLS check is tier 2

---

## Progress

### Phase 1 — Foundation & Public Site

- [x] 01 Project scaffold and tooling
- [x] 02 Design system and theme tokens
- [x] 03 Public layout shell
- [x] 04 Home page
- [x] 05 About page
- [x] 06 Pricing page
- [ ] 07 Support page and contact form
- [x] 08 Legal, error, and not-found pages
- [ ] Phase checkpoint — verify Phase 1 — Foundation & Public Site is stable before starting the next phase

### Phase 2 — Data Foundation & Auth

- [ ] 09 Test harness
- [ ] 10 Database schema: identity and market data
- [ ] 11 Database schema: funds, orders, and portfolio
- [ ] 12 Google sign-in and route protection
- [ ] 13 Account bootstrap on first sign-in
- [ ] 14 Instrument and holiday calendar seed
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

- **F07 moves behind F09.** Its verify is a tier-2 pgTAP check and `support_messages` accepts anonymous writes, so it should not ship behind a one-off manual check. Phase 1 closes as 01–06 plus 08; F07 is built once the harness exists. (F08)
- **The 404 carries full public chrome; the error boundary carries none.** A mistyped URL is ordinary navigation and wants the nav, so `PublicShell` was extracted and shared — an unmatched URL never enters the `(marketing)` group, so the route-group layout cannot supply it. An error means this subtree already failed, so the fallback depends on as little as possible and stays a small client bundle. (F08)
- **A Server Component throw renders nothing server-side; the boundary appears on hydration.** `curl` shows an empty body and a 500, which looks like the white screen the criterion forbids — the check only means something in a browser. Proven with a temporary throwing route, then deleted. (F08)
- **Lighthouse cannot audit the 404**: it returns `ERRORED_DOCUMENT_REQUEST` for any non-200 document. That page is verified structurally and by measured contrast instead. (F08)


- **The About page's stack table renders from a typed `src/lib/stack.ts` guarded by a bidirectional drift test.** Every `installed` row's version must equal `package.json`'s, and every `planned` row's package must be absent from it — so upgrading a dependency without touching the page fails the suite, and so does installing a planned package without flipping its row. (F05)
- **Packages `architecture.md` commits to but later phases install render as "planned"**, neither omitted nor given an invented version. A third of the stack lands in Phases 2–5, and faking those versions would be the same overclaim the provenance badge exists to prevent. (F05)
- **The three honesty sections divide by purpose, not by subject.** Home carries price provenance only; About carries the Real / Simulated inventory; `/legal` carries the consequences and the divergences from a real broker, because a notice has to stand alone. About links to Legal rather than restating it. (F05)
- **All external links go through a shared `ExternalLink`** carrying `target="_blank" rel="noreferrer"` and an sr-only "opens in a new tab". This turns the recurring `rel="noreferrer"` requirement into a grep for raw `target="_blank"` outside one file. (F05)

- **The home page documents all four provenance states and says plainly that `LIVE` never appears in this build.** `PROVIDER_IS_REALTIME` is `false` for all three providers, so a quote can only badge `DELAYED`, `SIMULATED` or `STALE`. The feature tile drops "live NSE prices" for "real NSE prices, honestly delayed", and `build-plan.md`'s own F04 wording was corrected in the same change — architecture invariants outrank a build-plan feature. (F04)
- **The home page quotes no charge rates.** CNC vs MIS is explained as settlement versus 15:20 square-off, shorting rules, and the no-leverage point from `trading-contract.md` §1. §3 still carries a TODO that every rate needs a dated source before F06, and a second copy on the home page would be a second thing to keep in sync. Rates live on `/pricing` only. (F04)

