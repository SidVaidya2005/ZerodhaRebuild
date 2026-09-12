# Code Standards

> **Role:** The rules every change must follow — language, framework, naming, error handling, dependencies.
> **Read before writing code**; obey on every change.
> **Relates to:** derives from the stack in `architecture.md`.
>
> **This file is the always-read core** — the rules that apply to every change. Two reference files
> hold the worked patterns, read only when the work reaches them:
> `code-standards/boundary-patterns.md` when writing a Server Action, a Postgres function or the Edge
> Function, and `code-standards/testing.md` when writing or debugging a test in any tier.

Implementation rules and conventions for the entire project. The AI agent must
follow these in every session without exception. These rules prevent pattern
drift across sessions.

---

## TypeScript

- `strict: true`, plus `noUncheckedIndexedAccess` and `noImplicitOverride`. Never relax a compiler flag to make an error go away.
- `any` is banned. Use `unknown` at boundaries and narrow with Zod. A genuinely unavoidable `any` needs an inline comment explaining why.
- No non-null assertions (`!`) on values that could actually be null. The exception is `process.env.X!` for variables validated at startup in `src/lib/env.ts` or `src/lib/env.server.ts`.
- Type external data, never trust it: every upstream HTTP response and every Server Action input is parsed by a Zod schema before use.
- Prefer `type` aliases for domain shapes; use `interface` only when declaration merging is needed.
- Discriminated unions over optional-field grab bags — `ActionResult<T>` is the canonical example.
- `async`/`await` only; no raw `.then()` chains.
- Money is `number` in TypeScript **for display only**. Never add, multiply, or compare monetary values in TypeScript to produce a stored result — that arithmetic belongs in Postgres.
- Exported functions that cross a module boundary carry explicit return types.
- Prefer `readonly` arrays and `as const` for fixed lookup tables.

---

## Next.js 16 Conventions

- App Router only. No `pages/` directory.
- Server Components are the default. Add `'use client'` only when the component needs state, effects, browser APIs, or the Zustand quote store — and push it as far down the tree as possible.
- Route groups carry the layout split: `(marketing)` for public pages, `(terminal)` for authenticated ones. A page belongs to exactly one group.
- Data for a page is fetched in that page's Server Component. Client Components receive data through props and never fetch their own initial state.
- **All mutations go through Server Actions in `src/server/actions/`.** Route handlers exist only for `/auth/callback`, `/api/health`, and `/reports/export` — the last being a *read that produces a file*, which the mutation rule does not govern and which a Server Action could only serve through a client-side Blob, losing the native download and no-JS operation (F34).
- **Exactly two exceptions, and no others may be added without updating this list:**
  1. **Supabase Auth SDK calls from the browser** — `signInWithOAuth`, `signOut`. These are the auth provider's own client flow; routing them through a Server Action would break the OAuth redirect.
  2. **`touch_symbol_demand(symbols[])`** — the client RPC that marks which symbols are on screen. It takes no user-supplied state beyond a symbol list, derives the caller from `auth.uid()`, upserts `last_requested_at` only, and is called at most once per subscription change (not per tick). It exists as an RPC because it fires on every watchlist render and a Server Action round trip would be wasteful for a write that touches no user-owned data.
- Both exceptions read the session from cookies and write nothing a user could exploit. Anything touching `funds`, `orders`, `trades`, `holdings`, `positions` or `watchlist_items` goes through a Server Action, always.
- The middleware file is `src/proxy.ts` and its export is named `proxy` — Next.js 16 renamed `middleware.ts` to `proxy.ts`. It runs on the Node.js runtime; the edge runtime is unavailable there.
- `cookies()`, `headers()`, `params`, and `searchParams` are async — always `await` them.
- Call `revalidatePath` for every route whose data a Server Action changed; list them explicitly rather than revalidating the layout.
- Terminal pages are dynamic by default because they read the session. Marketing pages must stay statically renderable — never read `cookies()` in `(marketing)`.
- Use `next/image` for all raster images and `next/font` for fonts. No `<img>` tags, no external font CDN links.
- Every route segment that fetches data has a sibling `loading.tsx`; every terminal segment has an `error.tsx`. True since F36: nine `loading.tsx` (the eight terminal segments plus a `(terminal)` group fallback, so a segment added later still streams something) and eight `error.tsx`. Marketing pages are statically rendered and fetch nothing, so they have neither. **A boundary's action is `retry`, never `reset`** — see Error Handling. (Phase 5 checkpoint, met at F36)

