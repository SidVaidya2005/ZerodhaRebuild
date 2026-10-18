# Architecture — Data Model

> Read this part of `context/architecture.md` when changing the schema, writing a migration,
> or adding a file. It maps the folders and explains the tables and views. The core
> architecture's invariants take precedence over any conflicting description here.

## Folder Structure

Use this map to decide where a change belongs. Route files compose pages, shared libraries hold
reusable logic, and migrations define database structure. The test entries show how the suite
grew; use the next free number when adding a pgTAP file.

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
│   │   └── …                       → later suites include charges (F22), margin (F23), execution (F24)
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

## Data Model

Store money as rupees in `numeric(14,2)` columns and quantities as `integer`. Timestamps use
`timestamptz`: store UTC instants and display them in `Asia/Kolkata`. The tables below describe
what each row means; `trading-contract.md` defines the calculations that write them.

**Enums:** `order_side` (BUY, SELL) · `order_type` (MARKET, LIMIT) · `product_type` (CNC, MIS) ·
`order_status` (OPEN, COMPLETE, CANCELLED, REJECTED) · `quote_provider` (YAHOO, TWELVE_DATA, SIMULATOR) · `candle_interval` (FIVE_MIN, THIRTY_MIN, ONE_DAY) ·
`ledger_type` (SIGNUP_CREDIT, MARGIN_BLOCK, MARGIN_RELEASE, BUY_DEBIT, SELL_CREDIT, CHARGES, REALISED_PNL, SIMULATION_ADJUSTMENT)

### `profiles`

One row stores the signed-in user's public profile, generated client ID and saved theme.

| Column     | Type        | Notes                                                                                                                                                                                             |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id         | uuid PK     | References `auth.users(id)` on delete cascade                                                                                                                                                     |
| client_id  | text unique | Generated `ZR` + 6 digits. The trigger retries collisions; the unique constraint prevents duplicate IDs from being stored                                                                         |
| full_name  | text        | From the Google profile                                                                                                                                                                           |
| avatar_url | text        | From the Google profile                                                                                                                                                                           |
| theme      | text        | `light` or `dark`, enforced by `CHECK`; defaults to `dark`, matching `project-overview.md` and `theme-provider.tsx`'s `defaultTheme="dark"`. The earlier `light` description was corrected in F10 |
| created_at | timestamptz | Default `now()`                                                                                                                                                                                   |

### `instruments`

The seeded NSE universe is reference data shared by all users. Keep instruments used by past
trades even when they are no longer active for search.

| Column       | Type         | Notes                                                                                   |
| ------------ | ------------ | --------------------------------------------------------------------------------------- |
| symbol       | text PK      | NSE trading symbol, e.g. `RELIANCE`                                                     |
| name         | text         | `Reliance Industries Limited`                                                           |
| exchange     | text         | `NSE` for the whole seeded universe                                                     |
| sector       | text         | Used for grouping in Reports                                                            |
| yahoo_symbol | text         | Provider mapping such as `RELIANCE.NS`; verify it rather than assuming the suffix works |
| tick_size    | numeric(6,2) | Default 0.05                                                                            |
| is_active    | boolean      | Excludes delisted names from search without deleting history                            |

### `quotes`

One row per symbol stores its latest server price and the facts needed to explain its origin.
The table holds current state, not a history of ticks.

| Column                        | Type           | Notes                                                                                               |
| ----------------------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| symbol                        | text PK        | References `instruments(symbol)`                                                                    |
| ltp                           | numeric(14,2)  | Last traded price                                                                                   |
| prev_close                    | numeric(14,2)  | Basis for day change                                                                                |
| day_open / day_high / day_low | numeric(14,2)  | Nullable outside market hours                                                                       |
| volume                        | bigint         | Nullable                                                                                            |
| provider                      | quote_provider | Which provider produced this figure                                                                 |
| provider_ts                   | timestamptz    | The provider's own timestamp for the price (Yahoo's `regularMarketTime`). Null only for `SIMULATOR` |
| fetched_at                    | timestamptz    | When we retrieved it                                                                                |
| updated_at                    | timestamptz    | When this row last changed; Realtime fires on change                                                |

