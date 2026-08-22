# Architecture

> **Role:** How the system is built — stack, structure, boundaries, data, and the invariants that must never be violated.
> **Read after** `project-overview.md`, before writing any code.
> **Relates to:** the stack here drives `code-standards.md` and `library-docs.md`.

## Stack

| Layer | Tool | Purpose |
| ----- | ---- | ------- |
| Framework | Next.js 16.3.1 (App Router) | Marketing pages, terminal routes, Server Actions, route handlers |
| UI runtime | React 19.2.8 | Server Components by default; Client Components for live price surfaces |
| Language | TypeScript 6.0.3, `strict` | All application and Edge Function code. **Not 7.x**: `typescript-eslint` refuses to load against the TS 7 API, so `pnpm lint` cannot run on it (F01) |
| Styling | Tailwind CSS 4.3.3 + `@tailwindcss/postcss` | CSS-first theming via `@theme`; design tokens derived from `context/DESIGN.md` |
| Type | Inter + IBM Plex Sans via `next/font` | Editorial type and tabular numerals; substitutes named in `DESIGN.md` |
| Components | shadcn/ui (Radix) + `lucide-react` 1.33.0 | Dialogs (order ticket), tabs, dropdowns, toasts, command palette (search) |
| Database | Supabase Postgres (hosted) | All persistent state; source of truth for every money calculation |
| Auth | Supabase Auth — Google OAuth, via `@supabase/ssr` 0.12.4 | Session cookies, route protection in `src/proxy.ts` |
| Client SDK | `@supabase/supabase-js` 2.112.3 | Browser, server, and admin clients |
| Realtime | Supabase Realtime (Postgres Changes) | Pushes `quotes` and `orders` row changes to subscribed clients |
| Scheduled work | Supabase `pg_cron` + `pg_net` → Edge Functions (Deno) | Quote refresh, limit-order matching, MIS square-off |
| Client tick state | Zustand 5.0.15 | In-memory live quote store and tick interpolation loop |
| Validation | Zod 4.4.3 | Every Server Action input and every external API response |
| Theming | `next-themes` 0.4.6 | Light and dark from one token set, persisted without a flash on load (F02) |
| Forms | `react-hook-form` 7.85.0 + `@hookform/resolvers` 5.9.1 | Order ticket only. The support form uses React 19's form action + `useActionState`, so it submits without JavaScript (F07B) |
| Portfolio charts | Recharts 3.10.1 | Top-10 holdings donut, P&L breakdown |
| Price charts | `lightweight-charts` 5.2.1 | Candlestick chart on stock detail |
| Quote sources | Built-in simulator today; Yahoo Finance `v8/finance/chart` (keyless) in front of it when it lands | **Twelve Data was dropped in F14**, not deferred — its free plan carries no NSE symbols, verified live with a real key. Yahoo is deferred to the end of the project after a validation probe got this machine's IP blocked, so Phase 3 ships simulator-backed and every price badges `SIMULATED` (F14, F15) |
| Tests — logic | Vitest 4.1.11 | Charge estimator, provider chain, market-hours, parsers |
| Tests — database | pgTAP, run by `scripts/run-pgtap.mts` over `pg` | RLS, grants, constraints, function correctness. **Not** `supabase test db`: it needs Docker even with `--db-url` (F09) |
| Tests — concurrency | `pg` 8.23.0, two live connections | Row-lock races the other tiers cannot express |
| Accessibility | Lighthouse 13.4.1 | `pnpm audit:a11y <path>` — every public page audited as it ships, not once at the end (F04) |
| Tooling | pnpm 11, ESLint 9.39.5, Prettier 3.9.6 | Install, lint, format. **Not ESLint 10**: `eslint-plugin-react` 7.37.5 — the newest release, pulled in by `eslint-config-next` — crashes on ESLint 10's rule-context API (F01) |
| Hosting | Render (free web service) + hosted Supabase | Deployment target |

**Free-tier constraints that shaped this architecture.** Render's free tier has no cron jobs and no
background workers, and spins a web service down after 15 minutes without traffic. Supabase's free
tier ships `pg_cron` with a one-minute minimum interval. All scheduled work therefore lives in
Postgres and Edge Functions, not in the Next.js process — the market keeps ticking and limit orders
keep filling while Render is asleep.

---

## Folder Structure