---

## File and Folder Naming

- Folders: `kebab-case` (`order-ticket/`, `quote-service/`).
- React components: `PascalCase.tsx`, one component per file, named the same as the file (`WatchlistRow.tsx` exports `WatchlistRow`).
- Non-component TypeScript: `kebab-case.ts` (`quote-service.ts`, `market-hours.ts`).
- Server Action modules: `kebab-case.ts` under `src/server/actions/`, named for the domain noun (`orders.ts`, not `order-actions.ts`).
- Next.js special files keep their reserved lowercase names: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`, `proxy.ts`.
- Tests sit beside their subject as `<name>.test.ts` (`charges.test.ts` next to `charges.ts`).
- Migrations: `supabase/migrations/<timestamp>_<snake_case_description>.sql`.
- Postgres identifiers are `snake_case`; TypeScript is `camelCase`. Convert at the boundary — never introduce snake_case into React props.
- No barrel `index.ts` files except inside `src/components/ui/`.

---

## Module / Component Structure

```tsx
// src/components/terminal/WatchlistRow.tsx
'use client'

import { useMemo } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useQuoteStore } from '@/lib/stores/quote-store'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Instrument } from '@/types/domain'

type WatchlistRowProps = {
  instrument: Instrument
  onTrade: (symbol: string, side: 'BUY' | 'SELL') => void
}

