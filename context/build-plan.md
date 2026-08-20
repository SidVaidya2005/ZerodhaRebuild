# Build Plan

> **Role:** The ordered plan — phases and numbered features to build, in sequence.
> **Read before starting a feature**; build one feature fully before the next.
> **Relates to:** features come from `project-overview.md`; status tracked in `progress-tracker.md`.

## Core Principle

**UI first with mock data, then wire the real logic, and never leave a step unverifiable.**
Every feature ships something you can open in a browser or assert in a test before the next one
starts. Money-moving logic is built bottom-up in the opposite direction — the Postgres function and
its tests come before the UI that calls it — because a wrong balance is invisible in a screenshot.

---


## Phase 1 — Foundation & Public Site

### 01 Project scaffold and tooling



Create the Next.js application and every piece of tooling the rest of the build assumes.
**No Supabase login, link, or migration happens here** — provisioning moves to Phase 2, where
feature 10 already calls for it. This feature is done when every command in `CLAUDE.md` → Commands
that does not need a database exits zero.

**Logic:**

- `pnpm create next-app` with TypeScript, App Router, `src/` directory, and the `@/*` path alias — scaffolded into a temp directory and copied in, because `create-next-app` refuses a folder containing `context/`, `CLAUDE.md` or `AGENTS.md`, and its template would overwrite `README.md`. Git init disabled; the repo already exists.
- Every dependency **pinned exactly**, no caret ranges, matching the version table in `architecture.md`.
- Tailwind CSS v4 via `@tailwindcss/postcss`; `globals.css` with `@import "tailwindcss"`; no `tailwind.config.js` anywhere.
- ESLint 10 flat config (`eslint.config.mjs`), Prettier with `prettier-plugin-tailwindcss` pointed at `globals.css` via the v4 stylesheet option, and the strict `tsconfig.json` flags from `code-standards.md` — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- Vitest configured for `src/**/*.test.ts`: node environment, no jsdom and no Testing Library (neither is an approved dependency, and tier 1 covers pure logic only), with the `@/` alias resolved explicitly.
- Scripts limited to the ones this feature can make real — `dev`, `build`, `start`, `lint`, `typecheck`, `test`. The database and race scripts land in feature 09 alongside the harness they invoke, rather than shipping as broken stubs.
- Folder skeleton exactly as `architecture.md` describes, with `.gitkeep` where empty, including `supabase/` even though nothing connects to it yet.
- `.env.example` listing every variable in `code-standards.md` → Environment Variables, with dummy values; `.env*.local` in `.gitignore`.
- **Environment validation is split in two.** `src/lib/env.ts` validates the three `NEXT_PUBLIC_*` variables and is safe to import anywhere; `src/lib/env.server.ts` carries `import 'server-only'` and validates `SUPABASE_SERVICE_ROLE_KEY` plus the optional `TWELVE_DATA_API_KEY` and `TEST_DATABASE_URL`. A client-side import of the secrets becomes a build error rather than a runtime throw — the same guard `architecture.md` already mandates for `admin.ts`. `code-standards.md` → Environment Variables is updated in the same commit, since it names a single `env.ts`.
- `src/instrumentation.ts` exporting `register()`, calling both validators inside a `NEXT_RUNTIME === 'nodejs'` guard. Next.js runs this once per server instance before it serves a request, and deliberately skips it during `next build` — so a bad env breaks `dev` and `start` by name while `build` stays green without secrets present.
- The `supabase` CLI as a dev dependency so `pnpm supabase` resolves, but never logged in or linked.

**Verify:**

- `pnpm dev` serves the default page at `localhost:3000` — `curl -sI localhost:3000` returns 200 and the dev server output carries no warnings.
- `pnpm build` exits zero.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` all exit zero, and `test` runs at least one real assertion rather than passing on `passWithNoTests`.
- Deleting a required variable from `.env.local` makes startup fail with a named error, not a runtime `undefined`: remove `NEXT_PUBLIC_SUPABASE_URL`, run `pnpm dev`, and read that the error names that variable.
- **The service-role secret cannot reach the browser:** temporarily import `env.server.ts` from a `'use client'` file and confirm `pnpm build` *fails* with the `server-only` error, then revert. A guard never observed failing is not a guard.
- `ls tailwind.config.*` returns nothing — configuration is CSS, per `library-docs.md` → Tailwind CSS v4.
- `grep -E '"\^' package.json` returns nothing; every version is exactly pinned.
- `find src supabase tests -type d | sort` matches the tree in `architecture.md` → Folder Structure.
- `git status --porcelain` shows no modification to `CLAUDE.md`, `AGENTS.md`, `LICENSE`, `README.md` or `context/`.
- Creating `.env.local` and `.env.test.local` leaves `git status --porcelain` listing neither.

### 02 Design system and theme tokens



Establish the visual language before any page is built, so nothing needs restyling later.

**UI:**

- The full `@theme` token set from `library-docs.md` → Tailwind: brand, trading semantics, surfaces, text, chart ramp, type scale, radius.
- Dark values on `:root` with `.light` overriding them, plus `@custom-variant light`. There is no `dark:` variant in this project.
- `next-themes` provider in the root layout, `attribute="class"`, `defaultTheme="dark"`, no flash on load.
- Fonts wired through `next/font`: Inter as `--font-inter`, IBM Plex Sans as `--font-plex`, with `tabular-nums` on the numeric class.
- shadcn/ui initialised and the base primitives added, restyled to the system's density — 14px body, 6px radius, 1px hairlines, 40px controls.
- A `/dev/styleguide` page rendering every token, button variant, and table density in both themes.

**Logic:**

- `src/lib/utils.ts` with `cn()` and the `formatCurrency` / `formatPercent` / `formatQuantity` helpers using `en-IN` locale and the ₹ symbol.

**Verify:**

- `/dev/styleguide` renders every token swatch in both themes; toggling theme changes all of them with no hardcoded colour left behind.
- Brand yellow and the up/down greens and reds are byte-identical in both themes; only canvas, surface and text tones flip.
- Numbers render in `--font-plex` with `tabular-nums` and align in a column; body copy renders in `--font-inter`.
- `formatCurrency(1234567.5)` returns `₹12,34,567.50` — Indian digit grouping, asserted in a test.
- Grepping `src/` for `#` hex literals inside `className` returns nothing.

