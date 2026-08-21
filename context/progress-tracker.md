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
**Last completed:** 07 Slice B — the contact form. First RLS policy in the project, proven by pgTAP and falsified three ways; works without JavaScript. Phase 1's features are now all complete
**Next:** the Phase 1 checkpoint — run the verification commands, inspect the phase diff, compact `build-journal.md`, record follow-ups. Then 10 Database schema

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
- [ ] Phase checkpoint — verify Phase 1 — Foundation & Public Site is stable before starting the next phase

### Phase 2 — Data Foundation & Auth

- [x] 09 Test harness
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

- **The support form uses React 19's form action and `useActionState`, not react-hook-form.** It submits and validates without JavaScript, matching the page it sits on, and needs no new dependency. `code-standards.md` is corrected in the same change; F25's order ticket is where react-hook-form actually earns its place. (F07B)
- **`support_messages` gets `CHECK` length bounds and a honeypot; volume abuse is deliberately unmitigated.** The publishable key ships in the browser bundle, so anyone can write to that table — bounds cap the damage per request, the honeypot stops drive-by bots, and real rate limiting is out of scope for a portfolio contact form. Written down rather than left implicit. (F07B)

- **`supabase test db --db-url` requires Docker even against a remote database** — it connects first, then dies with `LegacyDockerRunError`. Proven by running the spike F09 called for. Tier 2 therefore runs through our own `scripts/run-pgtap.ts` using `pg`: the text rows pgTAP's functions return *are* the TAP stream, so nothing extra needs installing. pgTAP itself (1.3.3) installed fine on the hosted database — only the runner was ever the problem. (F09)
- **pgTAP is enabled by a tracked migration, not created ad hoc by the runner.** With one project that means installing it into production, which is acceptable: it adds functions in a schema nothing else uses and no tables. An untracked extension the tests silently depend on is worse — a fresh database looks fine until the suite runs, and migration history stops describing the database. (F09)
- **The tier-2 runner is a standalone TypeScript script with no new runner dependency.** Node 26 strips types natively, so `node scripts/run-pgtap.ts` runs directly; `tsx` would be a dependency for one file. Keeping it out of Vitest also means nothing about tier 2 can be picked up by `pnpm test`. (F09)
- **`pnpm db:push:test` is dropped.** One database means one push command, and a second script reaching the same place by a different mechanism — named for a test project that no longer exists — is a trap. (F09)

- **F07 is split into two slices rather than renumbered.** It was placed in Phase 1 before anyone noticed the contact form needs `@supabase/ssr`, `lib/supabase/server.ts` (F12's), `src/types/database.ts` (F10's), `react-hook-form` and F09's harness. Slice A (help content) has none of those dependencies and ships now; Slice B (form, migration, RLS) waits for F09. Inserting a new feature number would have renumbered 08–40 and invalidated every journal and commit reference already written, so the `07` checkbox simply stays unticked until both slices land. (F07)

- **One Supabase project, not two.** The test project was created and then deleted at the user's direction: a single project is simpler to operate and cannot silently pause while the other stays warm. `code-standards.md`, `CLAUDE.md`, `.env.example` and F09 were all rewritten in the same change, since all four mandated a second project. (1.00.03)
- **Tier 3 therefore commits into the production database, and is gated behind `ALLOW_RACE_TESTS`.** It cannot roll back — proving two connections cannot both fill an order requires the first to commit. Recognisable seed prefix and failure-safe `afterEach` cleanup are the other two mandatory guards. (1.00.03)

- **The 404 carries full public chrome; the error boundary carries none.** A mistyped URL is ordinary navigation and wants the nav, so `PublicShell` was extracted and shared — an unmatched URL never enters the `(marketing)` group, so the route-group layout cannot supply it. An error means this subtree already failed, so the fallback depends on as little as possible and stays a small client bundle. (F08)




