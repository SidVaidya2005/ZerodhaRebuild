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
**Last completed:** 12 Google sign-in and route protection — server-initiated OAuth so sign-in works without JavaScript, the guard in `src/proxy.ts` over a pure `isTerminalPath()`/`safeNext()` module, all four Supabase clients, and a minimal `/dashboard` to land on. Verified end to end in the browser, including sign-out revoking the session server-side. Closed three carried-over items: `/auth/login` now scores 100, the `support_messages` suite covers `authenticated`, and `SupportForm` keys its banner off the field-error count. Two failures cost real time — a blank page that was a 16 KB header limit hit by other projects' localhost cookies, and a documented Supabase snippet that hardcodes `https://` and breaks a local production build
**Next:** 13 Account bootstrap on first sign-in — the `handle_new_user` trigger creating the `profiles` row, a `ZR######` client ID with bounded retries, the `funds` row at `OPENING_BALANCE`, the `SIGNUP_CREDIT` ledger entry and a default watchlist. There is already one row in `auth.users` with no profile, so the trigger needs a backfill path or that account reset

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

- **Sign-in is initiated server-side, not from a browser client.** A `<form>` posts to a Server Action that calls `signInWithOAuth` and `redirect()`s to Google, so sign-in works with JavaScript disabled — the standard F07B set for the support form — and `/auth/login` stays a Server Component. The PKCE verifier is written by the same client that reads it back in the callback. `library-docs.md`'s client-side snippet is corrected in the same change. (F12)
- **The signed-in identity and sign-out control live on the `/dashboard` stub, not the public header.** F12's UI bullet said "in the header", but the only header that exists is the marketing one, and reading a session there would force dynamic rendering on every public page and break `architecture.md`'s session-free `(marketing)` boundary. F17 owns the terminal avatar menu. (F12)
- **The intended destination survives sign-in, guarded by a pure `safeNext()`.** The proxy redirects to `/auth/login?next=<path>`; the callback honours `next` only when it starts with a single `/`, else `/dashboard`. `src/proxy.ts` is unreachable from tier 1, so path matching and next-validation move into `src/lib/auth/routes.ts` where an open redirect and an unguarded route are both testable. (F12)
- **All four Supabase clients ship in F12**, `admin.ts` included, even though nothing in this feature calls it. Its `import 'server-only'` guard is therefore observed failing a build rather than assumed — an unused module holding the RLS-bypassing key is exactly the thing that must not be trusted on sight. (F12)

- **The money tables grant `select` and nothing else.** No client role gets insert, update or delete on `funds`, `fund_ledger`, `orders`, `trades`, `holdings` or `positions`, and no write policy exists — every write arrives through a `security definer` function. `code-standards.md` already forbade a Server Action writing them directly, so a write grant would have existed only to be unused, and F10 established that an unused grant is a hole waiting for a mistaken policy. `architecture.md`'s "policies restricting all commands" is reworded to describe what is built. (F11)
- **Three of `trading-contract.md` §12's identities become CHECK constraints, not test assertions.** Identity 8 (a non-`OPEN` order holds no margin), identity 12 (longs hold no collateral and no reference price, shorts carry both) and identity 6 (`charge_breakdown` sums exactly to `charges`) are all row-level, so a violating row becomes unstorable rather than merely detectable later. The same treatment covers all-or-nothing fills, `limit_price` presence, and the zero-quantity rules. (F11)
- **That choice constrains F23 and F24, and `code-standards.md`'s `execute_order` example is corrected for it.** A CHECK is not deferrable and fires per statement, so setting `status = 'REJECTED'` and *then* calling `release_margin` — exactly what that example does — now fails on the first statement. The margin must be released first, or both columns written together. Making the invariant structural forces the ordering the contract already implied. (F11)
- **Foreign keys cascade from `orders` and from `profiles`.** A trade without its order is meaningless and a ledger row without its order is unauditable, so an orphan is never the right outcome. `reset_account` still deletes each table explicitly per §11 — the cascade is a backstop against a future path that forgets one, not the mechanism. (F11)

- **F10 creates only the two enums its own tables reference** — `quote_provider` and `candle_interval`. The five that only F11's tables use are created there. Each migration then reviews against the tables it creates, and nobody reading the schema in between finds five types with no referents. (F10)
- **`updated_at` is maintained by a Postgres trigger, not by the writer.** `quotes.updated_at` is what Realtime fires on, so a writer that omits it stops the price feed silently — a bug that presents as "prices froze" and points nowhere near the upsert. `touch_updated_at()` is shared with F11's `funds`, `holdings` and `positions`. (F10)