### 03 Public layout shell



The chrome every marketing page sits inside.

**UI:**

- Header with logo, nav (Home, About, Pricing, Support), and a "Sign in with Google" button.
- Mobile hamburger nav.
- Footer with sections, project links, and the "not affiliated with Zerodha" disclaimer.
- A persistent banner stating this is a simulator with no real money.

**Logic:**

- `(marketing)` route group layout. No `cookies()` call anywhere inside it, so pages stay statically renderable.

**Verify:**

- All four nav links resolve; none 404.
- The marketing layout renders with no session and no Supabase request in the network tab.
- Header and footer are usable at 375px width.

### 04 Home page



**UI:**

- Hero with headline, subheadline, and primary sign-in CTA.
- "What you can do" feature grid: live NSE prices, real order types, simulated funds, portfolio analytics.
- A section explaining the CNC/MIS distinction in plain language.
- Explicit data-honesty section describing the LIVE / DELAYED / SIMULATED badge.
- Closing CTA.

**Verify:**

- Page renders with static content and no client-side data fetching.
- Every CTA routes to `/auth/login`.
- Lighthouse accessibility score above 90 on the rendered page.

### 05 About page



**UI:**

- What the project is and why it exists.
- How it was built: architecture summary, stack table, links to the repository.
- An honest "what is simulated and what is real" section.

**Verify:**

- Stack table content matches `architecture.md`; no stale version numbers.
- All external links open and are marked `rel="noreferrer"`.

### 06 Pricing page



The charge structure the order engine will actually apply — written before the engine so the engine matches the page.

**UI:**

- Plan card: ₹0 account opening, ₹0 delivery brokerage, ₹20 or 0.03% intraday.
- Full charges table: brokerage, STT, exchange transaction charges, GST, SEBI turnover fee, stamp duty, DP charges.
- A worked example: a ₹50,000 delivery buy and its exact total cost.

**Logic:**

- Charge rates defined once in `src/lib/constants.ts` and imported by this page, so the page and the engine can never disagree.

**Verify:**

- The worked example on the page is computed from `constants.ts`, not typed in — changing a rate changes the page.
- Every rate on the page carries a source comment in `constants.ts`.
- TODO: confirm current rates against Zerodha's published charge list before this page goes live.

### 07 Support page and contact form



**UI:**

- Category cards (Account, Orders, Funds, Technical) with expandable FAQ entries.
- Contact form: name, email, category, message.
- Success and error states, with the form disabled while submitting.

**Logic:**

- `support_messages` table with a migration allowing anonymous `INSERT` and no `SELECT`.
- `submitSupportMessage` Server Action with Zod validation.

**Verify:**

- A valid submission inserts one row; the UI shows the success state.
- An invalid email shows a field error and inserts nothing.
- Signed out, a `select` against `support_messages` returns zero rows — insert-only RLS confirmed.

### 08 Legal, error, and not-found pages



**UI:**

- `/legal` with the full disclaimer: unaffiliated, no real trading, no financial advice, data provenance.
- A "simulation simplifications" section naming the places this diverges from a real broker: intraday short losses are capped at collateral rather than triggering a margin call, prices are delayed rather than real-time, and there is no counterparty order book.
- Branded `not-found.tsx`.
- Root `error.tsx` with a retry action.

**Verify:**

- A nonexistent path renders the branded 404, not the Next.js default.
- Throwing inside a page renders the error boundary rather than a white screen.

### Phase checkpoint

Public site complete and deployable. Run lint, typecheck and tests; walk every public route in both themes at desktop and mobile widths.

---


## Phase 2 — Data Foundation & Auth

### 09 Test harness

Stand up all three test tiers before the schema they will police exists, so no later feature can be written without a way to prove it. Tiers and rules are defined in `code-standards.md` → Testing.

**Logic:**

- A **second** hosted Supabase project created as the test target; `TEST_DATABASE_URL` in `.env.test.local` (gitignored) and named in `.env.example`. The free plan allows two active projects — this is the second.
- `pnpm db:push:test` applying the full migration history with `supabase db push --db-url "$TEST_DATABASE_URL" --include-all`.
- Scripts: `pnpm test` (tier 1, Vitest), `pnpm test:db` (tier 2, `supabase test db --db-url`), `pnpm test:race` (tier 3, Vitest driving `pg`), and `pnpm test:all` chaining all three.
- `supabase/tests/00-helpers.sql` enabling the pgTAP extension and holding shared fixtures.
- `tests/concurrency/helpers.ts` with two-client setup, a seeded-user factory using a recognisable prefix, and `afterEach` cleanup that runs on failure too.
- `pg` and `@types/pg` added to the approved dependency list.

