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
**Last completed:** 13 Account bootstrap on first sign-in — `handle_new_user` writing profile, funds, `SIGNUP_CREDIT` and a watchlist inside the signup transaction, with a bounded 10-retry client ID. Verified on the real Google account: `ZR488045`, ₹1,00,000.00, §12.1 and §12.2 holding from the first moment. Found that `revoke execute … from public` leaves Supabase's direct grants to `anon` and `authenticated` intact — a `security definer` function stayed callable — and that a cascade assertion in `02-constraints-money` was passing only because no real account had ever existed
**Next:** 14 Instrument and holiday calendar seed — `nifty200.json`, an idempotent upsert into `instruments`, and this year's NSE closures into `market_holidays`. It is also what makes the default watchlist non-empty, so F13's "populated watchlist" check belongs to this feature

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

- **The default watchlist seeds by `INSERT…SELECT` against `instruments`.** F14 populates that table and runs *after* F13, so a plain insert would violate `watchlist_items`' foreign key today. Intersecting a fixed symbol list against whatever is seeded is FK-safe by construction, idempotent, and needs no change when F14 lands. The "populated watchlist" half of F13's original verify moves to F14, which is where it becomes checkable. (F13)
- **No backfill: the orphan account is deleted and re-created.** `auth.users` held one row with no profile, created while verifying F12, and a trigger on `auth.users` fires only on insert. Deleting it keeps signup as the only path that ever creates an account — worth more than sparing the test account. (F13)
- **`OPENING_BALANCE` is a literal in SQL, pinned from both sides.** The trigger cannot import `src/lib/constants.ts`, so the migration writes `100000.00` citing `trading-contract.md` §11, pgTAP asserts a bootstrapped account holds exactly that, and a tier-1 test pins the TypeScript constant. Both anchor to the contract rather than to each other, so drift fails a test instead of going unnoticed. (F13)
- **Client-ID generation is its own function so exhaustion is testable.** `generate_client_id()` is separate from `handle_new_user()` because the only way to prove the 10-attempt bound is to stub it, and a pgTAP transaction can `create or replace` it and roll back. Exhaustion fails the signup loudly: a user admitted without a `funds` row would break every money function that follows. (F13)
- **Sign-in is initiated server-side, not from a browser client.** A `<form>` posts to a Server Action that calls `signInWithOAuth` and `redirect()`s to Google, so sign-in works with JavaScript disabled — the standard F07B set for the support form — and `/auth/login` stays a Server Component. The PKCE verifier is written by the same client that reads it back in the callback. `library-docs.md`'s client-side snippet is corrected in the same change. (F12)
- **The signed-in identity and sign-out control live on the `/dashboard` stub, not the public header.** F12's UI bullet said "in the header", but the only header that exists is the marketing one, and reading a session there would force dynamic rendering on every public page and break `architecture.md`'s session-free `(marketing)` boundary. F17 owns the terminal avatar menu. (F12)
- **The intended destination survives sign-in, guarded by a pure `safeNext()`.** The proxy redirects to `/auth/login?next=<path>`; the callback honours `next` only when it starts with a single `/`, else `/dashboard`. `src/proxy.ts` is unreachable from tier 1, so path matching and next-validation move into `src/lib/auth/routes.ts` where an open redirect and an unguarded route are both testable. (F12)
- **All four Supabase clients ship in F12**, `admin.ts` included, even though nothing in this feature calls it. Its `import 'server-only'` guard is therefore observed failing a build rather than assumed — an unused module holding the RLS-bypassing key is exactly the thing that must not be trusted on sight. (F12)
- **The money tables grant `select` and nothing else.** No client role gets insert, update or delete on `funds`, `fund_ledger`, `orders`, `trades`, `holdings` or `positions`, and no write policy exists — every write arrives through a `security definer` function. `code-standards.md` already forbade a Server Action writing them directly, so a write grant would have existed only to be unused, and F10 established that an unused grant is a hole waiting for a mistaken policy. `architecture.md`'s "policies restricting all commands" is reworded to describe what is built. (F11)
- **Three of `trading-contract.md` §12's identities become CHECK constraints, not test assertions.** Identity 8 (a non-`OPEN` order holds no margin), identity 12 (longs hold no collateral and no reference price, shorts carry both) and identity 6 (`charge_breakdown` sums exactly to `charges`) are all row-level, so a violating row becomes unstorable rather than merely detectable later. The same treatment covers all-or-nothing fills, `limit_price` presence, and the zero-quantity rules. (F11)
