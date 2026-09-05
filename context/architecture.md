# Architecture

> **Role:** How the system is built — stack, structure, boundaries, data, and the invariants that must never be violated.
> **Read after** `project-overview.md`, before writing any code.
> **Relates to:** the stack here drives `code-standards.md` and `library-docs.md`.
>
> **This file is the always-read core** — stack, boundaries, provenance, auth, and the invariants.
> Two reference files hold the rest, read only when the work reaches them:
> `architecture/data-model.md` (folder structure, every table and view) when touching the schema or
> adding files, and `architecture/patterns.md` (data-flow diagrams, golden code patterns) when
> writing a Server Action, a Postgres function, a Supabase client, a subscription, or the tick.

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

## Invariants

- Every table containing a `user_id` has RLS enabled, scoped to `auth.uid() = user_id`. On `profiles` and `watchlist_items` that means owner-scoped policies for the commands the app actually issues; on the six money tables it means **`select` is the only grant any client role holds**, with no write policy for any command — every write there arrives through a `security definer` function (F11).
- No money value is ever computed in TypeScript; every balance, average price, charge total and realised P&L is calculated in Postgres `numeric` arithmetic and read back.
- Order fills happen only inside the `execute_order` Postgres function — never in a Server Action, route handler, Edge Function, or client component.
- `execute_order` takes `SELECT ... FOR UPDATE` on the user's `funds` row before reading `available_cash`, so concurrent orders cannot both pass the margin check.
- `available_cash` never goes negative; the column carries a `CHECK (available_cash >= 0)` constraint as the last line of defence.
- **Row locks are taken in one order everywhere: `orders` → `funds` → `holdings`/`positions`.** `execute_order` establishes it, and any function that takes those rows and may run concurrently with it takes them in that sequence — a guard added under a row lock is also a change to lock order. `transfer_margin_to_position` and `recompute_position_collateral` invert the last pair and are safe **only** because `execute_order` holds both rows before calling them; a caller that does not hold the funds row first reintroduces a deadlock. `supabase/tests/15-lock-order.sql` reads the sequence back out of each live definition and pins it. (F29)
- `execute_order` re-reads and re-checks `status = 'OPEN'` after taking the order row lock, and returns without writing if it is not — the lock alone does not prevent a double fill.
- `funds.used_margin` always equals `Σ orders.blocked_margin` over that user's `OPEN` orders plus `Σ positions.blocked_margin`; any code path that changes one changes the other in the same transaction.
- Every `orders` row not in status `OPEN` has `blocked_margin = 0`. Exactly three functions write that column and no other code path may: `reserve_margin` sets it, and `release_margin` and `transfer_margin_to_position` zero it.
- Margin is reserved at placement and retired exactly once. Cancellations, rejections and cash-consuming fills retire it through `release_margin(order_id)`; a fill that opens a short retires it through `transfer_margin_to_position(order_id, fill_price, actual_charges)`, which moves the collateral to the position and releases only the remainder. The transfer runs **before** the trade and position rows are written, so its `ok = false` shortfall path has nothing to unwind.
- **`modify_order` is the one path that reserves more than once for the same order**, and it writes `blocked_margin` through no route of its own: it calls `release_margin` and then `reserve_margin`, in a subtransaction that rolls the pair back together if the new terms cannot be covered. The order stays `OPEN` throughout, so nothing is retired and the "exactly once" rule above is untouched — a re-reservation is not a retirement.
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