export function WatchlistRow({ instrument, onTrade }: WatchlistRowProps) {
  const quote = useQuoteStore((state) => state.quotes[instrument.symbol])

  const change = useMemo(() => {
    if (!quote?.prevClose) return null
    return ((quote.ltp - quote.prevClose) / quote.prevClose) * 100
  }, [quote])

  if (!quote) return <RowSkeleton symbol={instrument.symbol} />

  return (
    <div className="group flex items-center justify-between px-3 py-1.5 text-xs">
      {/* … */}
    </div>
  )
}
```

- Import order, separated by blank lines: React and Next → third-party packages → `@/` internal modules → types (`import type`).
- Props types are declared directly above the component and named `<ComponentName>Props`.
- Named exports only. No default exports except where Next.js requires them (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `global-error.tsx`, `not-found.tsx`).
- `'use client'` is the first line of the file when present, before any import.
- Early-return for loading and empty states rather than nesting the whole body in a conditional.
- Small private helpers (`RowSkeleton` above) may live at the bottom of the same file; anything reused elsewhere moves to its own file.

---

## Error Handling

- Log with a bracketed module tag: `console.error('[orders.placeOrder]', error)`. Never bare `console.log` in committed code.
- Users see mapped copy, never raw database text. `rejection_reason` codes and `ActionResult.error.code` are the mapping keys.
- Never expose a Postgres error message, stack trace, connection string, or key in a UI string or an HTTP response body.
- Failures in the quote pipeline degrade rather than throw: a dead provider trips its circuit and the chain falls through to the simulator.
- Client Components surface action failures through a toast; they never render `error.message` from an unknown source.
- Every terminal route segment has an `error.tsx` boundary with a retry affordance. Each is a thin `'use client'` wrapper over `TerminalErrorBoundary`, which keeps the terminal chrome — the shell still works, one segment beneath it does not. The root boundary renders no chrome, for the opposite reason.
- **A boundary calls `retry()`, not `reset()`.** Next.js passes `error`, `reset` and `retry`; `reset` only resets the boundary and re-renders the payload it already has, while `retry` calls `router.refresh()` first. Every read failure in this app is server-side, so `reset` alone ships a button that visibly does nothing. (F36)
- **A failed page read is logged and then thrown**, through `throwOnReadError` — never logged and swallowed. A read that falls through to the empty state makes a broken query and an empty account render identically. The one exception is PostgREST's `PGRST103`, an offset past the end of a set, which the helper excludes so a stale bookmark reaches the table's own past-the-end branch rather than a boundary. (F36)

---

## Environment Variables

Never hardcode a key, URL, project reference, or secret. Everything below is read through
two modules, both validating with Zod and both failing loudly at startup if a value is missing.

- **`src/lib/env.ts`** holds the three `NEXT_PUBLIC_*` variables. Next.js inlines them into the browser bundle, so this module is safe to import from anywhere. It names each key explicitly rather than spreading `process.env`, because Next substitutes only literal member accesses.
- **`src/lib/env.server.ts`** holds `SUPABASE_SERVICE_ROLE_KEY` and the two optional secrets, and carries `import 'server-only'`. A Client Component that imports it fails the **build** rather than throwing at runtime — the same guard `admin.ts` carries, applied one level earlier so the service-role key cannot be reached from the browser at all.

Validation is forced at boot by `register()` in `src/instrumentation.ts`. Next.js runs that once per server instance before the first request and skips it during `next build`, so a missing variable breaks `dev` and `start` by name while `build` stays green on a machine holding no secrets.

| Variable | Used In | Secret? |
| -------- | ------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser, server, and proxy Supabase clients | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser, server, and proxy Supabase clients | No |
| `NEXT_PUBLIC_SITE_URL` | OAuth redirect target for `/auth/callback` | No |
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/admin.ts` and the `market-tick` Edge Function | **Yes** |
| `TWELVE_DATA_API_KEY` | Optional second quote provider; the chain skips it when unset | **Yes** |
| `TEST_DATABASE_URL` | Tiers 2 and 3. The project's connection string, on the **session-mode** pooler (port 5432) — tier 3 holds a transaction open across statements, which transaction-mode pooling cannot express | **Yes** |
| `ALLOW_RACE_TESTS` | Set to run tier 3. Unset, `pnpm test:race` exits without touching the database | No |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically inside Edge Functions and
must not be added to `supabase/functions/.env`. `.env.example` lists every variable with a dummy
value and is committed; `.env.local` is not.

---

## Import Conventions

- Import internal modules through the `@/` alias (`@/lib/trading/charges`). Relative imports are allowed only within the same folder (`./RowSkeleton`).
- Never use `../../` — two or more levels up means the module belongs somewhere else.
- Type-only imports use `import type`.
- Fixed values — `OPENING_BALANCE`, `SQUARE_OFF_TIME_IST`, `MARKET_OPEN_IST`, `SHORT_MARGIN_BUFFER`, `MAX_SYMBOLS_PER_TICK`, `QUOTE_STALE_AFTER_MS`, `QUOTE_LIVE_WINDOW_MS`, `QUOTE_DELAYED_WINDOW_MS`, `CANDLE_TTL_MS`, `CANDLE_RETENTION`, and every charge rate — are imported by app code from `src/lib/constants.ts`. Never inline a magic number for any of them. The market, quote and simulator values among them are *defined* in `_shared/market-constants.ts` and re-exported by `constants.ts`, because the Edge Function needs the same numbers and cannot resolve the `@/` alias; that is a change of definition site, not of the rule.
- Two quote-age thresholds exist and are **not** interchangeable: `QUOTE_STALE_AFTER_MS` decides whether an order may fill against a quote (`trading-contract.md` §5), while `QUOTE_LIVE_WINDOW_MS` / `QUOTE_DELAYED_WINDOW_MS` decide which badge a price displays. Using one where the other belongs either rejects fillable orders or fills stale ones.
- Edge Functions use `jsr:` / `npm:` specifiers with pinned versions and **cannot import from `src/`**. Shared logic therefore lives in `supabase/functions/_shared/` and is imported *out of there by both runtimes* — by Deno on a relative path, by the app through the `@shared/*` alias declared in `tsconfig.json` and mirrored in `vitest.config.mts`. **One copy, not two kept in step by hand**: the session logic the tick gates on is the identical module tier 1 exercises, so there is nothing to drift and no drift test to write. Specifiers into `_shared` carry an explicit `.ts` because Deno requires it; `allowImportingTsExtensions` is what lets one spelling serve both.
- **Only the Edge Function entrypoint sits outside `tsc`.** `tsconfig.json` excludes `supabase/functions/market-tick`, which uses `jsr:` specifiers and the `Deno` global that this compiler cannot resolve; Deno typechecks it on `functions deploy`. `_shared/` stays inside the program and must typecheck under the same rules as `src/`.

