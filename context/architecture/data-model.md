# Architecture — Data Model

> **Reference half of `context/architecture.md`.** The invariants, stack, boundaries and auth
> rules live there and are read every session; this is looked up when the work reaches it.
> **Where this file and the invariants disagree, the invariants win.**

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

Five `security_invoker` views — three added in F21, two by F31. None carries a predicate of its own —
RLS on the underlying table is the boundary, reached through `security_invoker`, which is the
correction F18 made to `watchlist_rows`.

| View | Grain | Notes |
| ---- | ----- | ----- |
| `portfolio_holdings` | One row per holding | `holdings` ⋈ `instruments` ⋈ `quotes`, left-joined on quotes so an unpriced holding still appears with null valuation. Carries `invested`, `market_value`, `unrealised_pnl`, `day_pnl` and the three provenance columns |
| `portfolio_summary` | One row per user | The dashboard tiles. Driven from `funds` so a never-traded account still produces a row. `unpriced_count` is what stops the sums silently omitting an unpriced holding |
| `portfolio_positions` | One row per position | `positions` ⋈ `instruments` ⋈ `quotes`, left-joined on quotes so an unpriced position still appears. Carries `unrealised_pnl` as one signed expression covering both directions, plus `realised_pnl`, `blocked_margin` and the three provenance columns. **Excludes `entry_reference_price`**, so §12.11's two averages cannot be crossed on screen (F31) |
| `portfolio_positions_summary` | One row per user | The positions footer. Driven from `funds` so an account holding none still produces a row; `unpriced_count` stops the sums silently omitting one (F31) |
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

