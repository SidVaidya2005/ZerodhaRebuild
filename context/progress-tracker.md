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

**Phase:** Phase 6 — Polish & Ship, **F40 in progress** — README, demo and handoff, the last feature in the project. **F16 and the Phase 2 checkpoint stay open by decision**; F16 lands at the very end. Do not tick either
**Last completed:** **F39 Deploy. The app is live at <https://zerodha-rebuild.onrender.com>**, signing in with Google against the one hosted Supabase project. `/api/health` reports build and database status through a `health_check()` `security definer` function — `anon` can read no table here and `constraints/security.md` forbids granting it one, so a function returning a boolean and a timestamp is the narrow exception, and `21-health-check.sql` asserts it widened nothing. Two deploys failed first: `corepack enable` cannot write to Render's read-only `/usr`, and a build carrying `NEXT_PUBLIC_SITE_URL=http://localhost:3000` sent every sign-in to localhost while every other signal stayed green
**In progress:** **F40, three commits in (`6.40.01`–`6.40.03`), not finished.** Landed: the account reset to post-signup state through the app's own button; `README.md` rewritten from 16 bytes, recruiter-first, with seven badges; setup, commands, env vars and deployment moved to `docs/SETUP.md`; and `scripts/capture-screenshots.mts` capturing eight routes in one command. **Not landed: no screenshot has actually been taken** — `docs/screenshots/` is empty, so the README references five images that do not exist and a push would render them broken
**Next:** **Capture the screenshots**, then the order-ticket shot by hand, then the build-journal entry and the F40 tick. `pnpm capture:screenshots` needs `OVERFLOW_GUARD_COOKIE` and a running server (or `SCREENSHOT_BASE` pointed at the deployed app). **Four shots stay empty until a trading session** — Holdings, Positions, Reports and the dashboard donut all need `execute_order`, and the reset happened on a Sunday; re-run during Mon–Fri 09:15–15:30 IST after placing ~10 CNC and 2 MIS orders. **Four Phase 6 follow-ups remain**, all in `phase-6.md`, and `pnpm format:check` is red on three files that were **already unformatted at HEAD** (`render.yaml`, `TradeHistoryTable.tsx`, `env.ts`)

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
- [x] 39 Deploy
- [ ] 40 README, demo, and handoff
- [ ] Phase checkpoint — verify Phase 6 — Polish & Ship is stable before starting the next phase

---

## Key Decisions

- **The demo is the screenshots and the live URL; a seeded demo account is not buildable as specified.** Holdings exist only through `execute_order`, which needs an open NSE session and a non-stale quote, so a portfolio cannot be conjured by INSERT without breaking an invariant — and a *shared* demo login is separately impossible, because Google OAuth is the only sign-in path and there are no credentials to hand a visitor. The account was **reset** to its post-signup state instead, so the handoff starts from something a reader can reproduce. The cost, accepted: the README's hero image shows an untraded account until the capture is re-run during a session. (F40)

- **The simulator is the whole quote chain, permanently — this is a scope decision, not a deferral.** Twelve Data's free plan carries no NSE symbols and Yahoo IP-blocked this machine during validation; no keyless source proved workable, so `project-overview.md`'s scope now says the tick engine *is* the chain rather than its fallback. **What it buys is the closing of three standing obligations**: the circuit-breaker state fix, the token-bucket limiter, and the TODO to measure Yahoo's real lag — all of which existed only to serve an outbound provider. The chain, breaker and limiter stay in the code as seams, because `deriveSource` refusing to overclaim is the most interesting thing in the pipeline and deleting it would leave only the simulator. F16 is **unchanged**; it was always simulator-only. (6.00.05)

- **A deployed instance refuses to boot rather than sign users in to the wrong origin.** `NEXT_PUBLIC_SITE_URL` is the OAuth `redirectTo`, built from env rather than the request on purpose — a request-derived origin is a host-header-injection vector — so a wrong value is **silent**: every page renders, `/api/health` passes, and only sign-in breaks. `assertDeployableSiteUrl` exits non-zero when a platform marker is present and the URL is localhost. Gated on `RENDER`, not `NODE_ENV`, because `pnpm start` locally is also a production build and both audits need it; and it *exits* rather than throws, because Next catches an instrumentation throw and leaves the process alive but not serving. (F39)