**Verify:**

- **Run this first, as a spike.** `pnpm test:db` executes a trivial `select plan(1); select ok(true); select * from finish();` against the test project and reports TAP success. A probe here showed `supabase test db --db-url` connects to the database before anything else and fails on connection, with no Docker error — but whether `pg_prove` itself needs a container after a *successful* connect is unproven, and this machine has no Docker.
- If that spike fails on a container requirement, fall back without redesigning anything: the tier 2 files are plain SQL with pgTAP assertions, so run them through the same `pg` client tier 3 already uses and read the TAP output from the result set. Record which path was taken in the build journal.
- `pnpm test:race` opens two connections and proves they are distinct backends — `select pg_backend_pid()` returns different values — then closes both.
- `pnpm db:push:test` applies cleanly to the empty test project, and re-running it is a no-op.
- `TEST_DATABASE_URL` pointed at a paused or wrong project fails with a clear connection error, never a silent skip or an empty pass.
- `.env.test.local` is gitignored: creating it leaves `git status` clean.

### 10 Database schema: identity and market data



**Logic:**

- Supabase project created and linked via the CLI.
- Migration creating the enums, plus `profiles`, `instruments`, `quotes`, `candles`, `candle_sync`, `symbol_demand`, `watchlist_items`, `market_holidays`.
- `quotes` carries `provider` and `provider_ts` and **no `source` column** — freshness is derived at read time, per `architecture.md` → Quote Provenance.
- RLS enabled on `profiles` with `auth.uid() = id` policies (its primary key *is* the user id) and on `watchlist_items` with `auth.uid() = user_id`; `instruments`, `quotes` and `market_holidays` readable by all authenticated users and writable by none.
- `quotes` added to the `supabase_realtime` publication.
- `src/types/database.ts` generated.

**Verify:**

- `pnpm supabase db push` applies cleanly to a fresh project.
- Generated types compile with no `any`.
- As an authenticated user, an `update` on `quotes`, `candles` or `candle_sync` is refused by RLS.
- The `quotes` table has no `source` column; attempting to select one fails.

### 11 Database schema: funds, orders, and portfolio



**Logic:**

- Migration creating `funds`, `fund_ledger`, `orders`, `trades`, `holdings`, `positions` exactly as `trading-contract.md` specifies.
- `orders.blocked_margin` and `positions.blocked_margin`, both `numeric(14,2) not null default 0`, plus `positions.entry_reference_price numeric(14,2)` — the gross collateral basis, null for longs.
- `trades.is_auto_squareoff boolean not null default false` and `trades.charge_breakdown jsonb not null`.
- `ledger_type` enum with all eight values from the contract, including `SIMULATION_ADJUSTMENT`; no `RESET` value.
- `CHECK (available_cash >= 0)`, `CHECK (orders.quantity > 0)`, `CHECK (holdings.quantity > 0)` — holdings rows are deleted at zero, never retained.
- RLS on every one of them: all commands restricted to `auth.uid() = user_id`.
- Indexes on `(user_id, placed_at desc)` for orders, `(user_id, created_at desc)` for the ledger, and `status` where `OPEN` for the matcher.
- `orders` added to the `supabase_realtime` publication.
- Types regenerated.

**Verify:**

- Signed in as user A, selecting user B's rows returns zero across all six tables.
- Attempting `update funds set available_cash = 999999` from the client is refused.
- A direct `insert` into `holdings` from the client is refused.
- `explain` on the open-order query uses the index rather than a sequential scan.

### 12 Google sign-in and route protection



**UI:**

- `/auth/login` with a single Google button, loading state, and error display.
- Signed-in avatar and sign-out control in the header.

**Logic:**

- Google OAuth configured in Supabase; redirect URLs registered for local and Render origins.
- The three Supabase clients from `architecture.md` → Key Patterns.
- `/auth/callback` route handler exchanging the code for a session.
- `src/proxy.ts` refreshing the session and guarding terminal prefixes.

**Verify:**

- Signing in redirects to `/dashboard` with a session cookie set.
- Visiting `/holdings` signed out redirects to `/auth/login`.
- Visiting `/pricing` signed out renders normally and is not intercepted.
- Sign-out clears the session; the terminal is no longer reachable.

### 13 Account bootstrap on first sign-in



**Logic:**

- `handle_new_user` trigger on `auth.users` creating the `profiles` row, generating a `ZR######` client ID, and copying name and avatar from the Google identity.
- Client ID generation retries up to 10 times on a unique violation and raises `CLIENT_ID_EXHAUSTED` if all 10 collide — bounded, never an infinite loop, and never a silently failed signup.
- The same trigger inserting the `funds` row at `OPENING_BALANCE`, the `SIGNUP_CREDIT` ledger entry, and a default watchlist.
- Trigger is idempotent — a repeat sign-in creates nothing new.

**Verify:**

- A brand-new Google account lands on `/dashboard` with ₹1,00,000 available and a populated watchlist.
- Signing out and back in leaves exactly one `profiles` row and one `SIGNUP_CREDIT` entry.
- Two users signing up concurrently receive different client IDs.
- With generation stubbed to always return the same value, signup fails with `CLIENT_ID_EXHAUSTED` after exactly 10 attempts rather than hanging or creating a broken profile.

