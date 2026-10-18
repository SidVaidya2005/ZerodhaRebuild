# Code Standards

> Role: Rules for TypeScript, Next.js, naming, errors, environment variables and dependencies.
> Read before writing code; apply to every change.
> Relates to: the stack and system boundaries in `architecture.md`.
>
> Read this core file every session. For worked examples, open `code-standards/boundary-patterns.md`
> when writing a Server Action, Postgres function or Edge Function. Open `code-standards/testing.md`
> when writing or debugging tests. Read those references only when the work needs them.

These rules apply to developers and AI agents throughout the project. Follow the same patterns
across features so later work does not introduce competing ways to solve the same problem.

---

## TypeScript

- Keep `strict: true`, `noUncheckedIndexedAccess` and `noImplicitOverride`. These compiler checks catch unsafe assumptions; fix the code instead of disabling a check.
- Do not use `any`, which bypasses type checks. Accept `unknown` for untrusted values, then validate with Zod before using them. An unavoidable `any` requires an inline explanation.
- Do not use a non-null assertion (`!`) to claim a possibly null value exists. The exception is `process.env.X!` for variables already validated at startup in `src/lib/env.ts` or `src/lib/env.server.ts`.
- Validate every upstream HTTP response and business-data Server Action input with a Zod schema, a definition of the fields and values allowed, before use. Auth actions follow the explicit redirect exceptions in `code-standards/boundary-patterns.md`.
- Use `type` aliases for business-data shapes. Use `interface` only when declaration merging is needed, so multiple declarations can extend the same type.
- Use discriminated unions, where a shared field selects one complete result shape, instead of many unrelated optional fields. Follow `ActionResult<T>`.
- `async`/`await` only; no raw `.then()` chains.
- Use TypeScript `number` for displaying money and clearly labelled order-ticket estimates. Never use TypeScript arithmetic or comparisons to produce a stored monetary result, including a stored estimate; Postgres owns that calculation (`trading-contract.md` §1).
- Declare explicit return types on functions exported for use by another module.
- Use `readonly` arrays and `as const` for fixed lookup tables so callers cannot accidentally change them.

---

## Next.js 16 Conventions

- App Router only. No `pages/` directory.
- Default to Server Components. Add `'use client'` only for state, effects, browser APIs or the Zustand quote store, and keep that boundary as close to the interactive component as possible.
- Use route groups to share layouts: `(marketing)` for public pages and `(terminal)` for signed-in pages. Each page belongs to exactly one group.
- Fetch a page's data in its Server Component. Pass it to Client Components through props; they must not fetch their own initial state.
- Send application mutations (requests that change data) through Server Actions in `src/server/actions/`, with only the two exceptions below. Route handlers are limited to `/auth/callback`, `/api/health` and `/reports/export`. The export is a read that returns a file; its route supports native downloads without JavaScript. A Server Action would need a browser-side Blob instead. (F34)
- Keep exactly these two permitted exceptions; update this list before adding another:
  1. Supabase Auth SDK calls from the browser — `signInWithOAuth`, `signOut` — are permitted because they manage the provider's session rather than application trading data. The current F12 flow starts sign-in and sign-out through Server Actions in `src/server/actions/auth.ts`, which support forms without JavaScript. Server Actions can perform OAuth redirects; follow the pattern in `library-docs.md`.
  2. `touch_symbol_demand(symbols[])` — a client RPC (remote procedure call) that marks visible symbols. It accepts only a symbol list, identifies the caller through `auth.uid()` and upserts only `last_requested_at`. Call it at most once per subscription change, never per tick. This demand update touches no user-owned data and avoids a Server Action round trip for each watchlist render.
- Both exceptions use the cookie session and may change only the auth session or symbol-demand timestamp described above. Any mutation of `funds`, `orders`, `trades`, `holdings`, `positions` or `watchlist_items` must go through a Server Action.
- Use `src/proxy.ts` with the named export `proxy`. Next.js 16 renamed `middleware.ts` to `proxy.ts`; it runs on Node.js, with no edge runtime option.
- `cookies()`, `headers()`, `params`, and `searchParams` are async — always `await` them.
- After a Server Action changes data, call `revalidatePath` for each affected route so it refreshes its server data. List those routes explicitly; do not revalidate the whole layout.
- Terminal pages render dynamically because they read the session. Keep marketing pages statically renderable at build time: never read `cookies()` in `(marketing)`.
- Use `next/image` for raster images (pixel-based formats such as PNG and JPEG) and `next/font` for fonts. Do not use `<img>` tags or external font CDN links.
- Give every data-fetching route segment a sibling `loading.tsx` and every terminal segment an `error.tsx`. F36 established nine loading files (eight terminal segments plus a `(terminal)` group fallback for future segments) and eight error files. Marketing pages fetch no data and render statically, so they need neither. Error boundaries call `retry`, never `reset`; see Error Handling. (Phase 5 checkpoint, met at F36)

---

## File and Folder Naming

