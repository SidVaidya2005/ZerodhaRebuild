# Code Standards

> **Role:** The rules every change must follow — language, framework, naming, error handling, dependencies.
> **Read before writing code**; obey on every change.
> **Relates to:** derives from the stack in `architecture.md`.

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
- **All mutations go through Server Actions in `src/server/actions/`.** Route handlers exist only for `/auth/callback` and `/api/health`.
- **Exactly two exceptions, and no others may be added without updating this list:**
  1. **Supabase Auth SDK calls from the browser** — `signInWithOAuth`, `signOut`. These are the auth provider's own client flow; routing them through a Server Action would break the OAuth redirect.
  2. **`touch_symbol_demand(symbols[])`** — the client RPC that marks which symbols are on screen. It takes no user-supplied state beyond a symbol list, derives the caller from `auth.uid()`, upserts `last_requested_at` only, and is called at most once per subscription change (not per tick). It exists as an RPC because it fires on every watchlist render and a Server Action round trip would be wasteful for a write that touches no user-owned data.
- Both exceptions read the session from cookies and write nothing a user could exploit. Anything touching `funds`, `orders`, `trades`, `holdings`, `positions` or `watchlist_items` goes through a Server Action, always.
- The middleware file is `src/proxy.ts` and its export is named `proxy` — Next.js 16 renamed `middleware.ts` to `proxy.ts`. It runs on the Node.js runtime; the edge runtime is unavailable there.
- `cookies()`, `headers()`, `params`, and `searchParams` are async — always `await` them.
- Call `revalidatePath` for every route whose data a Server Action changed; list them explicitly rather than revalidating the layout.
- Terminal pages are dynamic by default because they read the session. Marketing pages must stay statically renderable — never read `cookies()` in `(marketing)`.
- Use `next/image` for all raster images and `next/font` for fonts. No `<img>` tags, no external font CDN links.
- Every route segment that fetches data has a sibling `loading.tsx`; every terminal segment has an `error.tsx`.

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
- Named exports only. No default exports except where Next.js requires them (`page.tsx`, `layout.tsx`, `error.tsx`, `not-found.tsx`).
- `'use client'` is the first line of the file when present, before any import.
- Early-return for loading and empty states rather than nesting the whole body in a conditional.
- Small private helpers (`RowSkeleton` above) may live at the bottom of the same file; anything reused elsewhere moves to its own file.

---

## Boundary Patterns

### Server Action

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { cancelOrderSchema } from '@/lib/trading/schemas'
import type { ActionResult } from '@/types/domain'

export async function cancelOrder(input: unknown): Promise<ActionResult<{ orderId: string }>> {
  const parsed = cancelOrderSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid order reference.' } }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_order', { p_order_id: parsed.data.orderId })

  if (error) {
    // Raw Postgres text is logged, never returned — see the Error Handling rules below.
    console.error('[orders.cancelOrder]', error)
    const code = toRejectionCode(error)
    return { ok: false, error: { code, message: ORDER_ERROR_COPY[code] } }
  }

  revalidatePath('/orders')
  return { ok: true, data: { orderId: parsed.data.orderId } }
}
```

- Every exported action is `async`, takes `input: unknown`, and returns `Promise<ActionResult<T>>`.
- **One exception: an action driven by `useActionState`** takes `(previousState, formData)` instead, because React supplies those arguments — see `submitSupportMessage` (F07B). It still parses the `FormData` through a Zod schema first and still returns `ActionResult<T>`; only the parameter list differs, and it differs so the form works with JavaScript disabled. Do not use this shape for an action a Client Component calls directly.
- **A second exception: an action that ends in `redirect()`.** `signInWithGoogle` and `signOut` (F12) take no `input`, return no `ActionResult`, and finish by redirecting — there is no result to hand back to a caller that is no longer on the page. They are submitted by a plain `<form action={...}>` so sign-in works with JavaScript disabled, the same reason the support form has its exception. Two rules still bind: raw provider or database text is logged and never rendered, and **`redirect()` is called outside every `try`** — it works by throwing `NEXT_REDIRECT`, so catching it silently breaks the flow.
- Validate first, then get the client, then call the database. Never reorder those steps.
- Never `throw` out of a Server Action — a thrown error becomes an opaque digest in production. Return the error shape.
- **Never put `error.message` into the returned shape.** Map the Postgres error to a known code with `toRejectionCode()` and look the user-facing copy up in `ORDER_ERROR_COPY`. An unmapped error becomes `UNKNOWN` with generic copy. Raw database text is logged and nowhere else.
- Revalidate **every** route whose data the mutation touched. A fill changes orders, holdings, positions, funds, dashboard and reports — listing only the obvious two leaves stale numbers on screen.
- Never re-derive the user from client input. The session comes from cookies and RLS scopes the query.
- Actions call `supabase.rpc(...)` for anything that writes money. Direct `insert`/`update` on `funds`, `orders`, `trades`, `holdings`, or `positions` from an action is forbidden.

### Postgres function

```sql
create or replace function public.execute_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''   -- empty, per Supabase guidance; every object below is schema-qualified
as $$
declare
  v_order   public.orders%rowtype;
  v_funds   public.funds%rowtype;
  v_price   numeric(14,2);
  v_charges numeric(14,2);
  v_cost    numeric(14,2);
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Re-check the status AFTER acquiring the lock, never before. At READ COMMITTED a
  -- transaction that waited on this lock is handed the freshly committed row, so a
  -- concurrent matcher run that already filled this order is visible right here.
  -- Without this guard that second run fills it again: duplicate trade, duplicate
  -- debit, corrupted ledger.
  if v_order.status <> 'OPEN' then
    return;
  end if;

  -- Lock the funds row before reading the balance so concurrent orders serialise.
  select * into v_funds from public.funds where user_id = v_order.user_id for update;

  select ltp into v_price from public.quotes where symbol = v_order.symbol;
  v_charges := public.calculate_charges(v_order.side, v_order.product, v_order.quantity, v_price);
  v_cost    := (v_order.quantity * v_price) + v_charges;

  -- A BUY reserved `blocked_margin` at placement; only the shortfall beyond that
  -- reservation has to come out of available_cash.
  if v_order.side = 'BUY'
     and (v_funds.available_cash + v_order.blocked_margin) < v_cost then
    -- Release BEFORE the status changes, not after.
    --
    -- `orders_no_margin_unless_open` encodes trading-contract.md §12.8, and a
    -- CHECK is not deferrable — it fires per statement, not at commit. Setting
    -- the status first leaves the row momentarily REJECTED while still holding
    -- margin, and that UPDATE is refused with 23514. Releasing first is always
    -- legal, because an OPEN order may hold margin or hold none.
    perform public.release_margin(p_order_id);
    update public.orders
       set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS'
     where id = p_order_id;
    return;
  end if;

  -- … release blocked margin, insert trade, upsert holding/position,
  --    update funds, append ledger, complete order …