```
ZerodhaRebuild/
├── CLAUDE.md                       → agent entry point; points here
├── context/                        → these documents
├── public/                         → static assets, logo, og image
├── supabase/
│   ├── migrations/                 → timestamped SQL migrations, applied in order
│   ├── functions/
│   │   ├── market-tick/index.ts    → the single scheduled job: refresh, match, square off
│   │   └── _shared/                → the one copy of logic both runtimes need; app reads it via `@shared/*`
│   ├── tests/                      → tier 2, pgTAP. The number is the order a suite
│   │   │                             arrived in, NOT a reserved slot per concern —
│   │   │                             the original 03-charges/04-margin/05-execution
│   │   │                             plan was overtaken by F14 and F16 needing 03 and
│   │   │                             04 first. New suites take the next free number.
│   │   ├── 00-smoke.sql            → pgtap reachable; proves the runner hits a real database
│   │   ├── 01-rls-*.sql            → per-table read/write denial, and grant denial (F07B, F10, F11)
│   │   ├── 02-bootstrap.sql        → what exists the moment a user is created (F13)
│   │   ├── 02-constraints-money.sql → money-shaped CHECK and FK constraints (F11)
│   │   ├── 03-reference-data.sql   → the seeded universe and NSE calendar are sane (F14)
│   │   ├── 04-market-tick.sql      → which symbols a tick refreshes, and who may ask (F16)
│   │   └── …                       → charges (F22), margin (F23), execution (F24) still to come
│   └── seed/
│       ├── nifty200.json           → instrument universe seed data
│       └── nse-holidays.json       → the published NSE closure calendar
├── src/
│   ├── app/
│   │   ├── (marketing)/            → public site; Server Components, no session required
│   │   │   ├── layout.tsx          → public header/footer + disclaimer banner
│   │   │   ├── page.tsx            → Home
│   │   │   ├── about/page.tsx
│   │   │   ├── pricing/page.tsx
│   │   │   ├── support/page.tsx
│   │   │   └── legal/page.tsx
│   │   ├── (terminal)/             → authenticated trading terminal
│   │   │   ├── layout.tsx          → terminal shell: top nav, index strip, watchlist sidebar
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── orders/page.tsx
│   │   │   ├── holdings/page.tsx
│   │   │   ├── positions/page.tsx
│   │   │   ├── funds/page.tsx
│   │   │   ├── reports/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── stocks/[symbol]/page.tsx
│   │   ├── auth/
│   │   │   ├── login/page.tsx      → Google sign-in
│   │   │   └── callback/route.ts   → OAuth code exchange
│   │   ├── api/health/route.ts     → uptime probe
│   │   ├── layout.tsx              → root layout, theme provider, fonts
│   │   ├── globals.css             → @import "tailwindcss" + @theme tokens
│   │   └── not-found.tsx
│   ├── proxy.ts                    → Next.js 16 proxy (was middleware.ts): session refresh + route guard
│   ├── components/
│   │   ├── ui/                     → shadcn primitives, unmodified API
│   │   ├── marketing/              → hero, feature grid, pricing table, support form
│   │   ├── terminal/               → watchlist, order ticket, positions table, index strip
│   │   └── charts/                 → HoldingsDonut, PriceChart
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           → browser client
│   │   │   ├── server.ts           → RSC / Server Action client
│   │   │   ├── proxy.ts            → session-refreshing client for src/proxy.ts
│   │   │   └── admin.ts            → service-role client, server-only
│   │   ├── market/
│   │   │   └── market-hours.ts     → re-exports `@shared/market-hours.ts`; the app's
│   │   │                             door onto the session logic. The providers, the
│   │   │                             quote service and the session core itself live in
│   │   │                             supabase/functions/_shared/ (F16), because the
│   │   │                             Edge Function cannot import from src/ and one
│   │   │                             shared copy beats two kept in step. Twelve Data
│   │   │                             was dropped in F14, not deferred: its free plan
│   │   │                             carries no NSE symbols.
│   │   ├── trading/
│   │   │   ├── charges.ts          → brokerage, STT, GST, stamp duty
│   │   │   └── schemas.ts          → Zod schemas for order input
│   │   ├── stores/quote-store.ts   → Zustand live quote store + interpolation
│   │   ├── constants.ts            → OPENING_BALANCE, SQUARE_OFF_TIME, rate limits, charge rates
│   │   └── utils.ts                → cn(), formatters (₹, %, qty)
│   ├── server/actions/             → orders.ts, watchlist.ts, funds.ts, support.ts
│   └── types/
│       ├── database.ts             → generated from Supabase schema
│       └── domain.ts               → hand-written domain types
├── tests/
│   └── concurrency/                → tier 3; two `pg` connections racing for a lock
│       ├── helpers.ts              → client pair, seeded fixtures, afterEach cleanup
│       └── execute-order.race.test.ts
├── package.json
└── tsconfig.json                   → path alias @/* → src/*
```

---

## System Boundaries

| Folder | Owns |
| ------ | ---- |
| `src/app/(marketing)/` | Public, session-free pages. Must not import from `src/server/actions/orders.ts`, `lib/supabase/admin.ts`, or any terminal component. |
| `src/app/(terminal)/` | Authenticated pages. Owns page composition and data loading only — no money arithmetic, no direct upstream HTTP calls. |
| `src/components/ui/` | shadcn primitives. Styling may change; component APIs must not. Contains no domain logic and no Supabase imports. |
| `src/components/terminal/` | Trading UI. May read the Zustand quote store and call Server Actions. Must never query Supabase directly for user-owned tables. |
| `src/lib/supabase/` | The only place Supabase clients are constructed. Nothing else in the codebase may call `createServerClient` or `createBrowserClient`. |
| `src/lib/market/` | Upstream quote fetching, provider fallback, and market-hours logic. Pure and testable; imports nothing from `src/app/` or `src/components/`. |
| `src/lib/trading/` | Charge formulas and order input schemas. Pure functions only — no I/O, no Supabase, no `Date.now()` without an injected clock. |
| `src/server/actions/` | The only boundary through which the browser mutates data. Every export is `'use server'`, Zod-validated, and returns the standard result shape. |
| `supabase/migrations/` | Schema, RLS policies, triggers, and the `place_order` / `execute_order` / `reset_account` functions. The only place DDL lives. |
| `supabase/functions/market-tick/` | The scheduled job. The only code permitted to write to `quotes`, and the only caller of `match_open_orders` and `square_off_mis`. |
| `src/types/database.ts` | Generated output. Never hand-edited; regenerate after every migration. |

---

## Data Flow

### Quote refresh (scheduled, every minute during market hours)

```
pg_cron ('* 3-10 * * 1-5' — UTC, ≈ 08:30–16:29 IST; a coarse cost window, NOT the gate)
  └─> net.http_post → Edge Function `market-tick`
        ├─ isTradingSession() — IST clock + NSE holiday calendar
        │    └─ closed? return { ok: true, skipped: 'MARKET_CLOSED' } and write nothing
        ├─ roll_previous_close()  — first tick of a session carries each stale
        │    quote's ltp into its prev_close, so the day change and the
        │    simulator's ±5% band measure from the previous session, not from
        │    the bhavcopy seed. Derived from fetched_at, so a missed tick repairs
        │    itself and it cannot double-apply (F16).
        ├─ select_demanded_symbols(MAX_SYMBOLS_PER_TICK)  — a SQL function, so pgTAP
        │    can test the union directly. OPEN orders ∪ holdings ∪ positions ∪
        │    symbol_demand ∪ watchlists, deduplicated, ranked, capped. Watchlists
        │    are in it because symbol_demand has no write path until F18 (F16).
        ├─ QuoteService.getQuotes(symbols)
        │    ├─ YahooProvider        → not built yet; deferred to the end (F14)
        │    └─ SimulatorProvider    → last resort, cannot fail; walks from the last
        │                              quote, else instruments.prev_close (F15)
        ├─ upsert quotes (ltp, prev_close, ohlc, volume, provider, provider_ts, fetched_at)
        ├─ match_open_orders()   → F28 wires this in; not called yet
        └─ square_off_mis()      → F29 wires this in; not called yet

  The token-bucket limiter is deliberately absent: it caps nothing in front of a
  local simulator, and waits for a provider that makes outbound requests (F15).
              │
              ▼
      Postgres Changes on `quotes` and `orders`
              │
              ▼
      Supabase Realtime → subscribed browsers → Zustand quote store
              │
              ▼
      requestAnimationFrame interpolation → LTP ticks + green/red flash
```

### Placing an order (user mutation)

```
Order ticket (Client Component)
  └─> Server Action `placeOrder` ('use server')
        ├─ Zod parse of the input
        ├─ createClient() from lib/supabase/server → session-scoped, RLS applies
        └─ rpc('place_order', {...})            ── Postgres, one transaction ──
              ├─ insert orders row (status OPEN)
              ├─ reserve_margin(order_id)  → moves the requirement from
              │        available_cash into used_margin, stamps orders.blocked_margin.
              │        A buy reserves notional + charges; a short reserves its
              │        collateral (§6), so a clean fill needs no top-up
              ├─ if MARKET → execute_order(order_id)
              │     ├─ SELECT ... FOR UPDATE on orders row
              │     ├─ status still 'OPEN'? if not, return — a concurrent run got here first
              │     ├─ SELECT ... FOR UPDATE on funds row
              │     ├─ compute charges (numeric)
              │     ├─ margin check against (available_cash + blocked_margin)
              │     │     └─ insufficient → REJECTED + release_margin(), return
              │     ├─ retire the reservation, exactly once, BEFORE writing
              │     │  the trade or the position:
              │     │     ├─ fill opens a short →
              │     │     │    transfer_margin_to_position(id, price, charges)
              │     │     │      └─ ok=false → REJECTED, nothing else written
              │     │     └─ otherwise         → release_margin()
              │     ├─ insert trades row
              │     ├─ upsert holdings (CNC) or positions (MIS),
              │     │    averaging charges up for a long, down for a short;
              │     │    a short writes back the collateral and
              │     │    entry_reference_price the transfer returned
              │     ├─ a fill that reduces a short →
              │     │    recompute_position_collateral(user, symbol, new_qty),
              │     │    BEFORE the new quantity is written
              │     ├─ update funds (available_cash, used_margin)
              │     ├─ insert fund_ledger rows
              │     └─ update orders → COMPLETE (average_price, filled_quantity)
              └─ else leave OPEN — margin stays reserved until fill or cancel
        ▲
        └── returns { ok: true, data: { orderId, status } } | { ok: false, error: { code, message } }
```

### Candle fetch (on demand, cached)

```
Stock detail page (Server Component)
  └─> getCandles(symbol, range)
        ├─ map range → interval  (1D→FIVE_MIN, 1W→THIRTY_MIN, 1M/1Y→ONE_DAY)
        ├─ candle_sync fresh for (symbol, interval)?  → read candles, done
        └─ stale or missing:
              ├─ token-bucket limiter + circuit breaker (shared with quotes)
              ├─ CandleProvider chain → Yahoo → simulator
              ├─ upsert candles, update candle_sync (fetched_at, provider)
              └─ on total failure: serve the stale rows we already have,
                 badged with their real age — never an empty chart, never a fabricated one
```

### Reading portfolio state (page load)

```
Terminal page (Server Component)
  └─> createClient() from lib/supabase/server
        └─> select from holdings / positions / orders   (RLS scopes to auth.uid())
              └─> joined with quotes for LTP
                    └─> rendered server-side, then hydrated by the Zustand store for live ticks
```

### Support form submission

```
Support form (React 19 form action + useActionState — no JavaScript required)
  └─> Server Action `submitSupportMessage(previousState, formData)`
        ├─ Zod parse of the FormData
        ├─ honeypot filled? report success, insert nothing
        └─ insert support_messages   (RLS: anon INSERT granted; no select policy for any role)
```

---

## Data Model

All monetary columns are `numeric(14,2)` in rupees. All quantities are `integer`. All timestamps are
`timestamptz` stored in UTC and rendered in `Asia/Kolkata`.

**Enums:** `order_side` (BUY, SELL) · `order_type` (MARKET, LIMIT) · `product_type` (CNC, MIS) ·
`order_status` (OPEN, COMPLETE, CANCELLED, REJECTED) · `quote_provider` (YAHOO, TWELVE_DATA, SIMULATOR) · `candle_interval` (FIVE_MIN, THIRTY_MIN, ONE_DAY) ·
`ledger_type` (SIGNUP_CREDIT, MARGIN_BLOCK, MARGIN_RELEASE, BUY_DEBIT, SELL_CREDIT, CHARGES, REALISED_PNL, SIMULATION_ADJUSTMENT)

### `profiles`

| Column | Type | Notes |
| ------ | ---- | ----- |
| id | uuid PK | References `auth.users(id)` on delete cascade |
| client_id | text unique | Generated `ZR` + 6 digits. The unique constraint is a backstop, not the strategy — the trigger retries on collision (see below) |
| full_name | text | From the Google profile |
| avatar_url | text | From the Google profile |
| theme | text | `light` or `dark`, `CHECK`-constrained, default **`dark`** — `project-overview.md` specifies a dark-default terminal and `theme-provider.tsx` ships `defaultTheme="dark"`; this row said `light` until F10 (F10) |
| created_at | timestamptz | Default `now()` |

### `instruments`

| Column | Type | Notes |
| ------ | ---- | ----- |
| symbol | text PK | NSE trading symbol, e.g. `RELIANCE` |
| name | text | `Reliance Industries Limited` |
| exchange | text | `NSE` for the whole seeded universe |
| sector | text | Used for grouping in Reports |
| yahoo_symbol | text | `RELIANCE.NS` — provider-specific mapping, never assumed |
| tick_size | numeric(6,2) | Default 0.05 |
| is_active | boolean | Excludes delisted names from search without deleting history |

### `quotes`

| Column | Type | Notes |
| ------ | ---- | ----- |
| symbol | text PK | References `instruments(symbol)` |
| ltp | numeric(14,2) | Last traded price |
| prev_close | numeric(14,2) | Basis for day change |
| day_open / day_high / day_low | numeric(14,2) | Nullable outside market hours |
| volume | bigint | Nullable |
| provider | quote_provider | Which provider produced this figure |
| provider_ts | timestamptz | The provider's own timestamp for the price (Yahoo's `regularMarketTime`). Null only for `SIMULATOR` |
| fetched_at | timestamptz | When we retrieved it |
| updated_at | timestamptz | When this row last changed; Realtime fires on change |

**There is no stored `source` column, deliberately.** Freshness is a function of the current time, so a
row written as "LIVE" becomes stale minutes later with no write to invalidate it. Storing the badge
would make it wrong by default. The badge is *derived at read time* from `provider` and `provider_ts` —
see Quote Provenance below.

### `candles`

Cached OHLC series for the stock detail chart. Written only by the candle fetcher, never by a browser.

| Column | Type | Notes |
| ------ | ---- | ----- |
| symbol | text | Composite PK `(symbol, interval, ts)` |
| interval | candle_interval | `FIVE_MIN`, `THIRTY_MIN`, or `ONE_DAY` |
| ts | timestamptz | Candle open time |
| open / high / low / close | numeric(14,2) | |
| volume | bigint | Nullable |

The four UI ranges map onto three stored intervals: **1D** → `FIVE_MIN`, **1W** → `THIRTY_MIN`, and
both **1M** and **1Y** → `ONE_DAY`, served as different windows over one daily series. Fetching a year
of dailies once satisfies both.

### `candle_sync`

| Column | Type | Notes |
| ------ | ---- | ----- |
| symbol | text | Composite PK `(symbol, interval)` |
| interval | candle_interval | |
| fetched_at | timestamptz | Drives the per-interval TTL |
| provider | quote_provider | Provenance for the chart, same contract as quotes |

TTLs, from `constants.ts`: `FIVE_MIN` refreshes every 5 minutes during a session and not at all outside
one; `THIRTY_MIN` every 30 minutes during a session; `ONE_DAY` once per trading day after close.
Retention: `FIVE_MIN` keeps the current trading day, `THIRTY_MIN` five trading days, `ONE_DAY` 400 days.
Pruning runs once daily inside `market-tick`.

### `symbol_demand`

| Column | Type | Notes |
| ------ | ---- | ----- |
| symbol | text PK | References `instruments(symbol)` |
| last_requested_at | timestamptz | Updated when a client subscribes; drives demand-driven refresh |
| priority | smallint | Higher for symbols in holdings, positions, or open orders |

### `funds`

| Column | Type | Notes |
| ------ | ---- | ----- |
| user_id | uuid PK | References `profiles(id)` |
| available_cash | numeric(14,2) | `CHECK (available_cash >= 0)` |
| used_margin | numeric(14,2) | Equals `Σ orders.blocked_margin` over `OPEN` orders plus `Σ positions.blocked_margin` — never a free-standing figure |
| opening_balance | numeric(14,2) | 100000.00 at signup and after reset |
| updated_at | timestamptz | |

### `fund_ledger`

| Column | Type | Notes |
| ------ | ---- | ----- |
| id | uuid PK | |
| user_id | uuid | Indexed with `created_at` for the Funds page |
| type | ledger_type | |
| amount | numeric(14,2) | Signed: negative for debits |
| balance_after | numeric(14,2) | Makes the ledger auditable without replaying it |
| order_id | uuid | Nullable reference to `orders(id)` |
| note | text | Human-readable description |
| created_at | timestamptz | |

### `orders`

| Column | Type | Notes |
| ------ | ---- | ----- |
| id | uuid PK | |
| user_id | uuid | Indexed with `placed_at` |
| symbol | text | References `instruments(symbol)` |
| side | order_side | |
| order_type | order_type | |
| product | product_type | |
| quantity | integer | `CHECK (quantity > 0)` |
| limit_price | numeric(14,2) | Required when `order_type = LIMIT`, else null |
| filled_quantity | integer | 0 until filled; this build fills all-or-nothing |
| average_price | numeric(14,2) | Null until filled |
| status | order_status | |
| blocked_margin | numeric(14,2) | Reserved at placement; retired on any terminal transition by `release_margin` or `transfer_margin_to_position`. Zero once the order leaves `OPEN` |
| rejection_reason | text | e.g. `INSUFFICIENT_FUNDS`, `NO_HOLDING`, `MARKET_CLOSED` |
| placed_at / executed_at | timestamptz | |

### `trades`

| Column | Type | Notes |
| ------ | ---- | ----- |
| id | uuid PK | |
| user_id | uuid | |
| order_id | uuid | References `orders(id)` |
| symbol | text | |
| side | order_side | |
| product | product_type | |
| quantity | integer | |
| price | numeric(14,2) | Execution price |
| charges | numeric(14,2) | Total of the charge breakdown |
| charge_breakdown | jsonb | Brokerage, STT, exchange, SEBI, stamp duty, GST, DP |
| realised_pnl | numeric(14,2) | Net of closing-leg charges; `0.00` on opening legs, never null |
| is_auto_squareoff | boolean | True when written by the 15:20 square-off job rather than a user action |
| traded_at | timestamptz | |

### `holdings`

| Column | Type | Notes |
| ------ | ---- | ----- |
| user_id | uuid | Composite PK `(user_id, symbol)` |
| symbol | text | |
| quantity | integer | `CHECK (quantity > 0)` — a row that reaches zero is deleted, never retained |
| average_price | numeric(14,2) | Cost per share; recomputed on every buy with charges capitalised upward |
| updated_at | timestamptz | |

### `positions`

| Column | Type | Notes |
| ------ | ---- | ----- |
| user_id | uuid | Composite PK `(user_id, symbol, product)` |
| symbol | text | |
| product | product_type | `MIS` in this build |
| net_quantity | integer | Negative for intraday shorts |
| average_price | numeric(14,2) | Cost per share for a long, net proceeds per share for a short — charges capitalise in opposite directions. **P&L only** |
| entry_reference_price | numeric(14,2) | Quantity-weighted average of **gross** fill prices. **Collateral only**; null for longs |
| realised_pnl | numeric(14,2) | Accumulated on partial exits |
| blocked_margin | numeric(14,2) | Collateral against an open short: `\|net_quantity\| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges`, recomputed on every change. Zero for longs |
| opened_at | timestamptz | Original entry; not reset when adding to the position. Used by the square-off job |

### Portfolio views

Three `security_invoker` views, added in F21. None carries a predicate of its own — RLS on the
underlying table is the boundary, reached through `security_invoker`, which is the correction F18
made to `watchlist_rows`.

| View | Grain | Notes |
| ---- | ----- | ----- |
| `portfolio_holdings` | One row per holding | `holdings` ⋈ `instruments` ⋈ `quotes`, left-joined on quotes so an unpriced holding still appears with null valuation. Carries `invested`, `market_value`, `unrealised_pnl`, `day_pnl` and the three provenance columns |
| `portfolio_summary` | One row per user | The dashboard tiles. Driven from `funds` so a never-traded account still produces a row. `unpriced_count` is what stops the sums silently omitting an unpriced holding |
| `market_composite` | One row | Equal-weighted mean day change across every priced active instrument, with advances/declines and `universe_size`. **A breadth statistic, never an index** — it reports raw provenance inputs rather than a source, because freshness is derived at read time |

### `watchlist_items`

| Column | Type | Notes |
| ------ | ---- | ----- |
| user_id | uuid | Composite PK `(user_id, symbol)` |
| symbol | text | |
| sort_order | smallint | User-controlled ordering |

### `market_holidays`

| Column | Type | Notes |
| ------ | ---- | ----- |
| trading_date | date PK | A date NSE is closed; seeded annually from NSE's published calendar |
| description | text | e.g. `Republic Day` |

### `support_messages`

| Column | Type | Notes |
| ------ | ---- | ----- |
| id | uuid PK | |
| name / email | text | Not tied to a session; the form is public |
| category | text | Matches the Support page categories |
| message | text | |
| created_at | timestamptz | |

---

## Quote Provenance

The honesty guarantee — every displayed price carries an accurate account of where it came from — is
implemented here, not by a stored flag.

```ts
// src/lib/market/provenance.ts
import { QUOTE_LIVE_WINDOW_MS, QUOTE_DELAYED_WINDOW_MS } from '@/lib/constants'

export type QuoteSource = 'LIVE' | 'DELAYED' | 'STALE' | 'SIMULATED'

export type Provenance = {
  source: QuoteSource
  provider: 'YAHOO' | 'TWELVE_DATA' | 'SIMULATOR'
  providerTs: Date | null
  fetchedAt: Date
  /** True when the figure on screen came from the interpolation loop, not the provider. */
  isInterpolated: boolean
}