### 14 Instrument and holiday calendar seed



**Logic:**

- `supabase/seed/nifty200.json` with symbol, name, sector, and `yahoo_symbol` for each constituent.
- An idempotent seed script upserting into `instruments`.
- The current NSE trading-holiday calendar seeded into `market_holidays`, with a note recording that it must be re-seeded each January.

**Verify:**

- The seed run twice leaves roughly 200 rows, not 400.
- Every row has a non-empty `yahoo_symbol`.
- `market_holidays` contains this year's published NSE closures, and `isTradingSession()` reports closed on each of them.
- A spot check of 5 random `yahoo_symbol` values returns HTTP 200 from the Yahoo chart endpoint.

### 15 Quote provider chain



The reliability core, built and tested before anything renders a price.

**Logic:**

- `QuoteProvider` interface: `name`, `isAvailable()`, `fetchQuotes(symbols)`, circuit-breaker state.
- `YahooProvider` — one request per symbol, staggered, browser `User-Agent`, Zod-parsed, trips its circuit for 5 minutes on a 429.
- `TwelveDataProvider` — reports unavailable when the key is unset.
- `SimulatorProvider` — bounded random walk seeded from the last known quote; always succeeds.
- `QuoteService` walking the chain and a token-bucket limiter capping symbols per tick.
- `CandleProvider` chain over the same limiter and circuit breaker, plus `deriveSource()` and the provenance helpers in `src/lib/market/provenance.ts`.
- `market-hours.ts` exposing `isTradingSession(clock)`, computing NSE session state in `Asia/Kolkata` against a `market_holidays` table — not against the cron window.

**Verify:**

- Unit tests: a 429 from Yahoo trips the circuit and the next call falls through to the simulator.
- Unit test: a malformed Yahoo payload fails its Zod parse and falls through rather than throwing.
- Unit test: with no key set, the Twelve Data provider is skipped silently.
- Unit tests for `deriveSource`: `SIMULATOR` → `SIMULATED`; a polled provider within the live window → `DELAYED`, never `LIVE`; beyond the delayed window → `STALE`; null `provider_ts` → `STALE`.
- Unit test: a candle response with null entries drops those indices rather than forward-filling.
- Unit tests for `market-hours` cover pre-open, open, post-close, weekend, a listed trading holiday, and the 15:20 square-off boundary, with an injected clock.
- Test: 09:14:59 and 15:30:01 IST both report closed; 09:15:00 reports open.
- An integration run against the live Yahoo endpoint returns a plausible price for `RELIANCE`.

### 16 Market tick Edge Function and schedule



**Logic:**

- `supabase/functions/market-tick/` implementing gate → select-demanded-symbols → fetch → upsert `quotes`.
- `isTradingSession()` checked first; when closed the function writes nothing and returns `{ ok: true, skipped: 'MARKET_CLOSED' }`.
- Symbol selection: recent `symbol_demand` entries, union everything referenced by a holding, position, or open order.
- `pg_cron` job posting to the function every minute over the coarse UTC window `* 3-10 * * 1-5` (≈08:30–16:29 IST), credentials read from Vault. The window is a cost bound only — `isTradingSession()` is the business-time authority.
- `touch_symbol_demand` function the client calls when subscribing.
- A once-daily prune inside the same run: `FIVE_MIN` candles older than the current trading day, `THIRTY_MIN` beyond five trading days, `ONE_DAY` beyond 400 days.

**Verify:**

- Manually invoking the function updates `quotes.fetched_at` for the demanded symbols.
- `cron.job_run_details` shows successful runs one minute apart, with no 401s — proving the Vault-held scheduler credential satisfies the gateway.
- **Record which credential worked**, resolving the TODO in `library-docs.md` → Supabase Cron.
- Invoking the function URL with no `Authorization` header is rejected by the gateway before any handler code runs.
- Every written row has a non-null `provider` and `fetched_at`, and a non-null `provider_ts` unless the provider is `SIMULATOR`; forcing all providers to fail still writes simulator rows rather than none.
- A run with 200 demanded symbols still finishes inside 10 seconds because the limiter caps the batch.
- Invoked at 08:45 IST (inside the cron window, outside the session) the function writes no rows and reports `MARKET_CLOSED`.
- Invoked on a seeded trading holiday it writes no rows, proving the gate does not rely on the cron schedule.

### Phase checkpoint

The complete schema exists, the three test tiers run green, auth works end to end, and prices land in the database on a schedule. Confirm a fresh account bootstraps correctly, tier 2 proves RLS blocks cross-user reads on every table, tier 3 proves the lock guards hold, and the cron job has run unattended for at least an hour.

---


## Phase 3 — Terminal Shell & Live Prices

### 17 Terminal shell layout



**UI:**

- Top nav: logo, market index strip (NIFTY 50, SENSEX, BANK NIFTY), nav links, funds summary, avatar menu.
- Left watchlist sidebar container, collapsible on mobile.
- Content region at the system's dense type scale (`--text-body`, `--text-number` in tables).
- Market status pill: PRE-OPEN / OPEN / CLOSED with the next transition time.

**Logic:**

- `(terminal)` route-group layout loading the session, profile, and funds server-side.
- Placeholder routes for every terminal page so navigation never 404s.