Do not store a `source` column. A price can become stale simply because time passes, without any
row changing. Derive its badge at read time from `provider` and `provider_ts`, using the Quote
Provenance rules in `architecture.md`. A stored "LIVE" flag would become wrong as the row aged.

### `candles`

These rows cache the stock chart's OHLC series: the open, high, low and close for each interval.
Only the server candle fetcher writes them; browsers never do.

| Column                    | Type            | Notes                                  |
| ------------------------- | --------------- | -------------------------------------- |
| symbol                    | text            | Composite PK `(symbol, interval, ts)`  |
| interval                  | candle_interval | `FIVE_MIN`, `THIRTY_MIN`, or `ONE_DAY` |
| ts                        | timestamptz     | Candle open time                       |
| open / high / low / close | numeric(14,2)   |                                        |
| volume                    | bigint          | Nullable                               |

The chart's four ranges use three stored intervals: 1D uses `FIVE_MIN`, 1W uses `THIRTY_MIN`, and
1M and 1Y both use `ONE_DAY`. The last two select different windows from the same daily series,
so one year of daily candles can serve both.

### `candle_sync`

One row per symbol and interval records when that candle cache was refreshed and which provider
produced it. Cache age comes from this stored time.

| Column     | Type            | Notes                                             |
| ---------- | --------------- | ------------------------------------------------- |
| symbol     | text            | Composite PK `(symbol, interval)`                 |
| interval   | candle_interval |                                                   |
| fetched_at | timestamptz     | Drives the per-interval TTL                       |
| provider   | quote_provider  | Provenance for the chart, same contract as quotes |

Refresh intervals come from `constants.ts`. During a session, `FIVE_MIN` refreshes every 5 minutes
and `THIRTY_MIN` every 30 minutes. `FIVE_MIN` does not refresh outside a session. `ONE_DAY` refreshes
once per trading day after close.

Retention keeps the current trading day for `FIVE_MIN`, five trading days for `THIRTY_MIN`, and
400 days for `ONE_DAY`. `prune_candles()` runs daily on its own `pg_cron` schedule, separate from
`market-tick`. (F33)

### `symbol_demand`

This table records interest in symbols so the tick can prioritise refreshes. It is shared demand
metadata rather than a user's portfolio.

| Column            | Type        | Notes                                                          |
| ----------------- | ----------- | -------------------------------------------------------------- |
| symbol            | text PK     | References `instruments(symbol)`                               |
| last_requested_at | timestamptz | Updated when a client subscribes; drives demand-driven refresh |
| priority          | smallint    | Higher for symbols in holdings, positions, or open orders      |

### `funds`

One row per user holds spendable cash and reserved margin. These balances are maintained by
Postgres money functions and must reconcile with orders, positions and the ledger.

| Column          | Type          | Notes                                                                                                                  |
| --------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| user_id         | uuid PK       | References `profiles(id)`                                                                                              |
| available_cash  | numeric(14,2) | `CHECK (available_cash >= 0)`                                                                                          |
| used_margin     | numeric(14,2) | Must equal `Σ orders.blocked_margin` over `OPEN` orders plus `Σ positions.blocked_margin`; do not set it independently |
| opening_balance | numeric(14,2) | 100000.00 at signup and after reset                                                                                    |
| updated_at      | timestamptz   |                                                                                                                        |

### `fund_ledger`

Each row records one movement of available cash. Its sign shows a debit or credit, and
`balance_after` records the balance immediately after that movement.

