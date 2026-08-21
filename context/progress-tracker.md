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
**Last completed:** 05 About page — why it exists, architecture in prose plus two paths, version-pinned stack table guarded by a bidirectional drift test, Real/Simulated inventory; Lighthouse 96
**Next:** 06 Pricing page — blocked on trading-contract.md §3's rate TODO, which needs dated sources first

---

## Progress

### Phase 1 — Foundation & Public Site

- [x] 01 Project scaffold and tooling
- [x] 02 Design system and theme tokens
- [x] 03 Public layout shell
- [x] 04 Home page
- [x] 05 About page
- [ ] 06 Pricing page
- [ ] 07 Support page and contact form
- [ ] 08 Legal, error, and not-found pages
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

- **The About page's stack table renders from a typed `src/lib/stack.ts` guarded by a bidirectional drift test.** Every `installed` row's version must equal `package.json`'s, and every `planned` row's package must be absent from it — so upgrading a dependency without touching the page fails the suite, and so does installing a planned package without flipping its row. (F05)
- **Packages `architecture.md` commits to but later phases install render as "planned"**, neither omitted nor given an invented version. A third of the stack lands in Phases 2–5, and faking those versions would be the same overclaim the provenance badge exists to prevent. (F05)
- **The three honesty sections divide by purpose, not by subject.** Home carries price provenance only; About carries the Real / Simulated inventory; `/legal` carries the consequences and the divergences from a real broker, because a notice has to stand alone. About links to Legal rather than restating it. (F05)
- **All external links go through a shared `ExternalLink`** carrying `target="_blank" rel="noreferrer"` and an sr-only "opens in a new tab". This turns the recurring `rel="noreferrer"` requirement into a grep for raw `target="_blank"` outside one file. (F05)

- **The home page documents all four provenance states and says plainly that `LIVE` never appears in this build.** `PROVIDER_IS_REALTIME` is `false` for all three providers, so a quote can only badge `DELAYED`, `SIMULATED` or `STALE`. The feature tile drops "live NSE prices" for "real NSE prices, honestly delayed", and `build-plan.md`'s own F04 wording was corrected in the same change — architecture invariants outrank a build-plan feature. (F04)
- **The home page quotes no charge rates.** CNC vs MIS is explained as settlement versus 15:20 square-off, shorting rules, and the no-leverage point from `trading-contract.md` §1. §3 still carries a TODO that every rate needs a dated source before F06, and a second copy on the home page would be a second thing to keep in sync. Rates live on `/pricing` only. (F04)
- **`lighthouse` added as a pinned dev dependency with `pnpm audit:a11y`.** F04's verify commits to a score above 90 and nothing could measure it; F38 needs the tooling regardless, so landing it in Phase 1 means every public page is audited as it ships rather than all at once at the end. (F04)
- **The hero is typographic — no mock terminal UI.** It is what the build plan specifies, and F40 can screenshot the finished terminal, which beats a hand-built fake and avoids maintaining a second UI until the real one exists. (F04)

- **Every link the public shell points at is stubbed in F03**, including `/auth/login`, so the shell's own verify can pass and F04's "every CTA routes to `/auth/login`" has a destination. Each stub is a heading plus one line of copy, replaced wholesale by F05–F08 and F12. `src/app/page.tsx` moves into `(marketing)/` in the same change — two files claiming `/` would fail the build. (F03)
- **The simulator disclaimer is dismissible and remembered, with no flash.** A blocking inline script in the root layout reads `localStorage` and stamps `data-disclaimer="dismissed"` on `<html>` before first paint; CSS hides the strip off that attribute. The same technique `next-themes` already runs here, and it keeps the `(marketing)` layout a Server Component — only the close button is a client island. (F03)