**Verify:**

- Every terminal nav link renders its page shell.
- The layout redirects to login without a session.
- The market status pill matches `market-hours.ts` at three probed times.

### 18 Watchlist sidebar



**UI:**

- Search input opening a `Command` palette over the instrument universe.
- Rows: symbol, exchange tag, LTP, absolute and percentage change, coloured by direction.
- Hover reveals B / S / chart / remove actions.
- Drag to reorder; empty state when the watchlist is cleared.

**Logic:**

- `addToWatchlist`, `removeFromWatchlist`, `reorderWatchlist` Server Actions.
- Search queries `instruments` with a trigram or prefix index, capped at 20 results.
- Subscribing marks each visible symbol in `symbol_demand`.

**Verify:**

- Adding a symbol persists across reload; removing it persists too.
- Reordering survives a reload in the new order.
- Typing "rel" surfaces RELIANCE within 300ms.
- Symbols on screen appear in `symbol_demand` with a fresh `last_requested_at`.

### 19 Realtime quote store and tick interpolation



The feature that makes the terminal feel alive.

**UI:**

- LTP cells flash green on an up-tick and red on a down-tick, then fade.
- Values move smoothly between server refreshes rather than jumping once a minute.

**Logic:**

- Zustand quote store per `library-docs.md`.
- A single Supabase Realtime subscription on `quotes` mounted once in the terminal layout.
- One `requestAnimationFrame` driver interpolating micro-ticks toward the last server price, bounded so it never drifts beyond a small band.
- Channel cleanup on unmount.

**Verify:**

- Updating a `quotes` row in SQL visibly moves the browser value within two seconds, with no reload.
- React DevTools shows only the affected row re-rendering on a tick, not the whole sidebar.
- Navigating between terminal pages ten times leaves exactly one open Realtime channel.
- Interpolated values never diverge from the last server price by more than the configured band.

### 20 Data source badge and market status



**UI:**

- A shell badge reading DELAYED, STALE or SIMULATED, summarising the worst provenance among symbols on screen, with a tooltip explaining what it means and why.
- Per-price provenance on hover anywhere a price appears: provider, provider timestamp, fetch time, and whether the figure on screen is interpolated.
- Stale prices visually muted once `deriveSource` returns `STALE`.

**Logic:**

- Badge derives from the worst source among symbols currently on screen — one simulated symbol downgrades the whole badge — but never replaces per-price provenance.
- `deriveSource()` recomputed on render, never read from a stored column.

**Verify:**

- Forcing the simulator switches the badge to SIMULATED and the tooltip explains why.
- No price anywhere in the UI renders without accessible provenance.
- With Yahoo as provider the badge reads DELAYED, not LIVE — asserted in a test, because a LIVE badge over a polled endpoint is the failure this feature exists to prevent.
- Leaving a tab open past the delayed window flips the badge to STALE with no new server data, proving freshness is derived rather than frozen.
- An interpolated watchlist figure reports `isInterpolated: true` on hover and shows the true anchor beside it.

### 21 Dashboard home



**UI:**

- Summary cards: total portfolio value, invested amount, overall P&L, day's P&L, available cash.
- Top-10 holdings donut with an "Others" bucket.
- Index strip and a recent-orders list.
- A distinct empty state for a user who has never traded, pointing at the watchlist.

**Logic:**

- Server-side aggregation joining `holdings` against `quotes`; the client only renders.

**Verify:**

- With seeded holdings, the card totals match a hand-computed figure.
- The donut shows the correct ten symbols ranked by market value.
- A fresh account sees the empty state, not zeroes and a blank chart.

### Phase checkpoint

The terminal looks and feels like a real trading front end with live prices. Confirm ticking works unattended for a full market session and no Realtime channels leak.

---


## Phase 4 — Trading Engine

### 22 Charge calculator



**Logic:**

- `calculate_charges(side, product, quantity, price)` in Postgres returning the total.
- A matching `src/lib/trading/charges.ts` for **display estimates only**, plus a `charge_breakdown` shape shared by both.
- Every rate sourced from `constants.ts` with a comment citing where it came from.

**Verify:**

- Unit tests reproduce a published Zerodha brokerage-calculator example for a delivery buy, a delivery sell, an intraday buy, and an intraday sell, each within one paisa.
- A test asserts the TypeScript estimate and the Postgres result agree for 100 random inputs.
- Delivery brokerage is exactly zero; intraday brokerage is capped at ₹20.

### 23 Margin reservation and release


Reservation and release, built and proven before any order can consume them.

**Logic:**

- `reserve_margin(order_id)` per `trading-contract.md` §6: computes the requirement (full notional plus estimated charges — no leverage), moves it from `available_cash` into `used_margin`, stamps `orders.blocked_margin`, and writes the `MARGIN_BLOCK` ledger row. Returns false if the user cannot cover it.
- `release_margin(order_id)` reversing it exactly once and writing `MARGIN_RELEASE`; idempotent, returning immediately when `blocked_margin` is already zero.
- `transfer_margin_to_position(order_id)` per `trading-contract.md` §6, including the six-step top-up path: collateral is `|net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges`, the delta against the existing reservation is blocked or released as needed, and the collateral move writes **no ledger row** because no cash changes.
- Collateral is recomputed from that formula on every change to a short position, so partial covers release their share.
- All three functions revoked from `public`, `anon` and `authenticated`.
- Both revoked from `public`, `anon` and `authenticated` — internal-only, per the grant policy in `code-standards.md`.

