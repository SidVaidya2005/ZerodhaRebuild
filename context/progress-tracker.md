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

**Phase:** Phase 6 — Polish & Ship, **F39 next**. **F16 and the Phase 2 checkpoint stay open by decision** — F16 lands at the very end of the project. Do not tick either
**Last completed:** **F38 Accessibility pass — both halves.** `pnpm audit:a11y:axe` now reports **`14 of 14 routes audited`, exit 0, in *both* themes, with zero notes at any impact level.** The terminal had never been measured and held four rules: a **critical** dangling `aria-controls` on all 8 routes (cmdk's list was unmounted while its combobox still referenced it), `color-contrast` on all 8, `link-in-text-block` on `/funds`, and `nested-interactive` on `/stocks/*` from Lightweight Charts' attribution anchor. **The contrast finding was the real one:** `--color-up`/`--color-down` were used as text app-wide and were never in `theme-tokens.test.ts`'s `foregrounds` list, so nothing computed their ratios — green measured **1.95:1** on the light canvas. Fixed with a `--color-up-text`/`--color-down-text` tier that flips while the fills stay byte-identical, and the test now guards it
**In progress:** Nothing
**Next:** **F39 Deploy.** **Before it deploys**, either Yahoo lands or `/` and `/about` are reconciled — every price badges `SIMULATED` today. **`/api/health` does not exist** — `src/app/api/health/` is an empty directory and the route 404s, while `architecture.md` lists it as public and `code-standards.md` names it in the closed route-handler list; Render's health check is the obvious consumer, so fix or reconcile it in F39. **Three F38 follow-ups are recorded in `phase-6.md`, none blocking:** `HoldingsTable`, `PositionsTable`, `TradeHistoryTable` and the dashboard donut were audited as **empty states** and have never been measured with rows; the destructive button's `hover:bg-destructive/20` is 4.09:1 in dark; and the keyboard-only order flow stays deferred with **F37's outstanding 375×667 submit check**. **One finding is open from 6.00.02:** `trading-contract.md` §13's money sweep has never covered `constraints.md`

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

- [x] 36 States, skeletons, and error boundaries
- [x] 37 Responsive pass
- [x] 38 Accessibility pass
- [ ] 39 Deploy
- [ ] 40 README, demo, and handoff
- [ ] Phase checkpoint — verify Phase 6 — Polish & Ship is stable before starting the next phase

---

## Key Decisions

- **The trading colours split into a fill tier and a text tier, and only the text tier flips.** `--color-up`/`--color-down` stay byte-identical across themes per F02 and are now *only* candle bodies, filled buttons and status dots; `--color-up-text`/`--color-down-text` carry every price figure and are redefined in `.light`. The fills were never AA as text — 3.72:1 on dark `surface-elevated`, **1.95:1 on the light canvas** — and nothing caught it because `theme-tokens.test.ts` asserted only that they *don't flip*, never their contrast. They are in its `foregrounds` list now. DESIGN.md specifies them as text colours and this deviates deliberately, exactly as F04's inline links do. (F38)

- **Every axe violation on the terminal routes gets fixed at any impact level — but the guard still only *fails* on `serious`/`critical`.** Remediation scope and exit threshold are deliberately different: the threshold is what lets `audit:a11y:axe` ship switched **on**, and a guard nobody can keep green gets disabled, which is how this property rotted in the first place. The consequence to accept is that moderate/minor fixes are not regression-protected until the threshold is tightened. (F38)

- **Terminal navigation below `xl` lives in the header sheet; the watchlist rail starts at `lg`.** Below 1024px there was no page navigation at all — the hamburger opened the watchlist and at 375px even the wordmark's `/dashboard` link is hidden — so the six links now render above the watchlist inside one sheet, from the same `TERMINAL_NAV_LINKS` the desktop nav uses. The nav sits at `xl` rather than `lg` because the header bar has no room for it below that: the links need 404px, the right-hand cluster 442px, and `lg:` had been forcing both into a 1024px bar, scrolling every terminal page sideways by up to 202px from 1024 to ~1226. That was **pre-existing**, proven by stashing F37 and rebuilding. (F37)

- **The no-horizontal-overflow property gets a guard, because it was already true and nobody knew.** Both causes this phase recorded were fixed in passing during Phase 5, which is exactly how the property would rot again. `pnpm audit:overflow` drives headless Brave over every route at five widths — 375, 768, 1024, 1280, 1440 — resolving `puppeteer-core` through `lighthouse` rather than adding a dependency. **The two breakpoint boundaries are the point:** sampling only the comfortable widths is what had hidden a 202px scroll on every terminal page. Standalone like `audit:a11y`, not a `test:all` tier, because it needs a running server. (F37)

- **A failed read now throws, because an empty state and a broken query were the same pixel.** Six terminal pages and the terminal layout logged read errors and fell through to the empty state — their own comments named it as "how a broken read hides behind a plausible empty state" — which also made F36's own `**Verify:**` line unprovable. They now log and throw. The consequence is deliberate: a layout's `error.tsx` does not catch its own throw, so a failed watchlist read surfaces at the *root* boundary as a chrome-less error rather than a terminal-shaped one. (F36)

- **A boundary's retry is `retry()`, not `reset()`.** Next.js passes `error`, `reset` and `retry`; `reset` only resets the boundary, while `retry` calls `router.refresh()` first. On a page whose *server-side* read failed, `reset` re-renders the same failed payload — a retry button that visibly does nothing. Confirmed against Context7, and `src/app/error.tsx` was using `reset`. (F36)

- **`constraints.md` is now a core plus reference halves, and the always-read set has room again.** Five topics that bind only one kind of work — money and the order engine, market data, testing, security, marketing — moved to `context/constraints/` behind triggers in `CLAUDE.md`, taking the always-read set from 39,770 to 31,807 of 40,000. Accessibility, theming, shadcn/ui and Next.js behaviour stayed, because Phase 6 is UI polish and they bind every change in it. Adding a constraint now means first asking which side of the line it belongs on. (6.00.02)

- **A preference that must follow the account is applied client-side, because `next-themes` accepts no server value.** Its injected script reads `localStorage` and `setTheme` is the only write path (confirmed against Context7), so the terminal layout passes `profiles.theme` down and a client component calls `setTheme` once per full load. That leaves the library sole owner of the class *and* the storage key; the price is one frame of the wrong theme on a browser that has never seen this account, inside the terminal only. A blocking script would remove that frame by hand-writing a key the library owns and racing its hydration. (F35)

- **Both terminal toggles persist, the marketing one cannot, and the `profiles` grant narrows in the same change.** Reading a session in the public header would force dynamic rendering on every marketing page (F12), so `SiteHeader` stays `localStorage`-only — and if the top-bar toggle did not persist, the layout's stored value would silently revert it on the next full load. F35 is also the first feature to write `profiles`, so it is where `grant select, update` narrows to `update (theme)`, which today still lets a user rewrite their own `client_id` by direct PostgREST call. (F35)

- **A read that produces a file is a route handler, not a Server Action.** `/reports/export` becomes the third entry on `code-standards.md`'s closed two-handler list, amended in the same change rather than left contradicting the code. The Server Action rule governs *mutations*; routing a CSV through one would cost a `'use client'` Blob dance, a JS-only download, and the whole export squeezed through an action payload — to protect a rule it does not break. (F34)

