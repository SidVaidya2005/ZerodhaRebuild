# Architecture

> Role: The stack, responsibilities, data sources, sign-in and rules the system must always satisfy.
> Read after `project-overview.md`, before writing code.
> Relates to: the stack here sets the requirements for `code-standards.md` and `library-docs.md`.
>
> Read this core file every session. Open `architecture/data-model.md` for folder structure, tables
> and views when changing the schema or adding files. Open `architecture/patterns.md` for data flows
> and required examples when writing a Server Action, Postgres function, Supabase client, subscription
> or market tick. These reference files are read only when the work needs them.

## Stack

Server Components render on the server; Client Components run interactive behaviour in the browser.
Server Actions are server functions that handle form submissions and other application changes.
An Edge Function is hosted server code run separately from Next.js.

| Layer               | Tool                                                     | Purpose                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | Next.js 16.3.1 (App Router)                              | Marketing pages, terminal routes, Server Actions, route handlers                                                                                                                                                                                                                                                                                                          |
| UI runtime          | React 19.2.8                                             | Server Components by default; Client Components for live price surfaces                                                                                                                                                                                                                                                                                                   |
| Language            | TypeScript 6.0.3, `strict`                               | All application and Edge Function code. Keep below 7.x: `typescript-eslint` cannot load the TS 7 API, so `pnpm lint` fails (F01)                                                                                                                                                                                                                                          |
| Styling             | Tailwind CSS 4.3.3 + `@tailwindcss/postcss`              | CSS-first theming via `@theme`; design tokens derived from `context/DESIGN.md`                                                                                                                                                                                                                                                                                            |
| Type                | Inter + IBM Plex Sans via `next/font`                    | Reading text and equal-width digits; substitutes named in `DESIGN.md`                                                                                                                                                                                                                                                                                                     |
| Components          | shadcn/ui (Radix) + `lucide-react` 1.33.0                | Dialogs (order ticket), tabs, dropdowns, toasts, command palette (search)                                                                                                                                                                                                                                                                                                 |
| Database            | Supabase Postgres (hosted)                               | All persistent state; source of truth for every money calculation                                                                                                                                                                                                                                                                                                         |
| Auth                | Supabase Auth — Google OAuth, via `@supabase/ssr` 0.12.4 | Session cookies, route protection in `src/proxy.ts`                                                                                                                                                                                                                                                                                                                       |
| Client SDK          | `@supabase/supabase-js` 2.112.3                          | Browser, server, proxy and admin clients                                                                                                                                                                                                                                                                                                                                  |
| Realtime            | Supabase Realtime (Postgres Changes)                     | Pushes `quotes` and `orders` row changes to subscribed clients                                                                                                                                                                                                                                                                                                            |
| Scheduled work      | Supabase `pg_cron` + `pg_net` → Edge Functions (Deno)    | Quote refresh, limit-order matching, MIS square-off                                                                                                                                                                                                                                                                                                                       |
| Client tick state   | Zustand 5.0.15                                           | In-memory live quote store and tick interpolation loop                                                                                                                                                                                                                                                                                                                    |
| Validation          | Zod 4.4.3                                                | Every Server Action input and every external API response                                                                                                                                                                                                                                                                                                                 |
| Theming             | `next-themes` 0.4.6                                      | Light and dark from one token set, persisted without a flash on load (F02)                                                                                                                                                                                                                                                                                                |
| Forms               | `react-hook-form` 7.85.0 + `@hookform/resolvers` 5.9.1   | Order ticket only. The support form uses React 19's form action + `useActionState`, so it submits without JavaScript (F07B)                                                                                                                                                                                                                                               |
| Portfolio charts    | Recharts 3.10.1                                          | Top-10 holdings donut, P&L breakdown                                                                                                                                                                                                                                                                                                                                      |
| Price charts        | `lightweight-charts` 5.2.1                               | Candlestick chart on stock detail                                                                                                                                                                                                                                                                                                                                         |
| Quote sources       | Built-in simulator, and nothing else                     | Every price displays `SIMULATED`. Live verification found no NSE symbols on Twelve Data's free plan (F14); Yahoo blocked this machine's IP during validation and is now out of scope. No keyless source proved usable. The provider chain, circuit breaker and rate limiter remain as extension points, but no external provider is connected (F14, F15, decided 6.00.05) |
| Tests — logic       | Vitest 4.1.11                                            | Charge estimator, provider chain, market-hours, parsers                                                                                                                                                                                                                                                                                                                   |
| Tests — database    | pgTAP, run by `scripts/run-pgtap.mts` over `pg`          | RLS, grants, constraints and function correctness. Do not use `supabase test db`: it needs Docker even with `--db-url` (F09)                                                                                                                                                                                                                                              |
| Tests — concurrency | `pg` 8.23.0, two live connections                        | Row-lock races the other tiers cannot express                                                                                                                                                                                                                                                                                                                             |
| Accessibility       | Lighthouse 13.4.1                                        | `pnpm audit:a11y <path>` — every public page audited as it ships, not once at the end (F04)                                                                                                                                                                                                                                                                               |
| Tooling             | pnpm 11, ESLint 9.39.5, Prettier 3.9.6                   | Install, lint and format. Keep below ESLint 10: `eslint-plugin-react` 7.37.5, the newest release checked in F01 and installed by `eslint-config-next`, crashes on ESLint 10's rule-context API (F01)                                                                                                                                                                      |
| Hosting             | Render (free web service) + hosted Supabase              | Deployment target                                                                                                                                                                                                                                                                                                                                                         |

