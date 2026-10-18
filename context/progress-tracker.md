# Progress Tracker

This is the current build status: what is complete, what remains open, and what to do next.
Read it first at the start of a session, then follow the reading order in `../CLAUDE.md`.
Feature numbers match the phase plans in `build-plan/`.

## How this file is maintained

- Replace Current Status after each completed feature. Keep its three entries focused on the latest
  state; the journal holds previous work and verification records.
- Tick the existing feature checkbox in place. Do not copy or repeat the checklist.
- Keep the ten most recent Key Decisions, newest first. When adding an eleventh, move the oldest
  entry into its topic in `constraints.md` or the relevant topic reference. Preserve the decision
  until it is explicitly superseded or no longer applies.

## Current Status

**Phase:** Phase 6 — Polish & Ship. The checkpoint's automated checks are complete, but its checkbox remains open pending production sign-up and trading checks. F16 and the Phase 2 checkpoint also remain open by decision; F16 is the final project item.
**Last completed:** The automated part of the Phase 6 checkpoint, on 2026-09-24. All four test tiers, lint, typecheck, formatting, and build passed in that run; production served HEAD with a healthy database. Four review findings were fixed: swallowed stock-page read errors, ignored profile/funds errors in the layout, a duplicated watchlist between `lg` and `xl`, and a screenshot captured before the order-ticket chart finished painting. The journal was compacted and two lessons were promoted to constraints.
**Next:** Follow `phase-6.md` → Phase checkpoint: sign up with a fresh Google account, place CNC and MIS market orders during an NSE session (Mon–Fri, 09:15–15:30 IST), reset, and sign out. Inspect the menu sheet between `lg` and `xl` and the stock page. Then tick the checkpoint if the checks pass. Three follow-ups are recorded there; F16 stays last.

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
- [x] 40 README, demo, and handoff
- [ ] Phase checkpoint — verify Phase 6 — Polish & Ship is stable before starting the next phase

---

## Key Decisions

- **The demo uses screenshots and the deployed URL.** A seeded portfolio would bypass `execute_order`,
  which requires an open session and a fresh quote. Google-only authentication also prevents handing
  visitors shared login credentials. The account was reset to a reproducible post-signup state;
  the README hero therefore shows an untraded account until screenshots are captured during a
  session. (F40)

- **The simulator is the permanent quote source for this build.** Development checks found no NSE
  symbols on Twelve Data's free plan, and Yahoo blocked this machine. This closes the provider-only
  obligations to fix circuit-breaker state, build a token-bucket limiter, and measure Yahoo's lag.
  Their interfaces remain in the code for a future provider. F16 remains simulator-only and its
  status is unchanged. (6.00.05)

- **Deployed instances refuse to start with a localhost `NEXT_PUBLIC_SITE_URL`.** OAuth redirects use
  that configured origin to avoid trusting an attacker-controlled request host. A bad value can
  break sign-in while pages and health checks still work. `assertDeployableSiteUrl` exits non-zero
  when `RENDER` is present; it does not use `NODE_ENV`, since audits run a production server locally.
  Throwing is insufficient because Next.js catches instrumentation errors. (F39)

- **Trading fill colours (`--color-up`/`--color-down`) stay identical across themes.** Price text uses
  `--color-up-text`/`--color-down-text`, which change in the light theme to meet contrast requirements.
  Fill colours measured as low as 1.95:1 on the light canvas; a test that only checked theme equality
  missed this. Text colours are now in the contrast test's `foregrounds` list. This is a deliberate
  correction to DESIGN.md's text-colour guidance, like the earlier inline-link correction. (F38)

- **Fix every axe violation found on terminal routes, regardless of impact level.** The audit command
  currently fails only on `serious` or `critical` findings so the guard can remain enabled. Moderate
  and minor issues are therefore fixed when found but are not protected by the failure threshold. (F38)

- **Below `xl`, terminal navigation lives in the header's menu sheet.** The watchlist sidebar starts at
  `lg`. The six links and the right-hand controls could not fit together at 1024px: they caused up to
  202px of sideways page scrolling. The sheet uses the same `TERMINAL_NAV_LINKS` list as desktop
  navigation and shows links above the watchlist. The overflow predated F37, as a rebuilt earlier
  version confirmed. (F37)

- **`pnpm audit:overflow` guards against sideways page scrolling.** It checks all routes at 375, 768, 1024,
  1280, and 1440px. Breakpoint boundaries matter: comfortable widths missed the 202px navigation
  overflow. The command uses headless Brave and `puppeteer-core` from Lighthouse, with no new
  dependency. It runs separately from `test:all` because it needs a running server. Earlier overflow
  causes had already been fixed during Phase 5; the guard makes those fixes testable. (F37)

- **A failed page read must be logged and thrown so the error boundary can handle it.** Six terminal
  pages and the layout previously displayed empty states after query failures, making a broken
  query look like an empty account. A layout cannot catch its own error in its child `error.tsx`,
  so layout failures intentionally reach the root fallback without terminal chrome. (F36)

- **Error-boundary buttons use `retry()`.** `reset()` resets the boundary but reuses its existing failed
  server payload; `retry()` refreshes the route first. Context7 confirmed the API, and the root
  boundary's old `reset()` call was corrected. (F36)

- **The constraints are split into a short core and task-specific references.** Money, market data,
  testing, security, and marketing details moved behind the triggers in `CLAUDE.md`, reducing the
  always-read set from 39,770 to 31,807 tokens against its 40,000-token budget at that checkpoint.
  Accessibility, theme, shadcn/ui, and Next.js rules stayed in the core because they applied across
  Phase 6 UI work. Place new constraints according to when they need to be read. (6.00.02)