| Column        | Type          | Notes                                           |
| ------------- | ------------- | ----------------------------------------------- |
| id            | uuid PK       |                                                 |
| user_id       | uuid          | Indexed with `created_at` for the Funds page    |
| type          | ledger_type   |                                                 |
| amount        | numeric(14,2) | Signed: negative for debits                     |
| balance_after | numeric(14,2) | Makes the ledger auditable without replaying it |
| order_id      | uuid          | Nullable reference to `orders(id)`              |
| note          | text          | Human-readable description                      |
| created_at    | timestamptz   |                                                 |

### `orders`

An order records the user's instruction and its lifecycle. An open order may hold a reservation;
once it completes, is cancelled, or is rejected, that order can hold no margin.

| Column                  | Type          | Notes                                                                                                                               |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| id                      | uuid PK       |                                                                                                                                     |
| user_id                 | uuid          | Indexed with `placed_at`                                                                                                            |
| symbol                  | text          | References `instruments(symbol)`                                                                                                    |
| side                    | order_side    |                                                                                                                                     |
| order_type              | order_type    |                                                                                                                                     |
| product                 | product_type  |                                                                                                                                     |
| quantity                | integer       | `CHECK (quantity > 0)`                                                                                                              |
| limit_price             | numeric(14,2) | Required when `order_type = LIMIT`, else null                                                                                       |
| filled_quantity         | integer       | 0 until filled; this build fills all-or-nothing                                                                                     |
| average_price           | numeric(14,2) | Null until filled                                                                                                                   |
| status                  | order_status  |                                                                                                                                     |
| blocked_margin          | numeric(14,2) | Reserved at placement. `release_margin` or `transfer_margin_to_position` retires it before the order leaves `OPEN`; it is then zero |
| rejection_reason        | text          | e.g. `INSUFFICIENT_FUNDS`, `NO_HOLDING`, `MARKET_CLOSED`                                                                            |
| placed_at / executed_at | timestamptz   |                                                                                                                                     |

### `trades`

A trade records an executed fill, including the price, charges and reported realised P&L.
Opening a position creates a trade too, with realised P&L set to `0.00`.

| Column            | Type          | Notes                                                                   |
| ----------------- | ------------- | ----------------------------------------------------------------------- |
| id                | uuid PK       |                                                                         |
| user_id           | uuid          |                                                                         |
| order_id          | uuid          | References `orders(id)`                                                 |
| symbol            | text          |                                                                         |
| side              | order_side    |                                                                         |
| product           | product_type  |                                                                         |
| quantity          | integer       |                                                                         |
| price             | numeric(14,2) | Execution price                                                         |
| charges           | numeric(14,2) | Total of the charge breakdown                                           |
| charge_breakdown  | jsonb         | Brokerage, STT, exchange, SEBI, stamp duty, GST, DP                     |
| realised_pnl      | numeric(14,2) | Net of closing-leg charges; `0.00` on opening legs, never null          |
| is_auto_squareoff | boolean       | True when written by the 15:20 square-off job rather than a user action |
| traded_at         | timestamptz   |                                                                         |

### `holdings`

Holdings are CNC shares that can remain across trading days. Quantities are always positive;
selling the final share deletes the row.

| Column        | Type          | Notes                                                                       |
| ------------- | ------------- | --------------------------------------------------------------------------- |
| user_id       | uuid          | Composite PK `(user_id, symbol)`                                            |
| symbol        | text          |                                                                             |
| quantity      | integer       | `CHECK (quantity > 0)` — a row that reaches zero is deleted, never retained |
| average_price | numeric(14,2) | Cost per share; recomputed on every buy with charges capitalised upward     |
| updated_at    | timestamptz   |                                                                             |

### `positions`

Positions are MIS exposure for the current trading day. A negative quantity is a short. Shorts
carry separate net and gross averages because reported P&L and collateral use different bases.