---

## Comments

- Comment the *why*, never the *what*. `// Lock the funds row so concurrent orders serialise` earns its place; `// set the price` does not.
- Every non-obvious financial rule cites its source in a comment — charge rates, the 15:20 square-off time, the T+1 settlement simplification.
- Any deliberate deviation from a rule in this file carries a comment saying which rule and why.
- `TODO:` comments must name what is undecided and stay resolvable. No `FIXME`, no commented-out code — git history holds it.

---

## Dependencies

Before installing anything new, check:

1. Whether the stack already covers it — Radix ships with shadcn/ui, Zod covers validation, Supabase covers auth, storage, realtime and scheduling.
2. Whether it is needed on the client. A dependency that ships to the browser must justify its bundle cost; a server-only one is cheaper.
3. Whether it is actively maintained, typed, and compatible with React 19 and Next.js 16.
4. Whether it is listed below. If not, add it here in the same commit that installs it.

Approved dependencies for this project:

- `next` — framework
- `react`, `react-dom` — UI runtime
- `typescript` — language
- `tailwindcss`, `@tailwindcss/postcss`, `postcss` — styling
- `class-variance-authority`, `clsx`, `tailwind-merge` — shadcn/ui's styling utilities
- `radix-ui` — the unified Radix primitives package. The shadcn CLI moved from per-component `@radix-ui/*` packages to this single one; `shadcn init -b radix` is what selects Radix over Base UI or React Aria (F02)
- `shadcn` — **a runtime dependency, not just the CLI.** It ships `shadcn/tailwind.css`, which `globals.css` imports for the scroll-fade, shimmer and no-scrollbar utilities its components rely on (F02)
- `tw-animate-css` — animation utilities the shadcn dialog, dropdown and command components depend on; added by `shadcn init` (F02)
- `cmdk` — the command-palette primitive behind `components/ui/command.tsx`, used for stock search (F02)
- `lucide-react` — icons
- `@supabase/supabase-js`, `@supabase/ssr` — database, auth, realtime
- `zod` — validation
- `zustand` — client-side live quote store
- `react-hook-form`, `@hookform/resolvers` — the order ticket (F25). **Not the support form**: that uses React 19's form action and `useActionState`, so it submits and validates without JavaScript, which react-hook-form cannot do (F07B)
- `recharts` — holdings donut and P&L charts
- `lightweight-charts` — candlestick price chart
- `next-themes` — light/dark theme persistence
- `sonner` — toasts
- `server-only` — build-time guard on server modules
- `vitest` — tier 1 and tier 3 test runner
- `lighthouse` — accessibility auditing via `pnpm audit:a11y`; F04's verify commits to a score above 90 and F38's accessibility pass needs the same tooling, so it lands in Phase 1 and every public page is audited as it ships (F04)
- `pg`, `@types/pg` — direct Postgres connections for tier 3 concurrency tests **and for the tier-2 pgTAP runner**, since `supabase test db` requires Docker even against a remote database (F09). Never imported by application code
- `eslint`, `eslint-config-next`, `prettier`, `prettier-plugin-tailwindcss` — linting and formatting
- `supabase` (CLI, dev dependency) — migrations, type generation, function deploys

Do not install any other packages without updating this list first.
