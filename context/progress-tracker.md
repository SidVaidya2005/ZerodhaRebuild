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
**Last completed:** 03 Public layout shell — dismissible disclaimer with a no-flash blocking script, 64px nav, full-screen mobile sheet, token-driven footer; all six public routes prerendered static and 200
**Next:** 04 Home page

---

## Progress

### Phase 1 — Foundation & Public Site

- [x] 01 Project scaffold and tooling
- [x] 02 Design system and theme tokens
- [x] 03 Public layout shell
- [ ] 04 Home page
- [ ] 05 About page
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

- **Every link the public shell points at is stubbed in F03**, including `/auth/login`, so the shell's own verify can pass and F04's "every CTA routes to `/auth/login`" has a destination. Each stub is a heading plus one line of copy, replaced wholesale by F05–F08 and F12. `src/app/page.tsx` moves into `(marketing)/` in the same change — two files claiming `/` would fail the build. (F03)
- **The simulator disclaimer is dismissible and remembered, with no flash.** A blocking inline script in the root layout reads `localStorage` and stamps `data-disclaimer="dismissed"` on `<html>` before first paint; CSS hides the strip off that attribute. The same technique `next-themes` already runs here, and it keeps the `(marketing)` layout a Server Component — only the close button is a client island. (F03)
- **The marketing footer is `bg-surface`, not DESIGN.md's always-light `#fafafa`.** `--color-surface` already *is* `#fafafa` in the light theme, so the source system's value is reached through the token rather than hardcoded, and in dark it reads as the elevation step the flat-colour-block philosophy calls for. An always-light token pair would exist only to break the theme contract. (F03)
- **Mobile nav is the shadcn `sheet` primitive, and the theme toggle moves into the public header.** Sheet is Radix Dialog — already installed, no new dependency — and brings focus trap, Escape handling and scroll lock rather than leaving all three to F38. `ThemeToggle` is promoted from `app/dev/styleguide/` to `src/components/ThemeToggle.tsx` as app-level chrome; DESIGN.md's `top-nav-dark` lists it in the right-side cluster. (F03)
- **The shadcn CLI changed shape: `init -b radix -t next -p nova --css-variables -y`.** It now picks between Base UI, Radix and React Aria, and prompts for a style preset that `-y` does not skip. `shadcn` is also a *runtime* dependency shipping `shadcn/tailwind.css`. Resolves the standing TODO in `library-docs.md` → shadcn/ui. (F02)
- **shadcn's token vocabulary is bridged onto this project's, never merged.** A `@theme inline` block maps shadcn's names onto our palette so `shadcn add` keeps working, while project code keeps using `bg-canvas` / `text-muted` / `border-hairline`. `--color-muted` is the one real collision — shadcn means a *surface* by it, this project means the *text* grey — and it is resolved in this project's favour, with `--color-muted-foreground` defined to the same value and `bg-muted` hand-fixed on add. (F02)
- **Every `dark:` utility is stripped from added components.** Tailwind v4's built-in `dark:` variant is bound to `prefers-color-scheme`, so a leftover `dark:` class responds to the visitor's OS rather than this project's theme class — a live bug, not inert code. A grep guard enforces it. (F02)
- **Two money formatters, not one with flags.** `formatCurrency` always renders ₹ and 2dp; `formatSignedCurrency` renders an explicit +/− where the sign carries meaning. `Intl.NumberFormat('en-IN')` produces Indian digit grouping natively, so nothing is hand-rolled. (F02)
- **TypeScript is pinned to 6.0.3 and ESLint to 9.39.5, both below their available latest.** `typescript-eslint` refuses to load against the TS 7 API, and `eslint-plugin-react` 7.37.5 crashes on ESLint 10's rule-context API — each breaks `pnpm lint` outright. Re-test both when those upstreams ship support; `architecture.md`'s version table carries the reason. (F01)
- **Supabase provisioning is deferred out of F01 to Phase 2.** The free plan caps active projects at two per org and both slots already hold unrelated projects (`NextBnb` active, `SpotifyAgain` paused). F10 already calls for creating and linking the project, so F01 and F10 were duplicating the step. (F01)