- **The trading colours split into a fill tier and a text tier, and only the text tier flips.** `--color-up`/`--color-down` stay byte-identical across themes per F02 and are now *only* candle bodies, filled buttons and status dots; `--color-up-text`/`--color-down-text` carry every price figure and are redefined in `.light`. The fills were never AA as text — 3.72:1 on dark `surface-elevated`, **1.95:1 on the light canvas** — and nothing caught it because `theme-tokens.test.ts` asserted only that they *don't flip*, never their contrast. They are in its `foregrounds` list now. DESIGN.md specifies them as text colours and this deviates deliberately, exactly as F04's inline links do. (F38)

- **Every axe violation on the terminal routes gets fixed at any impact level — but the guard still only *fails* on `serious`/`critical`.** Remediation scope and exit threshold are deliberately different: the threshold is what lets `audit:a11y:axe` ship switched **on**, and a guard nobody can keep green gets disabled, which is how this property rotted in the first place. The consequence to accept is that moderate/minor fixes are not regression-protected until the threshold is tightened. (F38)

- **Terminal navigation below `xl` lives in the header sheet; the watchlist rail starts at `lg`.** Below 1024px there was no page navigation at all — the hamburger opened the watchlist and at 375px even the wordmark's `/dashboard` link is hidden — so the six links now render above the watchlist inside one sheet, from the same `TERMINAL_NAV_LINKS` the desktop nav uses. The nav sits at `xl` rather than `lg` because the header bar has no room for it below that: the links need 404px, the right-hand cluster 442px, and `lg:` had been forcing both into a 1024px bar, scrolling every terminal page sideways by up to 202px from 1024 to ~1226. That was **pre-existing**, proven by stashing F37 and rebuilding. (F37)

- **The no-horizontal-overflow property gets a guard, because it was already true and nobody knew.** Both causes this phase recorded were fixed in passing during Phase 5, which is exactly how the property would rot again. `pnpm audit:overflow` drives headless Brave over every route at five widths — 375, 768, 1024, 1280, 1440 — resolving `puppeteer-core` through `lighthouse` rather than adding a dependency. **The two breakpoint boundaries are the point:** sampling only the comfortable widths is what had hidden a 202px scroll on every terminal page. Standalone like `audit:a11y`, not a `test:all` tier, because it needs a running server. (F37)

- **A failed read now throws, because an empty state and a broken query were the same pixel.** Six terminal pages and the terminal layout logged read errors and fell through to the empty state — their own comments named it as "how a broken read hides behind a plausible empty state" — which also made F36's own `**Verify:**` line unprovable. They now log and throw. The consequence is deliberate: a layout's `error.tsx` does not catch its own throw, so a failed watchlist read surfaces at the *root* boundary as a chrome-less error rather than a terminal-shaped one. (F36)

- **A boundary's retry is `retry()`, not `reset()`.** Next.js passes `error`, `reset` and `retry`; `reset` only resets the boundary, while `retry` calls `router.refresh()` first. On a page whose *server-side* read failed, `reset` re-renders the same failed payload — a retry button that visibly does nothing. Confirmed against Context7, and `src/app/error.tsx` was using `reset`. (F36)

- **`constraints.md` is now a core plus reference halves, and the always-read set has room again.** Five topics that bind only one kind of work — money and the order engine, market data, testing, security, marketing — moved to `context/constraints/` behind triggers in `CLAUDE.md`, taking the always-read set from 39,770 to 31,807 of 40,000. Accessibility, theming, shadcn/ui and Next.js behaviour stayed, because Phase 6 is UI polish and they bind every change in it. Adding a constraint now means first asking which side of the line it belongs on. (6.00.02)
