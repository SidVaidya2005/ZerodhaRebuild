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
**Last completed:** 10 Database schema: identity and market data — two enums, eight tables, the `touch_updated_at` trigger and the `quotes` Realtime publication entry, with 30 new pgTAP assertions falsified four ways. Found that `lives_ok` cannot prove a read policy works, and that the generated types no longer satisfy `format:check`
**Next:** 11 Database schema: funds, orders, and portfolio — the money tables exactly as `trading-contract.md` specifies, including both `blocked_margin` columns, `entry_reference_price`, and the `ledger_type` enum with all eight values and no `RESET`

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

- **F10 creates only the two enums its own tables reference** — `quote_provider` and `candle_interval`. The five that only F11's tables use are created there. Each migration then reviews against the tables it creates, and nobody reading the schema in between finds five types with no referents. (F10)
- **`updated_at` is maintained by a Postgres trigger, not by the writer.** `quotes.updated_at` is what Realtime fires on, so a writer that omits it stops the price feed silently — a bug that presents as "prices froze" and points nowhere near the upsert. `touch_updated_at()` is shared with F11's `funds`, `holdings` and `positions`. (F10)
- **A table's write path ships with the feature that uses it, not with the table.** `symbol_demand` lands in F10 with RLS on and no way for a client to write it; `touch_symbol_demand`, its grant and its test all arrive together in F18. A granted, callable, untested function with no caller for eight features is the thing being avoided. (F10)
- **No `anon` grant on any reference table.** Every surface showing an instrument or a price is under `(terminal)`, and F04 already decided the marketing site quotes no prices. The publishable key ships in the browser bundle, so granting `anon` select would publish the entire Nifty 200 universe to anyone who reads the JavaScript. (F10)
- **`profiles.theme` defaults to `'dark'`, and `architecture.md` was wrong.** It said `light` while `project-overview.md` specifies a dark-default terminal and `theme-provider.tsx` ships `defaultTheme="dark"`. CLAUDE.md's conflict order puts the scope document above `architecture.md`, so the doc is corrected rather than the code bent to it. (F10)

- **Nothing sweeps the non-money documents, so the phase checkpoint is where they get reconciled.** `trading-contract.md` §13 has a sweep because money rules are restated in four files — but the same restatement problem exists outside money, with no equivalent guard. This checkpoint found four statements describing a model already replaced: `architecture.md` and `code-standards.md` both still named `supabase test db` as the tier-2 runner F09 proved unusable, and `architecture.md` still had the support form built on react-hook-form in both its stack table and its data-flow diagram. All four are corrected, and `code-standards.md` now carries the `useActionState` exception to the Server Action shape rule that F07B's code has been deviating from since it shipped. (1.00.06)

- **The support form uses React 19's form action and `useActionState`, not react-hook-form.** It submits and validates without JavaScript, matching the page it sits on, and needs no new dependency. `code-standards.md` is corrected in the same change; F25's order ticket is where react-hook-form actually earns its place. (F07B)
- **`support_messages` gets `CHECK` length bounds and a honeypot; volume abuse is deliberately unmitigated.** The publishable key ships in the browser bundle, so anyone can write to that table — bounds cap the damage per request, the honeypot stops drive-by bots, and real rate limiting is out of scope for a portfolio contact form. Written down rather than left implicit. (F07B)

- **`supabase test db --db-url` requires Docker even against a remote database** — it connects first, then dies with `LegacyDockerRunError`. Proven by running the spike F09 called for. Tier 2 therefore runs through our own `scripts/run-pgtap.mts` using `pg`: the text rows pgTAP's functions return *are* the TAP stream, so nothing extra needs installing. pgTAP itself (1.3.3) installed fine on the hosted database — only the runner was ever the problem. (F09)
- **pgTAP is enabled by a tracked migration, not created ad hoc by the runner.** With one project that means installing it into production, which is acceptable: it adds functions in a schema nothing else uses and no tables. An untracked extension the tests silently depend on is worse — a fresh database looks fine until the suite runs, and migration history stops describing the database. (F09)