end;
$$;
```

- Every money-moving function is `security definer` with `set search_path = ''` and fully schema-qualified object names, and locks the `funds` row with `for update` before reading a balance.
- Business rejections update the order to `REJECTED` with a `rejection_reason` and return normally; only genuine faults `raise exception`.
- **Retire the margin before the status leaves `OPEN`.** `orders_no_margin_unless_open` enforces §12.8 as a non-deferrable CHECK, so any statement that moves an order out of `OPEN` while `blocked_margin` is still non-zero fails with 23514. Either call `release_margin` / `transfer_margin_to_position` first, or write both columns in a single `UPDATE`. (F11)
- Rejection reasons are stable uppercase codes the UI maps to copy: `INSUFFICIENT_FUNDS`, `NO_HOLDING`, `MARKET_CLOSED`, `NO_QUOTE`, `INVALID_QUANTITY`.
- **Every function that acts on an order re-checks `status = 'OPEN'` immediately after taking the row lock**, and returns without writing if it is not. This is what makes `execute_order` safe under concurrent matcher runs and closes the cancel-while-filling race; the row lock alone does not.
- Functions are idempotent where the scheduler may retry them: `match_open_orders` and `square_off_mis` must be safe to run twice in the same minute, and safe to run **simultaneously** in two sessions.
- An idempotency test must issue the two invocations **concurrently from separate sessions**. A sequential re-run cannot detect a double-fill, because the second pass no longer selects the order — such a test passes whether or not the bug is present.
- Margin is reserved at placement and **retired exactly once**, by one of two functions: `release_margin(order_id)` for cancellations, rejections and cash-consuming fills, or `transfer_margin_to_position(order_id)` for a fill that opens a short. Both zero `orders.blocked_margin`; only the transfer keeps collateral held. See `trading-contract.md` §6 — that document is authoritative here.
- **Every money-moving function has its execute permission revoked from `public`, `anon` and `authenticated` by default**, in the same migration that creates it. `security definer` bypasses RLS, so a callable helper is a hole: an authenticated user could invoke it against another user's order id.
- Only these are granted to `authenticated`, because a Server Action calls them on the user's behalf and each derives the user from `auth.uid()` rather than trusting an argument: `place_order`, `cancel_order`, `modify_order`, `reset_account`, `touch_symbol_demand`.
- These are **internal-only** and granted to no role — they run inside another function or as the service role from the Edge Function: `execute_order`, `reserve_margin`, `release_margin`, `transfer_margin_to_position`, `calculate_charges`, `match_open_orders`, `square_off_mis`.
- Every `security definer` function sets `search_path = ''` and schema-qualifies every object it touches. A mutable search path on a definer function is a privilege-escalation vector.
- A function granted to `authenticated` never accepts a `user_id` argument. It reads `auth.uid()`. Accepting one would make the grant meaningless.

### Edge Function (`market-tick`)

```ts
// supabase/functions/market-tick/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // Two layers, and both are load-bearing. JWT verification stays ON, which rejects
  // a caller with no Authorization header — but F16 measured what the gateway
  // *accepts* and it is any valid project key, including the publishable one that
  // ships in the browser bundle. The Vault-held scheduler secret compared here is
  // what actually restricts this to the scheduler. See library-docs.md → Supabase Cron.
  if (!secretMatches(req.headers.get('x-scheduler-secret'), Deno.env.get('SCHEDULER_SECRET')!)) {
    return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Business-time authority. The cron window is only a cost bound, never the gate.
    if (!(await isTradingSession(supabase, new Date()))) {
      return Response.json({ ok: true, skipped: 'MARKET_CLOSED' })
    }

    const symbols = await selectDemandedSymbols(supabase)
    const quotes = await quoteService.fetch(symbols)
    await supabase.from('quotes').upsert(quotes, { onConflict: 'symbol' })
    // Wired in by F28 and F29, which build them. F16 ships without these calls
    // rather than calling functions that do not exist yet.
    await supabase.rpc('match_open_orders')
    await supabase.rpc('square_off_mis')
    // F33's, with the candle pipeline it prunes.
    await pruneCandlesOncePerDay(supabase)

    return Response.json({ ok: true, refreshed: quotes.length })
  } catch (error) {
    // Log the detail, return a code. `String(error)` in an HTTP body would leak
    // database text, violating the Error Handling rules above.
    console.error('[market-tick]', error)
    return Response.json({ ok: false, error: 'TICK_FAILED' }, { status: 500 })
  }
})
```

- **The gate comes first.** No quote write, order match, or square-off may run before `isTradingSession()` returns true. A tick that skips returns 200 with `skipped: 'MARKET_CLOSED'` and writes nothing.
- The Edge Function returns 200 with `{ ok: false }` for handled failures and only 500 for unhandled ones, so `pg_cron` failures stand out in `cron.job_run_details`.
- **Never put an error object or `String(error)` into a response body**, even on a function only the scheduler calls. The no-raw-error rule has no endpoint-based exemption.
- **The function is not a public endpoint, and JWT verification alone does not make it one.** Verification stays enabled *and* the handler checks a Vault-held scheduler secret in constant time before reading or writing anything; a missing secret makes it refuse rather than fall open. F16 proved the gateway accepts the publishable key, so the second layer is not belt-and-braces — it is the belt.
- It must complete well inside 10 seconds; batch size is bounded by the rate limiter, never by the symbol count.
- It is the only writer of `quotes` and the only caller of `match_open_orders` and `square_off_mis`.

---

## Error Handling

- Log with a bracketed module tag: `console.error('[orders.placeOrder]', error)`. Never bare `console.log` in committed code.
- Users see mapped copy, never raw database text. `rejection_reason` codes and `ActionResult.error.code` are the mapping keys.
- Never expose a Postgres error message, stack trace, connection string, or key in a UI string or an HTTP response body.
- Failures in the quote pipeline degrade rather than throw: a dead provider trips its circuit and the chain falls through to the simulator.
- Client Components surface action failures through a toast; they never render `error.message` from an unknown source.
- Every terminal route segment has an `error.tsx` boundary with a retry affordance.

---

## Testing

Three tiers, because no single runner can prove what this project claims. **Match the claim to the tier
that can actually falsify it** — a test in the wrong tier passes whether or not the bug exists.

| Tier | Runner | Proves | Command |
| ---- | ------ | ------ | ------- |
| 1 — logic | Vitest, no database | Charge estimates, `isTradingSession`, provider chain and circuit breaker, Zod parsers, tick interpolation | `pnpm test` |
| 2 — database | pgTAP via `scripts/run-pgtap.mts` | RLS, grants, CHECK constraints, function return values, reconciliation identities | `pnpm test:db` |
| 3 — concurrency | Vitest driving two `pg` connections | Row-lock contention, double-fill, cancel-while-filling, margin races | `pnpm test:race` |

**Why three.** pgTAP runs inside a single session and a single transaction, so it structurally cannot
express two transactions racing for a lock — the exact scenario the status guard in `execute_order`
exists for. Vitest alone cannot reach RLS or a CHECK constraint. Tier 3 exists solely for claims the
other two cannot reach.

### Environment

There is **no Docker on this machine**, so `supabase start` and `supabase test db --local` are
unavailable. Both database tiers therefore run against the **hosted project**, addressed by
`TEST_DATABASE_URL`.

**There is exactly one Supabase project, and it is the real one.** An earlier version of this
document required a second, throwaway project for tests. That was reversed deliberately: one project
is simpler to operate and cannot silently pause while the other stays warm. The cost is that tier 3
writes into the real database, which is managed rather than avoided — see the tier 3 rules below.

```bash
# Apply the migration history
pnpm supabase db push