| Column                | Type          | Notes                                                                                                                                                                          |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| user_id               | uuid          | Composite PK `(user_id, symbol, product)`                                                                                                                                      |
| symbol                | text          |                                                                                                                                                                                |
| product               | product_type  | `MIS` in this build                                                                                                                                                            |
| net_quantity          | integer       | Negative for intraday shorts                                                                                                                                                   |
| average_price         | numeric(14,2) | Used for P&L: cost per share for longs, net proceeds per share for shorts. Charges raise the long average and lower the short average                                          |
| entry_reference_price | numeric(14,2) | Gross fill-price average weighted by quantity. Used for collateral and short-cover cash settlement, never reported P&L; null for longs                                         |
| realised_pnl          | numeric(14,2) | Accumulated on partial exits                                                                                                                                                   |
| blocked_margin        | numeric(14,2) | Collateral against an open short: `\|net_quantity\| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges`, recomputed on every change. Zero for longs |
| opened_at             | timestamptz   | Time of the original entry. Adding exposure keeps this time; square-off uses it                                                                                                |

### Portfolio views

These six `security_invoker` views give pages ready-to-render portfolio data. Three arrived in
F21, two in F31 and one in F32. They rely on the underlying tables' RLS; they add no separate user
security predicate. F18 made the same correction to `watchlist_rows`. The `where user_id = f.user_id`
clauses in `funds_overview` connect subqueries to their outer row; they do not replace RLS.

| View                          | Grain                | Notes                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portfolio_holdings`          | One row per holding  | Joins `holdings`, `instruments` and optional `quotes`. Missing prices leave a visible holding with null valuation. Includes `invested`, `market_value`, `unrealised_pnl`, `day_pnl` and the three provenance columns                                                                                                        |
| `portfolio_summary`           | One row per user     | Feeds dashboard tiles. Starts from `funds` so even a never-traded account has a row; `unpriced_count` exposes holdings missing from valuation sums                                                                                                                                                                          |
| `portfolio_positions`         | One row per position | Joins `positions`, `instruments` and optional `quotes`, retaining unpriced positions. One signed expression calculates `unrealised_pnl` for longs and shorts. Includes `realised_pnl`, `blocked_margin` and three provenance columns; excludes `entry_reference_price` to keep the §12.11 averages separate on screen (F31) |
| `portfolio_positions_summary` | One row per user     | Feeds the positions footer. Starts from `funds` so an account with no positions has a row; `unpriced_count` exposes missing valuations (F31)                                                                                                                                                                                |
| `funds_overview`              | One row per user     | Feeds Funds cards and the reset dialog's five counts. Uses only §9's closing-leg `realised_pnl`, so the page needs no quotes or price provenance (F32)                                                                                                                                                                      |
| `market_composite`            | One row              | Mean day change with equal weight for every priced active instrument, plus advances/declines and `universe_size`. This measures market breadth; it is not an index. Returns raw provenance inputs so freshness can be derived at read time                                                                                  |

### `watchlist_items`

One row connects a user to a watched symbol and stores its place in that user's list.

| Column     | Type     | Notes                            |
| ---------- | -------- | -------------------------------- |
| user_id    | uuid     | Composite PK `(user_id, symbol)` |
| symbol     | text     |                                  |
| sort_order | smallint | User-controlled ordering         |

### `market_holidays`

The published NSE holiday calendar supplements weekday and session-hour checks.

| Column       | Type    | Notes                                                               |
| ------------ | ------- | ------------------------------------------------------------------- |
| trading_date | date PK | A date NSE is closed; seeded annually from NSE's published calendar |
| description  | text    | e.g. `Republic Day`                                                 |

### `support_messages`

The public contact form writes these messages without requiring an account. They are not tied
to a user session.

| Column       | Type        | Notes                                     |
| ------------ | ----------- | ----------------------------------------- |
| id           | uuid PK     |                                           |
| name / email | text        | Not tied to a session; the form is public |
| category     | text        | Matches the Support page categories       |
| message      | text        |                                           |
| created_at   | timestamptz |                                           |

---