- Folders: `kebab-case` (`order-ticket/`, `quote-service/`).
- React components: `PascalCase.tsx`, one component per file, named the same as the file (`WatchlistRow.tsx` exports `WatchlistRow`).
- Non-component TypeScript: `kebab-case.ts` (`quote-service.ts`, `market-hours.ts`).
- Server Action modules: `kebab-case.ts` under `src/server/actions/`, named for the domain noun (`orders.ts`, not `order-actions.ts`).
- Next.js special files keep their reserved lowercase names: `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts`, `proxy.ts`.
- Tests sit beside their subject as `<name>.test.ts` (`charges.test.ts` next to `charges.ts`).
- Migrations: `supabase/migrations/<timestamp>_<snake_case_description>.sql`.
- Use `snake_case` for Postgres identifiers and `camelCase` in TypeScript. Convert names when data crosses between them; do not put snake_case in React props.
- Do not create barrel `index.ts` files, which re-export other modules, except inside `src/components/ui/`.

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
- Return early for loading and empty states instead of wrapping the component's whole body in a conditional.
- Small helpers used only in the file, such as `RowSkeleton` above, may stay at its bottom. Move a helper to its own file when another module reuses it.

---

## Error Handling

- Log with a bracketed module tag: `console.error('[orders.placeOrder]', error)`. Never bare `console.log` in committed code.
- Map `rejection_reason` and `ActionResult.error.code` to user-facing messages. Never show raw database text.
- Never expose a Postgres error message, stack trace, connection string, or key in a UI string or an HTTP response body.
- If a quote provider fails, open its circuit breaker (temporarily stop requests) and try the next provider, ending with the simulator. Do not throw and stop the whole tick.
- Show action failures in a toast, a brief on-screen notification. Never render `error.message` from an unknown source.
- Give each terminal route segment an `error.tsx` with a retry control. Use a small `'use client'` wrapper around `TerminalErrorBoundary` so the header and navigation remain usable when a page fails. The root boundary shows no terminal shell because it also catches failures in that shell.
- Call `retry()` at an error boundary. Next.js supplies `error`, `reset` and `retry`; `reset` reuses the payload already held, while `retry` first calls `router.refresh()`. Because this app's failed reads happen on the server, `reset()` alone cannot fetch a successful replacement. (F36)
- Log a failed page read, then throw it through `throwOnReadError`. Do not continue to the empty state: that would make a broken query look like an empty account. The helper excludes PostgREST's `PGRST103` (a requested offset beyond the result set), so a stale pagination bookmark reaches the table's own past-the-end message. (F36)

---

## Environment Variables

Never hardcode a key, URL, project reference or secret. Read configuration through the two modules
below. Both validate with Zod and fail at startup if a required value is missing; optional values
remain optional.

- `src/lib/env.ts` holds the three `NEXT_PUBLIC_*` variables, which Next.js inserts into browser code at build time. This module is safe to import anywhere. Read each key explicitly: Next.js substitutes literal accesses such as `process.env.NEXT_PUBLIC_SITE_URL`, not a spread of `process.env`.
- `src/lib/env.server.ts` holds `SUPABASE_SERVICE_ROLE_KEY` and the two optional secrets. Its `import 'server-only'` makes a Client Component import fail the build, keeping the key out of the browser. `admin.ts` has the same guard.

`register()` in `src/instrumentation.ts` forces validation once per server instance, before the first
request. Next.js skips this during `next build`, so missing required variables fail `dev` and `start`
with the variable name, while `build` can run without secrets.

| Variable                               | Used In                                                                                                                                                                                            | Secret? |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Browser, server, and proxy Supabase clients                                                                                                                                                        | No      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser, server, and proxy Supabase clients                                                                                                                                                        | No      |
| `NEXT_PUBLIC_SITE_URL`                 | OAuth redirect target for `/auth/callback`                                                                                                                                                         | No      |
| `SUPABASE_SERVICE_ROLE_KEY`            | `src/lib/supabase/admin.ts` and the `market-tick` Edge Function                                                                                                                                    | Yes     |
| `TWELVE_DATA_API_KEY`                  | Legacy optional provider key; unused by the current simulator-only build. The retained provider skips when unset                                                                                   | Yes     |
| `TEST_DATABASE_URL`                    | Tiers 2–4. The project connection string must use the session-mode pooler (port 5432), which keeps tier 3's multi-statement transaction on one connection; transaction-mode pooling cannot do that | Yes     |
| `ALLOW_RACE_TESTS`                     | Set to run tier 3. Unset, `pnpm test:race` exits without touching the database                                                                                                                     | No      |

`/api/health` deliberately reads `RENDER_GIT_COMMIT` directly from `process.env`, with `?? null`
when absent. Render supplies this non-secret value; developer machines do not have it. Requiring it
would break `pnpm dev` just to display a commit hash. The route documents the exception. All other
variables go through `env.ts` or `env.server.ts`. (F39)

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically inside Edge Functions and
must not be added to `supabase/functions/.env`. `.env.example` lists every variable with a dummy
value and is committed; `.env.local` is not.

---

## Import Conventions