# Tier 2 — our own runner, NOT `supabase test db`
pnpm test:db
```

**`supabase test db` is unusable here, and `--db-url` does not save it.** It connects to the remote
database and *then* shells out to `pg_prove` in a container, failing with `LegacyDockerRunError`.
Tier 2 runs through `scripts/run-pgtap.mts` instead: pgTAP's functions return their TAP output as
text rows, so executing a suite through `pg` and reading the rows *is* the TAP stream. The runner
fails on a failed assertion, on a plan mismatch, and on a SQL error — all three observed failing
before it was trusted (F09).

- **Tier 3 commits into the real database.** It cannot do otherwise: proving two connections cannot both fill the same order requires the first one to actually commit. Three rules make that safe, and all three are mandatory:
  1. **`pnpm test:race` refuses to run unless `ALLOW_RACE_TESTS` is set.** A bare `pnpm test:all` must never write to the database by accident, and neither must CI.
  2. Every row a race test creates is seeded under a **recognisable prefix**, so anything it leaves behind is identifiable at a glance.
  3. Cleanup runs in `afterEach` **whether the test passed or failed**. A crashed process can still strand rows; that is the residual risk of a single project, and it is cleared by hand or by `reset_account`.
- Free projects **pause after a week of inactivity**. A run failing to connect usually means the project is paused, not that the code broke.
- `TEST_DATABASE_URL` is a secret and lives only in `.env.test.local`, which is gitignored.

### Tier 2 — pgTAP

One file per concern in `supabase/tests/`, numbered so they run in order. Every file wraps itself in
`begin; … rollback;` so runs leave nothing behind.

```sql
-- supabase/tests/01-rls.sql
begin;
select plan(3);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');
-- The bootstrap trigger creates profiles + funds + the signup ledger row for each.

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select is_empty(
  $$select * from public.funds where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'user A reads none of user B''s funds'
);