**Verify:**

- Test: reserving on a CNC buy lowers `available_cash` and raises `used_margin` by the identical amount; the ledger row's `balance_after` matches.
- Test: releasing restores both exactly; releasing a second time changes nothing.
- Test: a reservation larger than `available_cash` returns false and writes nothing.
- Test, **three assertions on one short round trip**, because each catches a different error:
  1. Pre-placement → completed: `available_cash` falls by exactly `required_collateral + actual_charges`. The collateral sits in `used_margin`, not in free cash.
  2. Post-reservation → post-transfer: `available_cash` moves by exactly `−delta`, the reservation adjustment and nothing else.
  3. `available_cash + used_margin` falls by exactly `actual_charges` — the collateral moved rather than vanished, and charges are the only non-recoverable part. This is the assertion that catches a double-spend.
- Test: `orders.blocked_margin` is zero after transfer and the ledger contains no row for the collateral amount.
- Test: reserved estimated charges are not also debited — total cash out for a short entry equals the actual charges exactly, never charges twice.
- **Gap-up test:** a short limit sell at ₹100 that fills at an observed ₹110 requires more collateral than it reserved. With sufficient cash it tops up via `MARGIN_BLOCK` and completes; with insufficient cash it is `REJECTED` with `INSUFFICIENT_FUNDS` and the whole reservation is released. Assert both branches — the top-up is the only case where a better fill price demands more margin.
- Test: `positions.blocked_margin` equals `|net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges` after entry, after adding to the position, and after a partial cover.
- Test: collateral computed from `entry_reference_price` covers a full 20% adverse move **including closing charges**. Recompute it from `average_price` instead and confirm the assertion fails — that substitution under-collateralises by a small, easily-missed amount.
- Test: covering half a short releases exactly half the collateral, not zero and not all of it.
- Test: the margin identity in `trading-contract.md` §12.3 holds after a randomised sequence of 500 reserve/release/fill/cancel operations.

### 24 Order execution function



The heart of the project. Built and tested entirely in SQL before any UI touches it.

**Logic:**

- `place_order(...)` inserting the order, reserving margin, then calling `execute_order` for market orders.
- `execute_order(order_id)` per the golden pattern: lock the order row, **return unless it is still `OPEN`**, lock the funds row, price it, compute charges, check margin against `available_cash + blocked_margin`, release the reservation, insert the trade, upsert the holding or position, update funds, append the ledger, complete the order.
- Business rejections set `status = REJECTED` with a stable `rejection_reason`.
- On completion the function retires the reservation the right way: `release_margin` for buys, long closes, cancellations and rejections; `transfer_margin_to_position` for a fill that opens a short.
- `average_price` computed with the direction-correct formula from `trading-contract.md` §8 — charges added for a long, subtracted for a short.
- `cancel_order(order_id)` for open orders only.
- `reset_account()` wiping orders, trades, holdings and positions and restoring the opening balance in one transaction.

**Verify:**

- Test: a CNC buy of 10 at a known price debits exactly (10 × price + charges) and creates the holding with that average price.
- Test: a second buy at a different price recomputes the weighted average correctly.
- Test: **short entry charges lower `average_price`, they do not raise it.** Short 100 @ ₹100 with ₹30 charges gives `₹99.70`; covering flat at ₹100 reports a loss of ₹30 plus closing charges, never a ₹30 profit. Run this against a build using the long formula and confirm it fails.
- Test: a short with entry charges plus a partial cover reports realised P&L matching a hand calculation to the paisa.
- Test: a buy exceeding available cash is `REJECTED` with `INSUFFICIENT_FUNDS` and leaves `funds` byte-identical.
- Test: a CNC sell without a holding is `REJECTED` with `NO_HOLDING`.
- Test: two concurrent buys that each individually fit but together exceed the balance produce exactly one fill and one rejection — the row lock holds.
- Test, **two concurrent sessions**: both call `execute_order` on the same open order at the same time. Exactly one trade, one ledger entry, and one debit result. Run this against a build with the status guard removed and confirm it fails — a test that cannot fail is not a test.
- Test: an open limit buy reserves margin at placement; `used_margin` rises and `available_cash` falls by the same amount.
- Test: cancelling that order restores both figures exactly; releasing twice is a no-op.
- Test: an MIS short reserves margin, and a user with zero available cash cannot open one.
- Test: `available_cash` never goes negative across a randomised sequence of 500 orders, and opening balance minus net debits plus net credits equals the final balance.
- Test: `reset_account` returns every table to the post-signup state.

### 25 Order ticket UI



**UI:**

- Modal dialog with the system's trading buttons: `--color-up` for buy, `--color-down` for sell, `--radius-sm`, tight padding. The final confirm action is the brand CTA (`bg-brand text-on-brand`).
- Quantity, product toggle (CNC/MIS), order type toggle (MARKET/LIMIT), limit price shown only for limit orders.
- Live margin required, available cash, and the estimated charge breakdown, all updating as inputs change.
- Inline validation errors and a disabled submit while in flight.

**Logic:**

- `react-hook-form` with `zodResolver(placeOrderSchema)`.
- Charge estimate from `src/lib/trading/charges.ts`, labelled as an estimate.

**Verify:**

