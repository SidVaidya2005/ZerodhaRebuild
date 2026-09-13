> **One phase of `context/build-plan.md`.** That index carries the Core Principle and the phase list.
> **Read only the phase you are building.** A finished phase is history — its still-binding decisions
> live in `constraints.md`, its narrative in `build-journal.md`, and re-reading it here costs tokens for nothing.

## Phase 2 — Data Foundation & Auth

### 09 Test harness

Stand up all three test tiers before the schema they will police exists, so no later feature can be
written without a way to prove it. Tiers and rules are defined in `code-standards/testing.md`.

**The spike in this feature's original Verify block has been run, and it failed.**
`supabase test db --db-url` connects to the remote database and *then* dies with
`LegacyDockerRunError` — the CLI shells out to `pg_prove` in a container regardless of where the
database lives. The fallback that block pre-authorised is therefore mandatory, not optional. pgTAP
itself installed cleanly on the hosted database (1.3.3), so only the *runner* was ever the problem.

**Logic:**

- **Provisioning is already done** (2026-08-21): one project, `zerodha-rebuild-dev` / `kefggygenlprjzhiocai` / ap-south-1, linked, `.env.local` and `.env.test.local` written and both verified connecting. There is deliberately **no second project**.
- **First migration of the project:** `enable_pgtap` creating the extension in the `extensions` schema. Tracked rather than created ad hoc by the runner — an untracked extension the tests silently depend on is worse than a tracked one, because a fresh database looks fine until the suite runs and the migration history stops describing the database. pgTAP adds functions in a schema nothing else uses and no tables, so the cost to the single production project is close to zero.
- **`scripts/run-pgtap.mts` replaces `supabase test db`.** It reads `.env.test.local`, executes each `supabase/tests/*.sql` through `pg`, and collects the text rows the pgTAP functions return — `plan()` yields `1..n`, `ok()` yields `ok N - desc` or `not ok N - desc`, so those rows **are** the TAP stream and no reporter needs installing. It parses them, names the file and assertion on failure, and exits non-zero.
- **Written in TypeScript with no new runner dependency.** Node 26 strips types natively (verified), so `node scripts/run-pgtap.mts` runs directly; adding `tsx` for one script would be a dependency the stack does not need.
- **The runner must catch a plan mismatch, not only `not ok`.** A file declaring `plan(2)` that runs one assertion has to fail — that is the failure mode a naive grep misses.
- `tests/concurrency/helpers.ts`: client-pair factory, seeded fixtures under the `zr-race-` prefix, and `afterEach` cleanup that runs on failure as well as success.
- **Tier 3 is gated behind `ALLOW_RACE_TESTS` and must exit before opening a connection** when it is unset. It commits into the single production database; that guard is the thing standing between a routine `pnpm test:all` and real rows.
- `vitest.config.race.mts` scoped to `tests/concurrency/**`, because tier 1's config includes only `src/**/*.test.ts`. Scripts: `test:db`, `test:race`, `test:all`.
- **`pnpm db:push:test` is dropped.** One database means one push command, and `pnpm supabase db push` already is it. A second script reaching the same place by a different mechanism, named for a test project that no longer exists, is a trap. Removed from `CLAUDE.md` too.
- **Tier 2 ships a smoke test only.** No schema exists yet, so `01-rls.sql` and friends would assert nothing; they land with F10/F11, which create the tables they police. What this feature must prove is that the runner works — including that it fails correctly.
- `pg` and `@types/pg` added to the approved dependency list, dev-only and never imported by application code.

**Verify:**

- **The runner is observed failing before it is trusted.** Add a deliberate `select ok(false, …)`, run `pnpm test:db`, confirm it exits **non-zero** and names the file and the failing assertion; revert and confirm green. A harness that has only ever passed proves nothing.
- **A plan mismatch fails too**: declare `plan(2)` with one assertion and confirm the runner reports it rather than silently passing.
- Tier 2 genuinely reaches the database: `00-smoke.sql` asserts `has_extension('pgtap')`, which cannot pass without a real connection.
- Tier 2 leaves nothing behind: run `pnpm test:db` twice, confirm identical output and no new rows — the `begin/rollback` wrapper doing its job.
- **The tier-3 guard is observed refusing.** With `ALLOW_RACE_TESTS` unset, `pnpm test:race` exits **without opening a connection**, confirmed by its absence from `pg_stat_activity` rather than by it printing a skip message.
- Tier 3 opens two real backends: `pg_backend_pid()` returns two different values, and both connections close.
- Cleanup survives failure: make a race test throw mid-run and confirm `afterEach` still removed its `zr-race-` rows.
- `pnpm test` does not pick up tiers 2 or 3 — the tier-1 count is unchanged.
- `pnpm supabase db push` applies the migration cleanly and re-running is a no-op; migration history lists exactly one entry.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all exit zero, and `grep -rn "from 'pg'" src/` returns nothing.

### 10 Database schema: identity and market data

The first real schema migration: two enums, eight tables, their RLS policies and grants, one
shared `updated_at` trigger, the `quotes` Realtime publication entry, and the pgTAP suites that
prove the policies hold. No seed data (F14), no bootstrap trigger (F13), and no write path for
`symbol_demand` (F18) — this feature builds the shape, not the contents.

**Logic:**