Render's free tier has no scheduled jobs or background workers and stops the web service after
15 minutes without traffic. Supabase provides `pg_cron`, used here at a one-minute minimum
interval. Scheduled work therefore runs in Postgres and Edge Functions, so market ticks and limit
matching continue while Render sleeps. A circuit breaker temporarily stops requests to a failing
provider; a rate limiter caps request frequency. Both are retained for future provider work.

---

## System Boundaries

| Folder                            | Owns                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(marketing)/`            | Public, session-free pages. Must not import from `src/server/actions/orders.ts`, `lib/supabase/admin.ts`, or any terminal component.                                                                                                                                                                             |
| `src/app/(terminal)/`             | Authenticated page composition and data loading. Stored money calculations belong in Postgres; order-ticket estimates belong in the estimator, not page code. No direct upstream HTTP calls.                                                                                                                     |
| `src/components/ui/`              | shadcn primitives. Styling may change; component APIs must not. Contains no domain logic and no Supabase imports.                                                                                                                                                                                                |
| `src/components/terminal/`        | Trading UI. May read the Zustand quote store and call Server Actions. Must never query Supabase directly for user-owned tables.                                                                                                                                                                                  |
| `src/lib/supabase/`               | The only place Supabase clients are constructed. Nothing else in the codebase may call `createServerClient` or `createBrowserClient`.                                                                                                                                                                            |
| `src/lib/market/`                 | Upstream quote fetching, provider fallback, and market-hours logic. Pure and testable; imports nothing from `src/app/` or `src/components/`.                                                                                                                                                                     |
| `src/lib/trading/`                | Charge formulas and order input schemas. Pure functions only — no I/O, no Supabase, no `Date.now()` without an injected clock.                                                                                                                                                                                   |
| `src/server/actions/`             | Application changes requested by the browser. Modules use `'use server'`; business-data actions validate with Zod and return the standard result shape. Form and redirect action signatures follow `code-standards/boundary-patterns.md`. The only browser SDK/RPC exceptions are listed in `code-standards.md`. |
| `supabase/migrations/`            | Schema, RLS policies, triggers and `place_order` / `execute_order` / `reset_account`. All DDL (SQL that changes database structure) lives here.                                                                                                                                                                  |
| `supabase/functions/market-tick/` | The scheduled job. The only code permitted to write to `quotes`, and the only caller of `match_open_orders` and `square_off_mis`.                                                                                                                                                                                |
| `src/types/database.ts`           | Generated output. Never hand-edited; regenerate after every migration.                                                                                                                                                                                                                                           |

---

## Quote Provenance

Provenance means where a price came from and how old it is. Derive it when rendering each price;
a stored label would become inaccurate as the quote ages.

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

Every quote in this build displays `SIMULATED`. No external provider is connected, so `DELAYED`
is unreachable. `LIVE` requires a provider that streams ticks; none of the three providers qualifies.
Keep both labels available for future providers, but never label repeated HTTP polling (REST
requests made at intervals) as `LIVE`. Public copy says neither label is shown here (6.00.04).

`QUOTE_DELAYED_WINDOW_MS` is not exercised by the current build and remains an assumed threshold.
Measure any future provider's actual delay before relying on it.

### Interpolated values

The browser's `requestAnimationFrame` loop creates small price movements between server updates.
The anchor is the last price received from the server; intermediate values are synthetic. Apply
these rules:

- Use the anchor wherever a number informs a decision: the order ticket, confirmation, stock-detail header and every total on Funds, Holdings, Positions and Reports. Never use an interpolated value there.
- The watchlist and index strip may show interpolated motion as background market activity.
- Dashboard summary tiles are monetary totals. Recompute them from the anchor when a server tick arrives, never during the intermediate animation. F21 corrected the earlier description that had allowed interpolation here.
- Set `isInterpolated: true` for every interpolated figure. Its hover detail must show the actual anchor, provider and timestamp.
- The terminal shell badge summarizes the least reliable source among visible symbols. Each price must still expose its own provenance.

---

## Authentication

Client IDs use `ZR` plus six digits, giving one million possible IDs. A unique index prevents
duplicates. If generation collides with an existing ID, the signup bootstrap trigger retries up to
10 times, then raises `CLIENT_ID_EXHAUSTED` if all attempts collide. Handle that failure explicitly;
a collision must not silently break sign-in or cause an endless retry loop.

- Provider: Supabase Auth via `@supabase/ssr`
- Methods: Google OAuth only. No email/password, no magic links.
- Protected: everything under `src/app/(terminal)/` — `/dashboard`, `/orders`, `/holdings`, `/positions`, `/funds`, `/reports`, `/settings`, `/stocks/*`
- Public: `/`, `/about`, `/pricing`, `/support`, `/legal`, `/auth/*`, `/api/health`
- Session refresh and the route guard both live in `src/proxy.ts`. In Next.js 16 this file replaces `middleware.ts` and runs on the Node.js runtime; the edge runtime is not available there.
- Post-login destination is `/dashboard`, reached through `/auth/callback`.
- Postgres row-level security (RLS) enforces which rows a user may access. Application checks help the user navigate; they are not the security boundary.

---

## Invariants

An invariant is a rule that must remain true on every code path. For money,
`trading-contract.md` is authoritative; the rules below apply that contract to the system.

- Enable RLS on every table with a `user_id`, scoped to `auth.uid() = user_id`. For `profiles` and `watchlist_items`, allow only the owner's commands used by the app. On the six money tables, client roles have only the `select` grant and no write policies; all writes use a `security definer` function, which runs with its owner's database permissions. (F11)
- Compute every stored balance, average price, charge total and realised P&L in Postgres `numeric` arithmetic, then read it back. TypeScript may format values and show a clearly labelled order-ticket estimate; it must never supply a stored monetary result (`trading-contract.md` §1).
- Order fills happen only inside the `execute_order` Postgres function — never in a Server Action, route handler, Edge Function, or client component.
- Before reading `available_cash`, `execute_order` locks the user's `funds` row with `SELECT ... FOR UPDATE`. This makes simultaneous orders take turns at the margin check.
- `available_cash` never goes negative; the column carries a `CHECK (available_cash >= 0)` constraint as the last line of defence.
- Take row locks in this order: `orders` → `funds` → `holdings`/`positions`. Every function that may run alongside `execute_order` must follow that sequence, including when adding a check under a lock. `transfer_margin_to_position` and `recompute_position_collateral` reverse the last pair internally; they are safe only because `execute_order` already holds both locks. Other callers must lock funds first to avoid a deadlock, where transactions wait for each other's locks. `supabase/tests/15-lock-order.sql` checks the order in live function definitions. (F29)
- After locking the order row, `execute_order` must re-read and check `status = 'OPEN'`. Otherwise return without writing. A lock alone does not prevent a second fill.
- `funds.used_margin` always equals `Σ orders.blocked_margin` over that user's `OPEN` orders plus `Σ positions.blocked_margin`; any code path that changes one changes the other in the same statement block and transaction.
- Every order outside status `OPEN` has `blocked_margin = 0`. Only three functions may write this column: `reserve_margin` sets it; `release_margin` and `transfer_margin_to_position` set it to zero.
- Reserve margin when placing an order, then retire its reservation exactly once when it finishes. Cancellations, rejections and fills that consume cash use `release_margin(order_id)`. A fill opening a short uses `transfer_margin_to_position(order_id, fill_price, actual_charges)` to move collateral to the position and release the remainder. Run the transfer before writing trade and position rows, so `ok = false` on a shortfall leaves no such rows to undo.
- Only `modify_order` may reserve again for the same order. It never writes `blocked_margin` directly: it calls `release_margin`, then `reserve_margin`, in a subtransaction that undoes both if funds cannot cover the new terms. The order remains `OPEN`. Replacing a reservation is not retiring it; the final reservation must still be retired exactly once.
- Keep a short's collateral unavailable for spending while the position is open. `transfer_margin_to_position` writes no ledger row for that portion because `available_cash` does not change. A ledger row records an actual cash movement.
- For every open short, `positions.blocked_margin` equals `|net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges`, recomputed on every change to the position. The formula is written once, in `short_collateral_requirement()`; `transfer_margin_to_position` is the only path that increases it and `recompute_position_collateral` the only path that decreases it.
- Use `entry_reference_price` only for collateral and the short cover's gross cash settlement; never for reported P&L. Use `average_price` for reported P&L, never collateral. The cash-settlement exception is defined in `trading-contract.md` §7; mixing the averages produces incorrect collateral or double-counted charges.
- A cover or square-off that opens no new exposure always completes. If the loss exceeds collateral plus available cash, cap the cash debit, floor `available_cash` at zero and record the remainder as a `SIMULATION_ADJUSTMENT` ledger row. Never relax `CHECK (available_cash >= 0)` or leave such a position stranded. A fill that crosses zero also opens exposure; if that opening leg lacks collateral, reject the whole order as required by `trading-contract.md` §6.
- Include entry charges in `average_price`: add them to a long's cost and subtract them from a short's proceeds. The two directions require different formulas (`trading-contract.md` §8).
- Keep reported P&L separate from settled cash on a short cover. `trades.realised_pnl` uses net `average_price` (§9); the `REALISED_PNL` ledger row uses gross `entry_reference_price`. Short proceeds are not credited at entry, but entry charges are already debited. Using `average_price` for the cash row charges them twice and breaks reconciliation identity 1. (F24)
- A fill crossing zero (closing one direction and opening the other) writes one trade and one `CHARGES` row. Calculate charges once for the whole order. Apply the closing share to `trades.realised_pnl` and the remainder to the new position's `average_price`; together they must equal `trades.charges`. (F24)
- An MIS short cannot be opened without reserving margin for it, so a user with no cash cannot sell short.
- Before any quote write, order match or square-off, require `isTradingSession()` to confirm the NSE session is open. The `pg_cron` window saves quota; it does not establish market hours.
- The `quotes` table is written only by the `market-tick` Edge Function; no browser, Server Action, or page may insert or update it.
- The `candles` and `candle_sync` tables are written only by the candle fetcher on the server; no browser may insert or update them.
- Do not store quote freshness. Derive `source` from `provider` and `provider_ts` at read time using `deriveSource()`, with no other derivation path.
- `LIVE` is returned only for a provider flagged as genuinely streaming. No polled REST provider may ever be badged `LIVE`.
- Any price that influences a user decision — order ticket, confirmation, stock detail header, and every monetary total — renders the server anchor value, never an interpolated one.
- The service-role key is used only in `src/lib/supabase/admin.ts` and in Edge Functions, and `admin.ts` carries `import 'server-only'` at the top.
- Every `quotes` row has a non-null `provider` and `fetched_at`, and a non-null `provider_ts` unless the provider is `SIMULATOR`.
- Before database work, Server Actions validate business inputs with a Zod schema. Return `{ ok: true, data }` or `{ ok: false, error: { code, message } }`; never throw an expected action failure or return raw Postgres messages. Redirecting auth actions return no result; sign-in validates the submitted destination with `safeNext()`. Follow the explicit form/redirect exceptions in `code-standards/boundary-patterns.md` and the redirect rules in `library-docs.md`.
- Calculate all market hours and square-off times in `Asia/Kolkata`, regardless of server timezone. TypeScript market logic may call `new Date()` only through `src/lib/market/market-hours.ts`.
- Keep exactly two matching implementations of session logic: `_shared/market-hours.ts` for the app and Edge Function, and `public.market_state(at)` for `place_order`. Because `authenticated` may call the `place_order` RPC directly, Postgres must itself reject a MARKET order outside the session. `tests/parity/market.parity.test.ts` compares both implementations at every session boundary and every minute of a trading day. Do not add a third implementation or change one without the other. (F24)
- No MIS position survives the first `market-tick` run at or after 15:20 IST on the day it was opened. The job runs once a minute, so the gap between 15:20:00 and that run is expected, not a violation.
- A CNC sell is rejected unless the user holds at least that quantity; short selling is permitted only in MIS.
- `src/types/database.ts` is generated by the Supabase CLI and is never hand-edited.
- Validate upstream quote responses with a Zod schema before use. If the format changes, try the next provider rather than crashing the job.
- No module outside `src/lib/supabase/` calls `createServerClient` or `createBrowserClient`.
- Modules under `src/lib/trading/` and `src/lib/market/` must not import from `src/app/` or `src/components/`. Any input/output work (I/O), such as a network request, must use a client passed into the function rather than constructed inside it. The stricter pure-function rule for `src/lib/trading/` still applies.
- The codebase contains no payment SDK, no real broker API client, and no code path that moves real money.