- Selecting LIMIT reveals the price field; submitting without it shows a field error.
- Quantity zero or negative is rejected client-side.
- The displayed margin required matches the engine's computed cost within one paisa for ten sample orders.
- Double-clicking submit places exactly one order.

### 26 Place order end to end



**Logic:**

- `placeOrder` Server Action per the golden pattern, calling `place_order` and revalidating the affected routes.
- Rejection codes mapped to human copy; success and failure both raise a toast.

**Verify:**

- A market buy from the watchlist completes and appears in Holdings without a manual reload.
- An unaffordable order shows "Insufficient funds" and no order is left in a bad state.
- The action never throws; forcing a database error returns the standard error shape.

### 27 Orders page



**UI:**

- Tabs: Open, Executed, Cancelled, Rejected, with counts.
- Columns: time, symbol, side, product, type, quantity, price, average price, status.
- Cancel and modify actions on open orders; rejection reason shown inline.
- Empty state per tab.

**Logic:**

- `cancelOrder` and `modifyOrder` Server Actions; modify is limited to quantity and limit price on open orders.
- Realtime subscription on `orders` so a background fill moves the row between tabs live.

**Verify:**

- A limit order appears under Open immediately after placement.
- Cancelling moves it to Cancelled and releases the blocked margin, restoring `available_cash` to the paisa.
- Cancelling an order at the same moment the matcher fills it yields exactly one outcome, not a cancelled-and-filled order.
- Modifying an executed order is refused.
- A fill triggered by the cron job moves the row from Open to Executed with no reload.

### 28 Limit order matching



**Logic:**

- `match_open_orders()` selecting open limit orders whose symbol's refreshed quote has crossed the limit — buys at or below, sells at or above — and calling `execute_order` for each.
- Called by the market tick function after the quote upsert, inside the same run.
- Idempotent under both sequential retry and simultaneous invocation; safety comes from the status guard in `execute_order`, not from the scheduler.

**Verify:**

- Test: a buy limit above the current price fills on the next tick; one below stays open.
- Test: a sell limit below the current price fills; above stays open.
- Test, **two concurrent sessions**: `match_open_orders()` invoked simultaneously produces exactly one fill for a crossing order. A sequential double-run does not exercise this — the second pass no longer selects the order, so it passes with the bug present.
- Test: a limit order for a user whose cash has since been spent is rejected, not filled into a negative balance.
- Observed live: a limit order placed just off the market fills within two minutes during market hours.

### 29 MIS auto square-off



**Logic:**

- `square_off_mis()` finding every open MIS position after `SQUARE_OFF_TIME_IST` on the same trading day and exiting it at the last traded price.
- Exit trades marked so Reports can distinguish them from user-initiated exits.
- Called by the market tick function; no-op before 15:20 IST.

**Verify:**

- Test with an injected clock: a position open at 15:19 survives; after the first run at or past 15:20 it is flat with a closing trade and realised P&L recorded.
- Test: square-off releases `positions.blocked_margin` in full and deletes the row.
- Test: a symbol whose only quote is simulator-sourced still squares off, and the closing trade records that provenance rather than passing as a real close.
- **Loss-cap test:** a short whose adverse move exceeds collateral plus available cash still squares off. `available_cash` lands at exactly zero, a `SIMULATION_ADJUSTMENT` row carries the uncovered remainder, `trades.realised_pnl` records the **true** uncapped loss, and identity 9 still balances.
- Test, **two concurrent sessions**: `square_off_mis()` invoked simultaneously after 15:20 exits each position exactly once.
- Test: no CNC holding is ever touched by the square-off job.

### Phase checkpoint

The engine is correct and covered by tests. Re-run the full suite, reconcile a randomised trading session end to end, and confirm every identity in `trading-contract.md` §12 holds.

---


## Phase 5 — Portfolio Pages

### 30 Holdings page



**UI:**

- Columns: symbol, quantity, average cost, LTP, current value, overall P&L, day change — P&L coloured by sign.
- Footer totals: invested, current value, overall P&L, day P&L.
- Sortable columns; per-row exit action opening a pre-filled sell ticket.
- Empty state for a user with no holdings.

**Logic:**

- Server-side join of `holdings` and `quotes`; the client subscribes only for live LTP.

**Verify:**

- Totals equal the sum of the rows, asserted against a hand-computed fixture.
- A live tick updates a row's P&L and the footer total together.
- Selling the full quantity removes the row entirely rather than leaving a zero.

### 31 Positions page



**UI:**

- MIS positions with net quantity (negative for shorts), average price, LTP, unrealised and realised P&L.
- Exit button per position; a banner showing time remaining until auto square-off.
- Empty state.

**Verify:**

- An intraday buy appears here and not in Holdings; a CNC buy does the opposite.
- Exiting a position writes the closing trade and the realised P&L matches a hand calculation.
- A short position shows negative quantity and P&L that moves opposite to price.

### 32 Funds page



**UI:**

- Cards: available cash, used margin, opening balance, total P&L.
- Ledger table with type, amount, running balance, related order, and timestamp; paginated and filterable by type.
- "Reset account" with a confirmation dialog spelling out exactly what is destroyed.

**Logic:**

- `resetAccount` Server Action calling the `reset_account` database function.

**Verify:**