/** Providers declare their best achievable latency. Only a genuinely streaming
 *  provider can ever qualify as LIVE — a polled REST endpoint cannot. */
const PROVIDER_IS_REALTIME = { YAHOO: false, TWELVE_DATA: false, SIMULATOR: false } as const

export function deriveSource(
  provider: keyof typeof PROVIDER_IS_REALTIME,
  providerTs: Date | null,
  now: Date
): QuoteSource {
  if (provider === 'SIMULATOR') return 'SIMULATED'
  if (!providerTs) return 'STALE'
  const age = now.getTime() - providerTs.getTime()
  if (age > QUOTE_DELAYED_WINDOW_MS) return 'STALE'
  if (age <= QUOTE_LIVE_WINDOW_MS && PROVIDER_IS_REALTIME[provider]) return 'LIVE'
  return 'DELAYED'
}
```

**What this means in practice: with Yahoo as the provider, quotes badge `DELAYED`, never `LIVE`.**
`LIVE` is reserved for a provider that actually streams ticks, and this build has none. Saying
`DELAYED` honestly is the point of the badge; a `LIVE` badge over a polled REST endpoint would be the
exact dishonesty the guarantee exists to prevent.

**TODO: measure Yahoo's real `regularMarketTime` lag during an open NSE session** and record it, so
`QUOTE_DELAYED_WINDOW_MS` is set from data rather than assumption. Two attempts to measure it were
rate-limited.

### Interpolated values

The client's `requestAnimationFrame` loop moves prices between server anchors. Those intermediate
figures are **synthetic**, and the rules follow from that:

- **Any surface where the number drives a decision renders the anchor, never the interpolated value**: the order ticket, the order confirmation, the stock detail header price, and every total on Funds, Holdings, Positions and Reports.
- Ambient surfaces may render interpolated motion: the watchlist and the index strip.
- **The dashboard summary tiles are not ambient**, though an earlier draft of this line listed them as such. They are monetary totals, and the invariant below admits no exception for them: they recompute from the anchor when a tick lands, and never mid-tween. F21 resolved the contradiction in the invariant's favour.
- Wherever an interpolated figure is shown, its provenance carries `isInterpolated: true`, and the hover detail shows the true anchor, its provider, and its timestamp.
- The shell badge reports the worst provenance among symbols on screen. It is a summary, **not a substitute** for per-price provenance — every individual price still resolves its own.

---

## Authentication

**Client ID generation.** `ZR` + six digits is a one-million-key space against a unique index, so
collisions are rare but not negligible. The bootstrap trigger retries generation up to 10 times on a
unique violation and, if all 10 collide, raises `CLIENT_ID_EXHAUSTED` rather than silently failing the
signup or looping forever. A collision must never surface to the user as a broken sign-in.

- Provider: Supabase Auth via `@supabase/ssr`
- Methods: Google OAuth only. No email/password, no magic links.
- Protected: everything under `src/app/(terminal)/` — `/dashboard`, `/orders`, `/holdings`, `/positions`, `/funds`, `/reports`, `/settings`, `/stocks/*`
- Public: `/`, `/about`, `/pricing`, `/support`, `/legal`, `/auth/*`, `/api/health`
- Session refresh and the route guard both live in `src/proxy.ts`. In Next.js 16 this file replaces `middleware.ts` and runs on the Node.js runtime; the edge runtime is not available there.
- Post-login destination is `/dashboard`, reached through `/auth/callback`.
- Authorisation is enforced in Postgres by RLS, not in application code. The app layer is a convenience, never the security boundary.

---

## Key Patterns

### Supabase server client (RSC and Server Actions)

```ts
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component; src/proxy.ts refreshes the session instead.
          }
        },
      },
    }
  )
}
```

### Session refresh and route guard

```ts
// src/proxy.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const TERMINAL_PREFIXES = [
  '/dashboard', '/orders', '/holdings', '/positions',
  '/funds', '/reports', '/settings', '/stocks',
]

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not put code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isTerminal = TERMINAL_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))

  if (!user && isTerminal) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

### Server Action shape

```ts
// src/server/actions/orders.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { placeOrderSchema } from '@/lib/trading/schemas'
import type { ActionResult } from '@/types/domain'

export async function placeOrder(input: unknown): Promise<ActionResult<{ orderId: string }>> {
  const parsed = placeOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Check the order details.' } }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('place_order', {
    p_symbol: parsed.data.symbol,
    p_side: parsed.data.side,
    p_order_type: parsed.data.orderType,
    p_product: parsed.data.product,
    p_quantity: parsed.data.quantity,
    p_limit_price: parsed.data.limitPrice ?? null,
  })

  if (error) {
    // Log the raw Postgres error; return only a mapped code and safe copy.
    console.error('[orders.placeOrder]', error)
    const code = toRejectionCode(error)
    return { ok: false, error: { code, message: ORDER_ERROR_COPY[code] } }
  }

  // A fill moves cash, margin, holdings, positions and the dashboard totals.
  for (const path of ['/orders', '/holdings', '/positions', '/funds', '/dashboard', '/reports']) {
    revalidatePath(path)
  }
  return { ok: true, data: { orderId: data as string } }
}
```

### Live quote subscription

```ts
// src/lib/stores/quote-store.ts (subscription half)
import { createClient } from '@/lib/supabase/client'
import { useQuoteStore } from '@/lib/stores/quote-store'

export function subscribeToQuotes(symbols: string[]) {
  const supabase = createClient()

  const channel = supabase
    .channel('quotes-live')
    .on(
      'postgres_changes',
      // Filter server-side, not in the callback: a table-wide subscription still has
      // every row delivered to and authorized for every subscriber.
      { event: 'UPDATE', schema: 'public', table: 'quotes', filter: `symbol=in.(${symbols.join(',')})` },
      (payload) => {
        const row = payload.new as {
          symbol: string
          ltp: number
          provider: 'YAHOO' | 'TWELVE_DATA' | 'SIMULATOR'
          provider_ts: string | null
        }
        // Store the anchor and its provenance inputs. Freshness is derived on render,
        // not captured here — it changes with the clock, not with the row.
        useQuoteStore.getState().applyServerQuote(row.symbol, row.ltp, {
          provider: row.provider,
          providerTs: row.provider_ts ? new Date(row.provider_ts) : null,
        })
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
```

### Quote provider chain

```ts
// supabase/functions/_shared/quote-service.ts — shared with the app via `@shared/*`.
// Deno cannot resolve `@/`, so this module imports only its sibling `.ts` files.
import type { ProviderQuote, QuoteProvider } from './provider-types.ts'

export function createQuoteService(options: QuoteServiceOptions) {
  // …failure counts and cool-off timestamps per provider…
  return {
    async getQuotes(symbols: readonly string[]): Promise<QuoteResult> {
      const attempted: QuoteResult['attempted'] = []

      for (const provider of options.providers) {
        if (circuitState(provider.name) === 'OPEN') {
          attempted.push({ name: provider.name, outcome: 'OPEN_CIRCUIT' })
          continue
        }
        try {
          // Declining is not failing: a provider with no key, or no anchor for
          // these symbols, must not count against its own circuit.
          if (!(await provider.isAvailable(symbols))) {
            attempted.push({ name: provider.name, outcome: 'UNAVAILABLE' })
            continue
          }
          const quotes = await provider.fetchQuotes(symbols)
          if (quotes.length === 0) { /* empty answer counts as a failure */ }
          failures.delete(provider.name) // consecutive failures, not lifetime
          return { quotes, provider: provider.name, attempted }
        } catch {
          // Swallowed deliberately: the upstream error is the chain's business,
          // not the caller's. The tick logs the attempt trail instead.
          attempted.push({ name: provider.name, outcome: 'FAILED' })
          recordFailure(provider.name)
        }
      }
      return { quotes: [], provider: null, attempted }
    },
  }
}
```

**It returns rather than throws when every provider declines.** An earlier draft
of this example threw "every provider failed, including the simulator"; the
shipped chain reports `{ provider: null }` and lets the tick decide, because the
simulator is the last resort and a throw would make an empty symbol list
indistinguishable from a broken upstream (F15).

---

## Invariants

- Every table containing a `user_id` has RLS enabled, scoped to `auth.uid() = user_id`. On `profiles` and `watchlist_items` that means owner-scoped policies for the commands the app actually issues; on the six money tables it means **`select` is the only grant any client role holds**, with no write policy for any command — every write there arrives through a `security definer` function (F11).
- No money value is ever computed in TypeScript; every balance, average price, charge total and realised P&L is calculated in Postgres `numeric` arithmetic and read back.
- Order fills happen only inside the `execute_order` Postgres function — never in a Server Action, route handler, Edge Function, or client component.
- `execute_order` takes `SELECT ... FOR UPDATE` on the user's `funds` row before reading `available_cash`, so concurrent orders cannot both pass the margin check.
- `available_cash` never goes negative; the column carries a `CHECK (available_cash >= 0)` constraint as the last line of defence.
- `execute_order` re-reads and re-checks `status = 'OPEN'` after taking the order row lock, and returns without writing if it is not — the lock alone does not prevent a double fill.
- `funds.used_margin` always equals `Σ orders.blocked_margin` over that user's `OPEN` orders plus `Σ positions.blocked_margin`; any code path that changes one changes the other in the same transaction.
- Every `orders` row not in status `OPEN` has `blocked_margin = 0`. Exactly two functions zero it — `release_margin` and `transfer_margin_to_position` — and no other code path may write that column.
- Margin is reserved once at placement and retired exactly once. Cancellations, rejections and cash-consuming fills retire it through `release_margin(order_id)`; a fill that opens a short retires it through `transfer_margin_to_position(order_id, fill_price, actual_charges)`, which moves the collateral to the position and releases only the remainder. The transfer runs **before** the trade and position rows are written, so its `ok = false` shortfall path has nothing to unwind.
- A short's collateral never becomes spendable while the position is open: `transfer_margin_to_position` writes no ledger row for the collateral portion, because `available_cash` does not change.
- For every open short, `positions.blocked_margin` equals `|net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges`, recomputed on every change to the position. The formula is written once, in `short_collateral_requirement()`; `transfer_margin_to_position` is the only path that increases it and `recompute_position_collateral` the only path that decreases it.
- `entry_reference_price` never appears in a P&L calculation and `average_price` never appears in a collateral calculation. The two averages exist because they answer different questions; crossing them silently under- or over-collateralises.
- A cover or square-off always completes. When the loss exceeds collateral plus available cash, the cash debit is capped, `available_cash` floors at zero, and the remainder is recorded as a `SIMULATION_ADJUSTMENT` ledger row — `CHECK (available_cash >= 0)` is never relaxed and no position is ever stranded.
- `average_price` capitalises charges upward for a long and downward for a short. One formula for both is an arithmetic error — see `trading-contract.md` §8.
- **Reported P&L and settled cash are different numbers on a short cover, and neither may be used for the other.** `trades.realised_pnl` is computed from the net `average_price` (§9); the `REALISED_PNL` ledger row is computed from the gross `entry_reference_price`, because a short's proceeds are never credited at entry while its entry charges are. Using `average_price` for the cash row debits those charges twice and breaks identity 1 on every short cover. (F24)
- **A fill that crosses zero writes one trade and one `CHARGES` row.** Its charges are computed once on the whole order; the closing share reduces `trades.realised_pnl` and the remainder capitalises into the new position's `average_price`, so the two always sum to `trades.charges`. (F24)
- An MIS short cannot be opened without reserving margin for it, so a user with no cash cannot sell short.
- No quote write, order match, or square-off happens unless `isTradingSession()` says the NSE session is open; the `pg_cron` window is a cost optimisation and is never trusted as the market-hours check.
- The `quotes` table is written only by the `market-tick` Edge Function; no browser, Server Action, or page may insert or update it.
- The `candles` and `candle_sync` tables are written only by the candle fetcher on the server; no browser may insert or update them.
- Quote freshness is never stored. `source` is derived from `provider` and `provider_ts` at read time, through `deriveSource()`, and nowhere else.
- `LIVE` is returned only for a provider flagged as genuinely streaming. No polled REST provider may ever be badged `LIVE`.
- Any price that influences a user decision — order ticket, confirmation, stock detail header, and every monetary total — renders the server anchor value, never an interpolated one.
- The service-role key is used only in `src/lib/supabase/admin.ts` and in Edge Functions, and `admin.ts` carries `import 'server-only'` at the top.
- Every `quotes` row has a non-null `provider` and `fetched_at`, and a non-null `provider_ts` unless the provider is `SIMULATOR`.
- Every Server Action validates its input with a Zod schema before touching the database and returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }` — never a thrown error and never a raw Postgres message.
- All market-hours and square-off logic computes in `Asia/Kolkata` regardless of server timezone; no TypeScript calls `new Date()` for market logic without going through `src/lib/market/market-hours.ts`.
- **Session logic is implemented exactly twice, and the two are proven equal.** `_shared/market-hours.ts` serves the app and the Edge Function; `public.market_state(at)` serves `place_order`, which must reject a MARKET order outside the session and is granted to `authenticated` — a check living only in a Server Action is bypassed by anything calling the RPC directly. `tests/parity/market.parity.test.ts` drives both over every session boundary and every minute of a trading day. **A third implementation is not permitted**, and neither of these two may change without the other. (F24)
- No MIS position survives the first `market-tick` run at or after 15:20 IST on the day it was opened. The job runs once a minute, so the gap between 15:20:00 and that run is expected, not a violation.
- A CNC sell is rejected unless the user holds at least that quantity; short selling is permitted only in MIS.
- `src/types/database.ts` is generated by the Supabase CLI and is never hand-edited.
- Upstream quote responses are parsed through a Zod schema before use; a shape change degrades to the next provider rather than crashing the job.
- No module outside `src/lib/supabase/` calls `createServerClient` or `createBrowserClient`.
- Modules under `src/lib/trading/` and `src/lib/market/` import nothing from `src/app/` or `src/components/` and perform no I/O except through an injected client.
- The codebase contains no payment SDK, no real broker API client, and no code path that moves real money.