- Import internal modules through the `@/` alias (`@/lib/trading/charges`). Relative imports are allowed only within the same folder (`./RowSkeleton`).
- Do not use `../../`. If an import needs to go up two or more folders, move the module to an appropriate shared location.
- Type-only imports use `import type`.
- App code imports `OPENING_BALANCE`, `SQUARE_OFF_TIME_IST`, `MARKET_OPEN_IST`, `SHORT_MARGIN_BUFFER`, `MAX_SYMBOLS_PER_TICK`, `QUOTE_STALE_AFTER_MS`, `QUOTE_LIVE_WINDOW_MS`, `QUOTE_DELAYED_WINDOW_MS`, `CANDLE_TTL_MS`, `CANDLE_RETENTION` and every charge rate from `src/lib/constants.ts`. Never repeat their numeric values inline. The market, quote and simulator constants are defined in `_shared/market-constants.ts` and re-exported by `constants.ts`, allowing the Edge Function to use the same values without resolving `@/`.
- Keep the two types of quote-age checks separate. `QUOTE_STALE_AFTER_MS` determines whether a quote may fill an order (`trading-contract.md` §5). `QUOTE_LIVE_WINDOW_MS` / `QUOTE_DELAYED_WINDOW_MS` determine its displayed source badge. Swapping them can reject valid fills or allow stale fills.
- Edge Functions use pinned `jsr:` / `npm:` package specifiers and cannot import from `src/`. Put shared logic in `supabase/functions/_shared/`: Deno imports it by relative path, while the app uses `@shared/*`, defined in `tsconfig.json` and mirrored in `vitest.config.mts`. Both run the same module, including the session logic covered by tier 1, so no duplicate TypeScript implementation or drift test is needed. Include `.ts` in imports into `_shared`; Deno requires it, and `allowImportingTsExtensions` permits the same spelling in the app.
- Only the Edge Function entrypoint is excluded from `tsc`, the TypeScript compiler. `tsconfig.json` excludes `supabase/functions/market-tick` because it cannot resolve that code's `jsr:` specifiers or `Deno` global; Deno checks it during `functions deploy`. `_shared/` remains included and must pass the same checks as `src/`.

---

## Comments

- Explain why a non-obvious choice is necessary. `// Lock the funds row so concurrent orders serialise` adds useful context; `// set the price` merely repeats the code.
- Cite a source in comments for non-obvious financial rules, including charge rates, 15:20 square-off and the T+1 settlement simplification (delivery settlement on the next trading day).
- Any deliberate deviation from a rule in this file carries a comment saying which rule and why.
- Use `TODO:` only for a specific unresolved decision that can be acted on. Do not use `FIXME` or leave disabled code in comments; git history preserves old code.

---

## Dependencies

Before installing anything new, check:

1. Whether an existing dependency already does the job: Radix comes with shadcn/ui, Zod validates data, and Supabase provides auth, storage, realtime and scheduling.
2. Whether the browser needs it. Browser dependencies increase the code users download; prefer server-only use when possible.
3. Whether it is actively maintained, typed, and compatible with React 19 and Next.js 16.
4. Whether it is listed below. If not, add it here in the same commit that installs it.

Approved dependencies for this project:

- `next` — framework
- `react`, `react-dom` — UI runtime
- `typescript` — language
- `tailwindcss`, `@tailwindcss/postcss`, `postcss` — styling
- `class-variance-authority`, `clsx`, `tailwind-merge` — shadcn/ui's styling utilities
- `radix-ui` — the single package for Radix UI building blocks, replacing per-component `@radix-ui/*` packages in the shadcn CLI. `shadcn init -b radix` selects it instead of Base UI or React Aria (F02)
- `shadcn` — required at runtime as well as for its CLI. `globals.css` imports `shadcn/tailwind.css` for the components' scroll-fade, shimmer and no-scrollbar utilities (F02)
- `tw-animate-css` — animation utilities the shadcn dialog, dropdown and command components depend on; added by `shadcn init` (F02)
- `cmdk` — the command-palette primitive behind `components/ui/command.tsx`, used for stock search (F02)
- `lucide-react` — icons
- `@supabase/supabase-js`, `@supabase/ssr` — database, auth, realtime
- `zod` — validation
- `zustand` — client-side live quote store
- `react-hook-form`, `@hookform/resolvers` — order ticket forms (F25). The support form uses React 19's form action and `useActionState` so submission and validation work without JavaScript; react-hook-form requires it (F07B)
- `recharts` — holdings donut and P&L charts
- `lightweight-charts` — candlestick price chart
- `next-themes` — light/dark theme persistence
- `sonner` — toasts
- `server-only` — build-time guard on server modules
- `vitest` — tier 1 and tier 3 test runner
- `lighthouse` — accessibility audits through `pnpm audit:a11y`. F04 requires a score above 90, and F38 uses the same tooling. Audit each public page as it ships; the dependency has been present since Phase 1 (F04)
- `pg`, `@types/pg` — direct Postgres connections for tier 3 concurrency tests and the tier-2 pgTAP runner. `supabase test db` needs Docker even with a remote database (F09). Never import these packages in application code
- `eslint`, `eslint-config-next`, `prettier`, `prettier-plugin-tailwindcss` — linting and formatting
- `supabase` (CLI, dev dependency) — migrations, type generation, function deploys

Do not install any other packages without updating this list first.