- Every trade produces a matching ledger entry; the count matches the trade count.
- `balance_after` on the newest entry equals `funds.available_cash` exactly.
- `used_margin` equals `Σ orders.blocked_margin` over `OPEN` orders plus `Σ positions.blocked_margin`, checked after a randomised sequence of placements, fills, partial covers and cancels.
- Reset restores the post-signup state exactly: orders, trades, holdings, positions and all ledger rows deleted, cash back to `OPENING_BALANCE`, `used_margin` zero, and a single fresh `SIGNUP_CREDIT` row — per `trading-contract.md` §11.
- The confirmation dialog is required — no path resets without it.

### 33 Stock detail page



**UI:**

- Header: symbol, name, LTP, day change, market status.
- Candlestick chart with 1D / 1W / 1M / 1Y range switching.
- OHLC, volume, 52-week high and low.
- Buy and sell buttons opening the ticket; the user's current holding in this symbol, if any.

**Logic:**

- `getCandles(symbol, range)` server-side: map range to interval, serve from `candles` when `candle_sync` is fresh, otherwise fetch through the candle provider chain, upsert, and stamp `candle_sync`.
- 1M and 1Y windowed from the one `ONE_DAY` series rather than fetched separately.
- On provider failure, serve the cached rows with their true age surfaced; never an empty chart, never fabricated candles inside a real series.
- The chart component receives plain serialisable data and resolved theme colours.

**Verify:**

- The chart renders for ten different symbols with no console errors.
- Switching between 1M and 1Y issues **no** new upstream request — both window the same cached daily series.
- A second visit inside the TTL issues no upstream request at all; `candle_sync.fetched_at` is unchanged.
- With the provider forced to fail and cached rows present, the chart still renders and shows the data's real age.
- Navigating away and back leaves no leaked canvas — `chart.remove()` confirmed in cleanup.
- A symbol with no available history shows an explanatory empty state, not a broken chart.

### 34 Reports and trade history



**UI:**

- Completed trades with date-range and symbol filters.
- Realised P&L summary, and unrealised P&L for open holdings.
- Per-trade charge breakdown expandable from the row.
- CSV export of the filtered set.

**Verify:**

- Realised P&L totals equal the sum of `trades.realised_pnl` over the filtered range.
- Filters narrow the set correctly, verified against a direct SQL count.
- The exported CSV row count matches what is on screen.

### 35 Profile and settings



**UI:**

- Google name, email, avatar, and the simulated client ID.
- Light/dark theme toggle persisted to `profiles.theme`.
- Account reset, duplicated here from Funds.
- Sign out.

**Verify:**

- The theme choice survives sign-out and sign-in on a different browser.
- The client ID matches the one issued at bootstrap.
- Reset from here behaves identically to reset from Funds.

### Phase checkpoint

Every page in `project-overview.md` exists and is wired to real data. Walk the full journey from signup to a closed position and confirm every number reconciles.

---


## Phase 6 — Polish & Ship

### 36 States, skeletons, and error boundaries



**UI:**

- A `loading.tsx` skeleton for every data-loading route segment, shaped like the content it replaces.
- An `error.tsx` with retry for every terminal segment.
- Reviewed empty states across watchlist, holdings, positions, orders, ledger, and reports.

**Verify:**

- Throttled to Slow 3G, every terminal route shows a skeleton rather than a blank frame.
- Forcing a query failure renders the boundary with a working retry.
- A brand-new account sees a purposeful empty state on all six surfaces.

### 37 Responsive pass



**UI:**

- Watchlist becomes a bottom sheet or drawer on mobile.
- Dense tables scroll horizontally inside their own container; the page body never scrolls sideways.
- The order ticket is usable one-handed at 375px.

**Verify:**

- Every route at 375px, 768px, and 1440px has no horizontal body overflow.
- The order ticket can be completed end to end on a 375px viewport.

### 38 Accessibility pass



**Logic:**

- Keyboard navigation throughout; visible focus rings; a search shortcut.
- Labels on every input, `aria-live` on the market status and toasts.
- Contrast checked in both themes — including P&L red and green against both backgrounds.

**Verify:**

- The full order flow is completable with the keyboard alone.
- Axe reports no serious or critical violations on the six main terminal routes.
- Colour is never the only carrier of meaning — P&L sign shows an arrow or sign as well.

### 39 Deploy



**Logic:**

- Render web service: build and start commands, Node version pinned, environment variables set.
- Supabase production project migrated and seeded; Google OAuth redirect URLs updated for the Render origin.
- `pg_cron` job scheduled against the production Edge Function.
- `/api/health` returning build and database status.

**Verify:**

- A cold visit to the Render URL loads and signs in successfully.
- `cron.job_run_details` on production shows successful runs while the web service is asleep.
- Placing an order on production behaves exactly as locally.
- No secret appears in the client bundle — verified by grepping the built output for the service-role key.

### 40 README, demo, and handoff



**Logic:**

- README: what it is, screenshots, architecture diagram, local setup, environment variables, the honest data-source explanation.
- A seeded demo account with a varied portfolio so the dashboard is never empty for a first-time viewer.
- Repository links from About and the footer.

**Verify:**

- A clean clone can be brought up locally following only the README.
- Every screenshot matches the current UI.
- The demo account shows a populated dashboard with at least ten holdings so the donut chart is meaningful.

### Phase checkpoint

Shipped. Full regression pass on production: sign up, trade, reset, sign out. Compact the build journal and promote every remaining constraint.

---