- The project is already created and linked (2026-08-21, `zerodha-rebuild-dev`); this feature adds the migration, not the provisioning.
- **Only the two enums this feature's tables reference** — `quote_provider` and `candle_interval`. The other five belong to F11's tables and are created there, so each migration stays reviewable against the tables it creates.
- `public.touch_updated_at()`, a `before update` trigger function setting `new.updated_at = now()`, attached to `quotes` and reused by F11's `funds`, `holdings` and `positions`. **Postgres owns the column, not the writer**: a writer that forgets it stops Realtime firing silently, and that bug presents as "prices froze" while pointing nowhere near the upsert.
- Tables in dependency order — `instruments` first, then `quotes`, `candles`, `candle_sync`, `symbol_demand` and `market_holidays`; `profiles` before `watchlist_items`.
- `quotes` carries `provider` and `provider_ts` and **no `source` column** — freshness is derived at read time, per `architecture.md` → Quote Provenance.
- Constraints: `profiles.client_id` unique, `profiles.theme` `check (theme in ('light','dark'))`, `instruments.is_active` default true.
- **`profiles.theme` defaults to `'dark'`, not `'light'`.** `architecture.md` said light while `project-overview.md` specifies a dark-default terminal and `theme-provider.tsx` ships `defaultTheme="dark"`; the scope document wins and `architecture.md` is corrected in the same commit.
- Indexes: `watchlist_items_symbol_idx` on the non-leading foreign key — that table's primary key leads with `user_id`, so symbol lookups are not covered by it. Search indexes on `instruments` wait for F18, which writes the query they would serve.
- **RLS on all eight, with grants revoked and granted back** per the F07B posture. User-owned tables (`profiles`, `watchlist_items`) are scoped to the owner; the six reference tables get a `select` policy for `authenticated` and **no write policy for any role**.
- **Policies read `(select auth.uid())`, never bare `auth.uid()`** — the bare call is re-evaluated per row, the subselect once per query (Supabase's Postgres best-practices guide). Semantically identical, so `architecture.md`'s invariant still reads true.
- **No `anon` grant anywhere.** Every surface showing an instrument or a price is under `(terminal)`, and F04 already decided the marketing site quotes no prices; the publishable key sits in the browser bundle, so an `anon` grant would publish the whole instrument universe.
- `profiles` gets no `insert` grant — F13's bootstrap trigger runs as definer — and no `delete`, which cascades from `auth.users`.
- `quotes` added to the `supabase_realtime` publication, keeping **default replica identity**: `payload.new` is fully populated for `postgres_changes`, and `replica identity full` would roughly double WAL for an `old_record` nothing reads.
- `src/types/database.ts` regenerated.
- Two pgTAP suites keeping the established `01-rls-<area>.sql` convention: `01-rls-identity.sql` and `01-rls-market-data.sql`.

**Verify:**

- `pnpm supabase db push` applies cleanly, a second push reports up to date, and `pnpm supabase migration list` shows exactly three entries.
- Types regenerate and compile: `pnpm typecheck` exits 0 and `grep -n ': any' src/types/database.ts` returns nothing.
- The `quotes` table has no `source` column — pgTAP `throws_ok($$select source from public.quotes$$, '42703')`.
- Signed in as user A, `is_empty()` on both `profiles` and `watchlist_items` targeting user B's ids.
- As `authenticated`, insert, update and delete on `quotes`, `candles` and `candle_sync` each raise `42501` — a missing grant, not a policy filtering rows away.
- `anon` reaches nothing: `has_table_privilege('anon', …, 'select')` is false for all six reference tables.
- **The trigger sets `updated_at`, not the writer**: update a `quotes` row without naming the column and assert the new value exceeds the old.
- Realtime will actually fire: `pg_publication_tables` has one row for `pubname = 'supabase_realtime'` and `tablename = 'quotes'`.
- `explain` on a `watchlist_items` query filtering by `symbol` shows an Index Scan rather than a Seq Scan.
- **The suites are observed failing**: drop one policy and one grant, confirm the named assertion goes red, restore, confirm green.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` and `pnpm format:check` all exit 0.

### 11 Database schema: funds, orders, and portfolio

The money schema. `trading-contract.md` is authoritative for every column, constraint and default
here. Three of its §12 reconciliation identities are row-level and become **CHECK constraints**
rather than test assertions, so a violating row cannot be stored at all. No functions (F22–F24),
no bootstrap (F13), no seed.

**Logic:**

- Migration creating the five remaining enums — `order_side`, `order_type`, `product_type`, `order_status`, and `ledger_type` with all eight values including `SIMULATION_ADJUSTMENT` and **no `RESET`** (`trading-contract.md` §11) — then `funds`, `fund_ledger`, `orders`, `trades`, `holdings`, `positions` in dependency order.
- `orders.blocked_margin` and `positions.blocked_margin`, both `numeric(14,2) not null default 0`, plus `positions.entry_reference_price numeric(14,2)` — the gross collateral basis, null for longs and non-null for shorts.
- `trades.is_auto_squareoff boolean not null default false`, `trades.charge_breakdown jsonb not null`, and `trades.realised_pnl numeric(14,2) not null default 0` — `0.00` on every opening leg, never null (§9).
- **`charge_breakdown`'s keys are snake_case**: `brokerage`, `stt`, `exchange_txn`, `sebi_turnover`, `stamp_duty`, `dp_charge`, `gst`. Postgres is snake_case and TypeScript is camelCase (`code-standards.md`), so `charges.ts` keeps its own casing and F22's equality test converts at the boundary.
- **Three §12 identities encoded as CHECK constraints**, each commented with the clause it enforces:
  - Identity 8 — `check (status = 'OPEN' or blocked_margin = 0)`. Every order not `OPEN` holds no margin.
  - Identity 12 — `check (net_quantity < 0 or blocked_margin = 0)` and `check ((net_quantity < 0) = (entry_reference_price is not null))`. Longs hold no collateral and carry no reference price; shorts carry both.
  - Identity 6 — the seven `charge_breakdown` components sum exactly to `charges`. §2 makes `charges` the sum of already-rounded components, so the equality is exact and reconciliation cannot fail by a paisa.
- **A CHECK is not deferrable, and that constrains F23/F24.** Identity 8 fires per statement, so a function that sets `status = 'REJECTED'` and *then* calls `release_margin` fails on the first statement. `code-standards.md`'s `execute_order` example does exactly that and **is corrected in this feature's commit** — release the margin first, or write both columns in one statement.
- The contract's other row-level rules, likewise as CHECKs: `available_cash >= 0` (§12.4), `orders.quantity > 0`, `holdings.quantity > 0` and `positions.net_quantity <> 0` (a row at zero is deleted, never retained, §8), all-or-nothing fills `check (filled_quantity = 0 or filled_quantity = quantity)` (§1), `check ((order_type = 'LIMIT') = (limit_price is not null))`, `check ((status = 'COMPLETE') = (average_price is not null))`, and `fund_ledger.balance_after >= 0`.
- `positions.product` is CHECK-constrained to `MIS`. CNC settles into `holdings`, so a CNC position is a bug rather than a state; the constraint is dropped if that ever changes.
- **`select` is the only grant, and only to the owner.** No client role gets insert, update or delete on any of the six, and no write policy exists. `code-standards.md` already forbids a Server Action writing these tables directly — every write arrives through a `security definer` function in F22–F24. `architecture.md`'s "policies restricting all commands" is reworded in the same commit to describe what is actually built.
- Foreign keys **cascade**: `trades.order_id` and `fund_ledger.order_id` from `orders`, and every `user_id` from `profiles`. `reset_account` still deletes each table explicitly per §11; the cascade is a backstop against a future path that forgets one, not the mechanism.
- Indexes: `orders (user_id, placed_at desc)`, `fund_ledger (user_id, created_at desc)`, a partial `orders (symbol) where status = 'OPEN'` for the matcher's join against `quotes`, `trades (user_id, traded_at desc)` for Reports, and the foreign-key columns no primary key already covers.
- `touch_updated_at()` from F10 is reused on `funds`, `holdings` and `positions`. `orders` tracks `placed_at`/`executed_at` instead and needs no `updated_at`; `trades` are immutable once written.
- `orders` added to the `supabase_realtime` publication.
- Types regenerated.
- Two pgTAP suites: `01-rls-money.sql` (the denial matrix) and `02-constraints-money.sql` (every CHECK and foreign key driven to failure on purpose).

**Verify:**

- `pnpm supabase db push` applies cleanly, a second push reports up to date, and `migration list` shows exactly four entries.
- Types regenerate and compile: `pnpm typecheck` exits 0, fifteen tables and seven enums are present, and `grep -n ': any'` returns nothing.
- Signed in as user A, `is_empty()` on all six tables targeting user B's ids.
- **No client role can write any of the six**: `throws_ok(…, '42501')` for insert, update and delete on each — eighteen assertions, including that `update funds set available_cash = 999999` and a direct `insert into holdings` are both refused.
- `has_table_privilege('anon', …, 'select')` is false for all six.
- Cash cannot go negative: `throws_ok(update funds set available_cash = -1, '23514')`.
- **Identity 8**: inserting an order with `status = 'COMPLETE'` and `blocked_margin = 100` raises `23514`.
- **Identity 12**: a long with `blocked_margin > 0` raises `23514`; so does a long carrying `entry_reference_price`, and a short without one.
- **Identity 6**: a `charge_breakdown` one paisa off its `charges` total raises `23514`.
- All-or-nothing: `quantity = 10, filled_quantity = 4` raises `23514`. A zero-quantity holding and a zero-net-quantity position both raise `23514`.
- A `LIMIT` order without a `limit_price`, and a `MARKET` order carrying one, both raise `23514`.
- Deleting an order removes its trades and its ledger rows — insert both, delete the order, assert `is_empty` on each.
- `explain` on the matcher's open-order-by-symbol query at volume shows an Index Scan on the partial index, not a Seq Scan.
- `pg_publication_tables` has one row for `pubname = 'supabase_realtime'` and `tablename = 'orders'`.
- **The suites are observed failing**: drop one CHECK and one policy, confirm the named assertions redden, restore, confirm green — each break inside a transaction that rolls back, so the production schema is never left modified.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` and `pnpm format:check` all exit 0.

### 12 Google sign-in and route protection

Google OAuth through Supabase Auth, session refresh and a route guard in `src/proxy.ts`, and a
minimal signed-in landing page so `/dashboard` is a real destination rather than a 404. Sign-in is
**initiated server-side** — a `<form>` posting to a Server Action that calls `signInWithOAuth` and
redirects to Google — so it works with JavaScript disabled, the standard F07B set for the support
form. `library-docs.md` → Google OAuth sign-in showed the client-side variant and is corrected here.

**UI:**

- `/auth/login`: a Server Component with a `<main>` landmark, a single Google button submitted by a
  form action, and an error region reading `?error=auth` from the awaited `searchParams`.
- **The signed-in identity and sign-out control live on the `/dashboard` stub, not the public
  header.** Reading the session in the `(marketing)` layout would force dynamic rendering on `/`,
  `/about`, `/pricing` and `/support` and break `architecture.md`'s "public, session-free pages"
  boundary. `SiteHeader` is untouched; F17 owns the terminal avatar menu.
- `src/app/(terminal)/dashboard/page.tsx`: minimal — a `getUser()` guard, the Google name and email,
  and a sign-out form. No group layout, no data, no shell. F17 replaces it wholesale.
- **Carried over from the Phase 1 checkpoint: the page this replaces has no `<main>` landmark**, and
  it is the only public route scoring below 100 on Lighthouse (97, `landmark-one-main`). The F03 stub
  was a bare `<div>`; the real page must render `<main>` and take the route to 100.

**Logic:**

- Google OAuth configured in Supabase; `https://kefggygenlprjzhiocai.supabase.co/auth/v1/callback`
  registered in the Google Cloud console, and Site URL plus additional redirect URLs covering the
  local and Render origins. This is console work, and nothing downstream verifies without it.
- `src/lib/auth/routes.ts` — `TERMINAL_PREFIXES`, `isTerminalPath()` and `safeNext()` as pure
  functions. `src/proxy.ts` cannot be reached by tier 1, but these two are where a bug is silent and
  expensive: an unguarded route, or an open redirect. The proxy imports them; tier 1 tests them.
- All four Supabase clients from `architecture/patterns.md` → Key Patterns: `client.ts`, `proxy.ts` and
  `admin.ts` join the existing `server.ts`, copied verbatim — the cookie handling is not re-derived.
  `admin.ts` ships with `import 'server-only'` and no caller in this feature, so its guard is proven
  by hand rather than assumed.
- `src/server/actions/auth.ts` — `signInWithGoogle` (redirectTo `${NEXT_PUBLIC_SITE_URL}/auth/callback`
  carrying `next`) and `signOut`. **Both deviate from the standard Server Action shape**: no `input`,
  no `ActionResult`, ending in `redirect()`. `code-standards.md` carries the exception beside the
  `useActionState` one. `redirect()` is called outside any `try` — catching `NEXT_REDIRECT` would
  break the flow silently.
- `/auth/callback` route handler exchanging the code for a session, honouring `x-forwarded-host`
  outside development (Render sits behind a proxy), and sending failures to `/auth/login?error=auth`.
- `src/proxy.ts` refreshing the session and guarding the terminal prefixes, redirecting to
  `/auth/login?next=<pathname>`. **The intended destination survives sign-in**: the callback honours
  `next` only when `safeNext()` accepts it — a single leading `/` — and falls back to `/dashboard`.
  That guard is what stops the callback becoming an open redirect.
- `SupportForm.tsx` keys its form-level banner off `Object.keys(fields).length === 0`, fixing the
  carried-over bug below.

**Verify:**

- Signed-out terminal requests are guarded and remember their destination:
  `curl -sI localhost:3000/holdings` returns **307** with `Location: /auth/login?next=%2Fholdings`.
- Public routes are not intercepted: `curl -sI` on `/`, `/pricing` and `/support` each return **200**
  with no `Location` header.
- The callback's failure branch is provable without Google: `curl -sI
  'localhost:3000/auth/callback?code=bogus'` redirects to `/auth/login?error=auth`, and that page
  renders the error copy.
- **The callback is not an open redirect** — `pnpm test`: `safeNext()` rejects `https://evil.com`,
  `//evil.com` and `javascript:…`, returning `/dashboard` for each.
- Every terminal prefix is covered and no public path is — `pnpm test`: `isTerminalPath` over all
  eight prefixes plus four public paths.
- Sign-in works end to end, verified manually in a browser: signing in at `/auth/login` lands on
  `/dashboard`, the page renders the Google name, and an `sb-*-auth-token` cookie is set.
- Deep-link intent survives: visiting `/positions` signed out and then signing in lands on
  `/positions`, not `/dashboard`.
- Sign-out really ends the session: the button returns to `/`, the `sb-*-auth-token` cookie is gone,
  and `/dashboard` redirects to `/auth/login`.
- `pnpm audit:a11y /auth/login` scores **100**, closing the `landmark-one-main` failure the Phase 1
  checkpoint recorded — confirmed by reading `finalDisplayedUrl` out of the report, not by trusting
  the score (F05).
- **`supabase/tests/01-rls-support-messages.sql` gains an `authenticated` arm.** This feature is what
  makes that role reachable on the contact form: the server client carries request cookies, so from
  here on a signed-in visitor inserts as `authenticated` rather than `anon`. The policy already names
  both, but only `anon` has ever been tested — so the role most submissions will use would otherwise
  ship with zero coverage. Assert insert allowed, and select / update / delete refused with `42501`,
  exactly as the `anon` arm does. Falsified once by flipping an assertion and confirming the runner
  names the file and the assertion.
- Clients are constructed in exactly one place: `grep -rn "createServerClient\|createBrowserClient" src/`
  returns only files under `src/lib/supabase/`.
- **`admin.ts`'s server-only guard is observed, not assumed**: importing it into a Client Component
  fails `pnpm build`; reverted after (the F01 falsifiability precedent).
- Also carried over: `SupportForm.tsx` suppresses the form-level error banner whenever
  `state.error.fields` is truthy, and `{}` is truthy. Any Zod issue with an empty path — a
  schema-level `.refine()`, an `unrecognized_keys` — would re-render the form with no visible
  explanation. Proven fixed by adding a temporary empty-path `.refine()`, confirming the banner
  appears, and reverting.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all exit zero.

### 13 Account bootstrap on first sign-in

Everything an account needs, created inside the signup transaction: the `profiles` row and its
`ZR######` client ID, the `funds` row at `OPENING_BALANCE`, the single `SIGNUP_CREDIT` ledger entry
that accounts for that cash, and a default watchlist. All four succeed or the signup fails — a user
who gets in without a `funds` row would break every money function that follows.

**UI:**

- The `/dashboard` stub grows two lines: the client ID and available cash. It makes this feature's
  headline claim visible in the product rather than only in SQL, and it is the **first read of a
  money table through a real session** — exercising the `select`-only grant and the `auth.uid()`
  policy F11 built, which until now only pgTAP has touched.

**Logic:**

- `public.generate_client_id()` as its own function, returning `ZR` + six digits. Separate from its
  caller because the exhaustion path can only be tested by stubbing it, and a pgTAP transaction can
  `create or replace` it and roll back.
- `public.handle_new_user()` — `security definer`, `set search_path = ''`, `execute` revoked from
  `public` — on an `after insert` trigger on `auth.users`. It retries generation up to 10 times on a
  unique violation and then raises `CLIENT_ID_EXHAUSTED`: bounded, never an infinite loop, and never
  a silently half-created account.
- Name and avatar coalesce Google's two spellings each (`full_name`/`name`, `avatar_url`/`picture`)
  and tolerate both being absent — `profiles.full_name` is nullable.
- **`OPENING_BALANCE` is a literal `100000.00` in SQL**, cited to `trading-contract.md` §11. The
  trigger runs in Postgres and cannot import `src/lib/constants.ts`, so both sides are pinned to the
  contract's number by their own test rather than to each other.
- **The default watchlist seeds by `INSERT…SELECT` against `instruments`**, intersecting a
  ten-symbol large-cap list against whatever is seeded. F14 populates `instruments` and runs *after*
  this feature, so a plain `INSERT` would violate the foreign key today. This is FK-safe by
  construction, idempotent, and starts working the moment F14 lands with no change here.
- **No backfill path.** `auth.users` currently holds one row with no profile, created while
  verifying F12. That account is deleted and re-created by signing in again, which keeps signup as
  the only path that ever creates an account.

**Verify:**

- pgTAP: signup creates exactly one `profiles` row, `client_id ~ '^ZR\d{6}$'`, `theme = 'dark'`.
- pgTAP: `full_name` and `avatar_url` are copied from `raw_user_meta_data`, and a user with **no**
  metadata still bootstraps with `full_name` null rather than failing.
- pgTAP: `available_cash = 100000.00`, `used_margin = 0`, `opening_balance = 100000.00`; a tier-1
  test pins `OPENING_BALANCE` to the same figure from the other side.
- pgTAP: exactly one `fund_ledger` row — `SIGNUP_CREDIT`, `+100000.00`, `balance_after = 100000.00`,
  `order_id` null.
- pgTAP: **§12.1 and §12.2 hold from the first moment** — `sum(amount) = available_cash`, and the
  newest `balance_after` equals `available_cash`.
- pgTAP: with `instruments` empty the watchlist seed inserts **zero rows and raises nothing**; with a
  three-symbol fixture it inserts exactly three, in list order. The "populated watchlist" half of
  this feature's original verify moves to F14, which is what makes it checkable.
- pgTAP: re-running the bootstrap for the same user leaves one profile and one `SIGNUP_CREDIT` —
  every insert is `on conflict do nothing`.
- pgTAP: **exhaustion is bounded and clean.** With generation stubbed to a constant, signup raises
  `CLIENT_ID_EXHAUSTED` after **exactly 10** attempts, counted by a sequence the stub increments, and
  leaves no `auth.users`, `profiles`, `funds` or `fund_ledger` row behind.
- pgTAP: the trigger is not a client-callable write path — `has_function_privilege('authenticated',
  'public.handle_new_user()', 'execute')` is false.
- `pnpm test:race`: two connections signing up concurrently both succeed with **different** client
  IDs and complete accounts. Seeded as `zr-race-*@example.com` and cleaned in `afterEach`; this is
  the only tier that can express it, since pgTAP is one session in one transaction.
- End to end: the orphan `auth.users` row is deleted, and signing in with Google again lands on
  `/dashboard` showing a `ZR######` client ID and **₹1,00,000.00**.
- `pnpm test`, `pnpm test:db`, `pnpm lint`, `pnpm typecheck` and `pnpm build` all exit zero.

### 14 Instrument and holiday calendar seed

Two committed JSON files and two scripts, separating **refresh** (hit NSE and Yahoo, rewrite the
files — done in January or on a rebalance) from **seed** (read the files, upsert into Postgres —
deterministic, offline, idempotent). Both NSE endpoints are undocumented and one of them already
403s on its warm-up URL from this machine, so a seed that depended on them live would break
unpredictably and would change ~200 rows with no diff to review first.

**Logic:**

- `scripts/fetch-reference-data.mts` — the Nifty 200 constituents from NSE's published CSV
  (`ind_nifty200list.csv`, which carries Company Name, Industry, Symbol and ISIN) and the trading
  calendar from NSE's holiday-master API (`CM` segment). `sector` comes from the `Industry` column
  rather than being invented, so every value is attributable to the source.
- **Every `yahoo_symbol` is probed, not sampled.** The symbol is derived as `${symbol}.NS`, and that
  rule is wrong for a handful of names every year. Yahoo answers 200 for a real symbol and 404 for a
  fake one, so the script probes all ~200 with throttling and **refuses to write the JSON** if any
  fail, naming them. A five-symbol spot check samples 2.5% of the universe and the failure it misses
  stays invisible until someone opens that stock's page in Phase 5.
- `scripts/seed-reference.mts` — upserts both files through the **service-role client**.
  `instruments` and `market_holidays` grant `select` only, and seeding reference data is precisely
  the administrative act that key exists for. It reads `.env.local` and needs no connection string.
- Upsert by primary key — `symbol`, `trading_date`. Existing rows update, **none are deleted**: a
  symbol dropped from the index keeps its row, because holdings and trades reference it.
- **Holidays are stored exactly as NSE publishes them, weekend entries included.** The published list
  contains dates such as Sunday 15-Feb-2026; dropping them would be an editorial judgement about a
  published calendar, and `isTradingSession()` decides weekends independently, so it changes no
  behaviour. The JSON carries a note recording that it needs re-fetching each January.
- Both scripts are tooling, not application code: `scripts/`, run by `node`, never imported by
  `src/` — the same standing as `run-pgtap.mts`. `pnpm seed` is added to `package.json` and to
  `CLAUDE.md`'s command list.

**Verify:**

- **Seeding twice leaves one universe, not two**: run `pnpm seed` twice and confirm
  `select count(*) from instruments` is identical across both runs and lands near 200.
- **The Yahoo probe is deferred with Yahoo itself** (see below). `--probe` runs it and refuses to
  write on any 404; without the flag the JSON records `yahoo_validated: false`, so nobody downstream
  mistakes "seeded" for "verified". pgTAP still asserts the shape: no row has an empty
  `yahoo_symbol`, every one ends in `.NS`, and every one is derived from its own symbol rather than
  copied from a neighbour.
- The universe is real rather than a placeholder — pgTAP: between 190 and 210 rows, every row has a
  non-empty `name`, and `RELIANCE`, `TCS` and `INFY` are present with the expected `yahoo_symbol`.
- Sectors came from the source — pgTAP: fewer than 30 distinct non-null sectors and no empty string.
  A column misalignment in the CSV parse is what this catches.
- The calendar matches what NSE published — pgTAP: `Republic Day` on `2026-01-26`, `Holi` on
  `2026-03-03`, every `description` non-empty, and every row inside 2026.
- **Dates survive the timezone round trip** — pgTAP: `2026-01-26` is stored as exactly that date. A
  UTC-parsed `26-Jan-2026` landing on the 25th is the bug this exists to catch.
- A refresh is reviewable rather than silent: re-running the fetch with the upstream unchanged
  produces **no git diff**, which requires stable ordering and formatting in both files.
- The seed needs no test credentials: `grep` confirms neither script reads `TEST_DATABASE_URL`, and
  seeding succeeds with only `.env.local` present.
- **The default watchlist is finally non-empty** — carried over from F13, whose bootstrap seeds by
  `INSERT…SELECT` against `instruments`: a new signup after this feature lands holds ten watchlist
  rows in the declared order.

**Deferred out of this feature (2026-08-21):** Yahoo blocked this machine's IP for over 40 minutes
after a 200-symbol probe, and **Yahoo is deferred to the end of the project** by decision. The probe
code ships behind `--probe` rather than being deleted, because it is exactly what must run when Yahoo
returns. Until then the universe is seeded but unvalidated, and `yahoo_validated: false` in the JSON
says so.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` and `pnpm build` all exit zero.

### 15 Quote provider chain

The market library everything in Phase 3 reads: NSE session logic, price provenance, a simulator that
walks from a real market close, and the thin provider seam they plug into. Nothing here renders UI or
writes to the database — F16's tick is the first caller.

**Yahoo is deferred to the end of the project (decided 2026-08-21), so this chain ships
simulator-backed.** Twelve Data's free plan carries no NSE symbols at all (verified against the live
API — `library-docs.md` → Quote providers), and NSE's own `quote-equity` endpoint answers 403 from
here, so the simulator is the only provider that can serve a price until Yahoo returns. The interface,
circuit breaker and provenance helpers are all built now — a real provider drops into a finished
chain, not the reverse — but the running system quotes `SIMULATOR`, and every price on screen badges
`SIMULATED`. That is honest by construction; what it must not do is coexist with copy promising real
prices, so **`/` and `/about` must be reconciled before F39 deploys** if Yahoo has not landed by then.

**Logic:**

- **`instruments.prev_close`, seeded from NSE's bhavcopy.** `library-docs.md` said the simulator seeds
  "from `instruments` reference data", but that table carries no price, so a cold start had nothing to
  walk from. Bhavcopy (`nsearchives.nseindia.com/products/content/sec_bhavdata_full_*.csv`) is on the
  same host as the constituent list and is reachable — it is the archive, not the blocked API. The
  F14 fetch script gains a pass that walks back day by day until a file returns 200, filters to
  `SERIES = EQ`, and trims every field (the CSV carries leading spaces in its values).
- **The real close is a seed, never a quote.** No `NSE_BHAVCOPY` enum value and no provenance rewrite:
  `quotes.provider` stays `SIMULATOR` with a null `provider_ts`, so every price badges `SIMULATED`.
  What changes is that the figures are plausible instead of ₹1,000 for both MRF and YESBANK.
- `market-hours.ts` exposes **two shapes over one clock**: a pure `marketStatusAt(date, holidays)`
  that tier 1 can falsify, and the async `isTradingSession(supabase, date)` that `code-standards.md`
  already shows callers using. The holiday set is injected into the pure core, never fetched inside
  it. `getMarketStatus()` returns PRE-OPEN / OPEN / CLOSED **and the next transition**, so F20's pill
  renders a value rather than re-deriving the trickiest arithmetic in the module.
- `provenance.ts` — `deriveSource()` and the `Provenance` type from `architecture.md` → Quote
  Provenance, unchanged. `LIVE` remains structurally unreachable: no provider declares itself
  realtime.
- `QuoteProvider` interface (`name`, `isAvailable()`, `fetchQuotes(symbols)`), an ordered chain, and a
  **per-provider circuit breaker** — all exercised against a deliberately failing fake. F14 is why the
  breaker is the piece worth having: Yahoo's IP block outlasted 40 minutes of polling.
- **The token-bucket limiter is deferred** until something actually makes outbound requests. A rate
  limiter in front of a local simulator caps nothing.
- `SimulatorProvider` — a bounded geometric random walk clamped to ±5% of `prev_close` per session,
  seeded from the last `quotes` row and falling back to `prev_close`. Injected clock and RNG, so it is
  deterministic under test. With neither available it reports **unavailable** rather than inventing a
  base price.
- **The quote windows are set by assumption and labelled as such.** `architecture.md` carries a
  standing TODO to measure Yahoo's real `regularMarketTime` lag; that cannot be done while Yahoo is
  deferred, so `QUOTE_STALE_AFTER_MS` (5 min, the §5 fill gate), `QUOTE_DELAYED_WINDOW_MS` (15 min)
  and `QUOTE_LIVE_WINDOW_MS` (5 s, inert) each carry a comment saying they are unmeasured and what
  would change them.
- **Candles are out of this feature.** No source covers the 1D and 1W intraday ranges — bhavcopy gives
  one daily bar and Yahoo's chart endpoint is deferred — and F33 is the first feature that draws a
  chart. Deciding a chart pipeline four features before anything renders one is the thing being
  avoided. `CandleProvider`, `candle_sync` and the TTLs move to F33.

**Verify:**

- **Session boundaries are exact** — `pnpm test`: 09:14:59 closed, 09:15:00 open, 15:29:59 open,
  15:30:00 closed, all evaluated in IST.
- **The timezone is real, not the server's** — the same instants assert identically under `TZ=UTC` and
  `TZ=America/New_York`. A test that only passes in one zone proves nothing about a server in Oregon.
- Holidays close the market — `2026-01-26` reports closed at 11:00 IST despite being a Monday, read
  from the calendar F14 seeded; the Sunday entry in that calendar changes nothing.
- Status carries three states and a next transition — 09:05 → `PRE-OPEN` with next transition 09:15;
  16:00 on a Friday → `CLOSED` with next transition Monday 09:00, skipping the weekend.
- **`LIVE` is structurally unreachable** — no provider and no age produces it. `SIMULATOR` →
  `SIMULATED`; a null `provider_ts` → `STALE`; beyond the delayed window → `STALE`.
- **The breaker actually opens** — a fake provider failing twice trips its circuit, the chain falls
  through to the simulator, and the failed provider is not called again until the window elapses on
  the injected clock.
- The simulator is bounded and deterministic — the same seed and clock produce the same series; ten
  thousand steps never leave ±5% of `prev_close`; every quote it returns carries
  `provider: 'SIMULATOR'` and a null `provider_ts`.
- **It walks from a real close rather than a constant** — `pnpm test:db`: every instrument has a
  non-null `prev_close` greater than zero, and RELIANCE's falls in a plausible band. `pnpm test`: with
  no last quote and no `prev_close`, the simulator reports unavailable instead of inventing a base.
- **Nothing here touches the network or the database** — `grep` finds no `fetch(` and no Supabase
  import under `src/lib/market/providers/`, and the pure core of `market-hours.ts` takes its holidays
  as an argument.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` and `pnpm build` all exit zero.

### 16 Market tick Edge Function and schedule

The scheduled job that puts prices in the database. Built now, with the simulator as its only
provider, precisely so the risky parts — the schedule, the Vault credential, the gateway's
authentication, and the session gate — are all proven before a real provider exists. Yahoo later drops
into a pipeline that has already been exercised rather than into an untested one.

> **Superseded in part (6.00.05): no provider is coming.** The simulator is the whole chain by
> decision, so the "Yahoo later drops in" framing above is now historical — it is why the feature was
> shaped this way, not a pending obligation. **The feature itself is unchanged**: it was always
> simulator-only, and it is still what makes prices move, matches limit orders and squares off MIS on
> the deployed app. Two obligations it carried are closed rather than inherited — the circuit-breaker
> state fix and the token-bucket limiter, both of which existed only to serve an outbound provider.
> See `constraints/market-data.md` → Quote providers.

**Logic:**

- `supabase/functions/_shared/market-hours.ts` — the pure core of the session logic, **moved there
  rather than copied**. An Edge Function runs on Deno and cannot import from `src/`
  (`code-standards.md` → Import Conventions), but the dependency runs perfectly well the other way:
  `_shared/` holds the single implementation, Deno reaches it on a relative path and the app reaches
  it through a new `@shared/*` alias. `src/lib/market/market-hours.ts` keeps only the
  database-backed wrappers, because the two runtimes build their Supabase clients differently.
  **This replaces the planned duplicate-plus-drift-test.** A drift test is the right answer when
  duplication is forced — the F05 stack table — and the wrong answer when it is not: the failure it
  guards against, the tick trading on a day the app calls closed, is made unreachable by there
  being one copy, and the existing tier-1 suite already runs that copy.
- `supabase/functions/market-tick/index.ts` implementing **gate → select demanded symbols → fetch →
  upsert `quotes`**. The gate comes first and nothing writes before it returns true.
- **The demand union includes `watchlist_items`.** `symbol_demand` has no write path until F18 and
  nobody holds anything yet, so the union as originally specified would select zero symbols and the
  write path would ship untested. A symbol someone is watching is genuinely demanded, F13 seeds ten
  per account, and this stays correct after F18 narrows refreshes to what is actually on screen.
- `select_demanded_symbols(p_limit)` as a **SQL function rather than a query in TypeScript**, so
  pgTAP can test the union and its ordering directly. Ordered by `priority desc,
  last_requested_at desc` and capped by `MAX_SYMBOLS_PER_TICK`, so batch size is bounded by the
  limiter and never by the size of the universe.
- `roll_previous_close()` runs first inside the gate, before any price is read. `quotes.prev_close`
  is what a day change divides by and what the simulator's band is measured from; seeded from
  bhavcopy and never advanced, it pinned both to the day the universe was seeded. The roll is
  derived from each row's `fetched_at` rather than fired by a scheduled event, so a missed tick
  repairs itself and it cannot double-apply within a session. Added at the Phase 2 checkpoint to
  unblock F18.
- **`match_open_orders` and `square_off_mis` are not called yet** — they are built in F28 and F29,
  which wire them in. `code-standards.md`'s Edge Function example shows both, so it gains a note
  rather than being left to mislead.
- **The candle prune moves to F33.** Candles left F15, so retention logic here would run against a
  table nothing populates: the assertion would read "deleted zero rows from an empty table" and pass
  whether or not the rules were right. F33 builds the candle pipeline and its retention together.
- `touch_symbol_demand` remains F18's, with its own grant and test.
- **JWT verification stays enabled *and* the handler checks a shared secret.** Not a fallback —
  both, always. The plan treated the `X-Scheduler-Secret` layer as contingency for a gateway that
  accepted no available credential; measurement found the opposite problem. `verify_jwt` rejects a
  caller with no `Authorization` header, but it accepts **any** valid project key, including the
  publishable one that ships in the browser bundle. So the handler compares an `x-scheduler-secret`
  header against a Vault-held value, in constant time, before reading or writing anything, and
  **refuses rather than falls open** when that secret is unset. `pg_cron` sends both headers, and
  neither literal appears in a migration. See `constraints.md` → Security and RLS.
- `pg_cron` job on `* 3-10 * * 1-5` — every minute of UTC hours 03–10 inclusive, ≈08:30–16:29 IST,
  deliberately wider than the session because no cron expression can encode NSE's trading holidays.
  The window is a cost bound; `isTradingSession()` is the business-time authority.

**Verify:**

- **The gate outranks the schedule** — invoked at 08:45 IST, inside the cron window but outside the
  session, the function writes zero rows and returns `{ ok: true, skipped: 'MARKET_CLOSED' }`.
- Invoked on a seeded 2026 trading holiday it writes nothing, proving the gate does not rely on the
  cron schedule.
- **The session logic the tick gates on is the logic tier 1 covers** — `pnpm test` exercises
  `_shared/market-hours.ts` itself, through the app's re-export, across open, closed, pre-open,
  weekend, a listed holiday and the next transition. There is no second copy to compare it against.
- Demand is real, capped and correctly ordered — pgTAP: a seeded watchlist yields those symbols; a
  symbol in a holding outranks a watchlist-only one; the result never exceeds the cap.
- **The tick actually writes** — invoked during a session, `quotes.fetched_at` advances for the
  demanded symbols, every row carries a non-null `provider` and `fetched_at`, and a null
  `provider_ts` **only** when the provider is `SIMULATOR`.
- Forcing every upstream provider to fail still writes simulator rows rather than none.
- **It is not a public endpoint** — invoking the URL with no `Authorization` header is rejected by
  the platform gateway before any handler code runs, confirmed by the absence of a log line rather
  than by the status code alone.
- `cron.job_run_details` shows successful runs one minute apart with no 401s, and **which credential
  actually satisfied the gateway is recorded** in `library-docs.md`, closing the TODO there. A 401
  means the credential is wrong, not that the function is broken.
- A run with 200 demanded symbols finishes inside 10 seconds, because the cap bounds the batch.
- **An unavailable calendar stops the tick rather than opening the market** — `loadHolidays` throws
  on a read error, and the handler returns `{ ok: false }` having written nothing. An empty holiday
  set is indistinguishable from a year with no holidays, which is why it must not be silently
  tolerated.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` and `pnpm build` all exit zero.

### Phase checkpoint

The complete schema exists, the three test tiers run green, auth works end to end, and prices land in the database on a schedule. Confirm a fresh account bootstraps correctly, tier 2 proves RLS blocks cross-user reads on every table, tier 3 proves the lock guards hold, and the cron job has run unattended for at least an hour.

**Carried over from the Phase 1 checkpoint — both closed in `2.00.01`:** the tier-3 cleanup
assertion is no longer vacuous (it commits a prefixed row and asserts it is really there before
dropping, falsified by removing the `drop table`), and both test runners now share one
`.env.test.local` parser in `scripts/env-file.mts`, so the CRLF bug cannot be fixed in one runner
and left in the other. Verified by running tiers 2 and 3 green against a CRLF copy of the real file.

---