select is_empty(
  $$update public.funds set available_cash = 999999 returning user_id$$,
  'user A cannot inflate any funds row, including their own'
);

-- The grant policy, tested directly: internal functions are not callable by a user.
select throws_ok(
  $$select public.execute_order('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501',
  null,
  'execute_order is not callable by authenticated'
);

select * from finish();
rollback;
```

- Impersonate with `set local role authenticated;` followed by `set local request.jwt.claim.sub = '<uuid>';`. Use `set local role anon;` for the signed-out case.
- Assert denial with `is_empty()` when a policy filters rows away, and `throws_ok(..., '42501', ...)` when a missing grant stops the request before any policy runs. They are different failures and both must be covered.
- Every table with a `user_id` gets a read-denial and a write-denial case. Every internal function gets a not-callable case.

### Tier 3 — two-connection races

```ts
// tests/concurrency/execute-order.race.test.ts
import { Client } from 'pg'
import { expect, test } from 'vitest'

test('two matcher runs cannot fill the same order twice', async () => {
  const a = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  const b = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  await Promise.all([a.connect(), b.connect()])

  const orderId = await seedOpenLimitOrder(a) // committed, so both sessions see it

  await a.query('begin')
  await b.query('begin')

  // A takes the order row lock and fills.
  await a.query('select public.execute_order($1)', [orderId])

  // B blocks on that same lock — do not await yet.
  const bFill = b.query('select public.execute_order($1)', [orderId])

  await a.query('commit')
  await bFill // unblocks, re-reads status <> 'OPEN', returns without writing
  await b.query('commit')

  const { rows } = await a.query(
    'select count(*)::int as n from public.trades where order_id = $1',
    [orderId]
  )
  expect(rows[0].n).toBe(1)

  await Promise.all([a.end(), b.end()])
})
```

- Use `pg` directly. The Supabase JS client speaks PostgREST — one statement per request, no interactive transactions — so it cannot hold a lock open across statements and cannot express this test at all.
- **Never `await` the second session's call before committing the first.** Awaiting it serialises the two and the test passes with the bug present.
- Tier 3 **commits**, so every test seeds under a recognisable prefix and cleans up in `afterEach`, whether it passed or failed.
- Keep tier 3 small. It is slow and order-dependent; only genuine races belong here.

### The falsifiability rule

For every concurrency guard and every constraint, **run the suite once against a build with the guard
removed and confirm the test fails.** A test that passes in both states proves nothing. Record the
result in the build journal entry for that feature.

This is not hypothetical: an earlier draft of this project specified "run the matcher twice and expect
one fill" as a sequential re-run, which passes whether or not `execute_order` re-checks status, because
the second pass never selects the order.

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
