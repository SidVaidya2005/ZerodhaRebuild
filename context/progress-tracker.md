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
**Last completed:** 07 Slice A — Support help content: four category cards, 17 native-`<details>` FAQ entries, no JavaScript. All five public routes now score Lighthouse 100 with no failures
**Next:** 09 Test harness — start with the pgTAP spike in its Verify block, since a working database connection now exists to answer the Docker question. Then 07 Slice B (contact form), then the Phase 1 checkpoint

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

- **F07 is split into two slices rather than renumbered.** It was placed in Phase 1 before anyone noticed the contact form needs `@supabase/ssr`, `lib/supabase/server.ts` (F12's), `src/types/database.ts` (F10's), `react-hook-form` and F09's harness. Slice A (help content) has none of those dependencies and ships now; Slice B (form, migration, RLS) waits for F09. Inserting a new feature number would have renumbered 08–40 and invalidated every journal and commit reference already written, so the `07` checkbox simply stays unticked until both slices land. (F07)
- **FAQ disclosure is native `<details>`/`<summary>`.** Zero JavaScript, works before hydration and with JS off, and keyboard operation, focus handling and screen-reader semantics come from the browser instead of being hand-written and then audited at F38. (F07)
- **Slice A ships no contact form at all**, pointing unanswered questions at the repository's issue tracker. A dead "coming soon" form is worse than none, and this way Slice B adds the form rather than replacing a placeholder. (F07)

- **One Supabase project, not two.** The test project was created and then deleted at the user's direction: a single project is simpler to operate and cannot silently pause while the other stays warm. `code-standards.md`, `CLAUDE.md`, `.env.example` and F09 were all rewritten in the same change, since all four mandated a second project. (1.00.03)
- **Tier 3 therefore commits into the production database, and is gated behind `ALLOW_RACE_TESTS`.** It cannot roll back — proving two connections cannot both fill an order requires the first to commit. Recognisable seed prefix and failure-safe `afterEach` cleanup are the other two mandatory guards. (1.00.03)

- **The 404 carries full public chrome; the error boundary carries none.** A mistyped URL is ordinary navigation and wants the nav, so `PublicShell` was extracted and shared — an unmatched URL never enters the `(marketing)` group, so the route-group layout cannot supply it. An error means this subtree already failed, so the fallback depends on as little as possible and stays a small client bundle. (F08)
- **A Server Component throw renders nothing server-side; the boundary appears on hydration.** `curl` shows an empty body and a 500, which looks like the white screen the criterion forbids — the check only means something in a browser. Proven with a temporary throwing route, then deleted. (F08)


- **The About page's stack table renders from a typed `src/lib/stack.ts` guarded by a bidirectional drift test.** Every `installed` row's version must equal `package.json`'s, and every `planned` row's package must be absent from it — so upgrading a dependency without touching the page fails the suite, and so does installing a planned package without flipping its row. (F05)
- **Packages `architecture.md` commits to but later phases install render as "planned"**, neither omitted nor given an invented version. A third of the stack lands in Phases 2–5, and faking those versions would be the same overclaim the provenance badge exists to prevent. (F05)
- **The three honesty sections divide by purpose, not by subject.** Home carries price provenance only; About carries the Real / Simulated inventory; `/legal` carries the consequences and the divergences from a real broker, because a notice has to stand alone. About links to Legal rather than restating it. (F05)


