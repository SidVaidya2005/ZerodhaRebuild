# Code Standards — Boundary Patterns

> Read this part of `context/code-standards.md` when writing a Server Action, a Postgres
> function, or the scheduled Edge Function. The core standards apply throughout.
> For money rules, `trading-contract.md` takes precedence over this reference.

## Boundary Patterns

A boundary is where data crosses between the browser, server and database. Each example shows
which layer validates input, controls access and returns a safe result. These are patterns to
read alongside the rules, rather than complete implementations to paste into the app.

### Server Action

The action checks untrusted input before creating a database client. It calls the database with
the user's session, logs technical failures privately, and returns copy that is safe to show.

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

- Exported actions are `async`, accept `input: unknown`, and return `Promise<ActionResult<T>>`, except for the two cases below.
- Actions called by `useActionState` accept `(previousState, formData)`, because React supplies those arguments. `submitSupportMessage` uses this shape so its form works with JavaScript disabled. It still validates `FormData` with Zod first and returns `ActionResult<T>`. Do not use that parameter shape for direct calls from a Client Component. (F07B)
- Actions ending in `redirect()` have no result to return. `signInWithGoogle` and `signOut` accept no `input` and return no `ActionResult`; plain `<form action={...}>` submissions let them work without JavaScript. Log raw provider or database errors without rendering them. Call `redirect()` outside every `try`: it throws `NEXT_REDIRECT`, and catching that exception breaks navigation. (F12)
- Keep this order: validate, create the client, then call the database.
- Return the error shape for action failures. Do not `throw` ordinary errors from a Server Action: production turns them into opaque digests. The redirect mechanism above is the explicit exception.
- Never return `error.message`. Convert a Postgres error to a known code with `toRejectionCode()` and select user-facing text from `ORDER_ERROR_COPY`. Unknown errors use `UNKNOWN` and generic copy. Raw text belongs only in logs.
- Revalidate every route affected by the write. A fill changes orders, holdings, positions, funds, dashboard and reports; refreshing only the obvious pages leaves stale figures elsewhere.
- Derive the user from session cookies. Never accept the caller's claimed identity as authority; RLS scopes the query.
- Actions use `supabase.rpc(...)` for money writes. They must not directly `insert` or `update` `funds`, `orders`, `trades`, `holdings` or `positions`.

### Postgres function

The database owns execution and locking. This shortened example shows the order-status guard
and the CNC-buy solvency check. It omits MIS's separate opening and closing legs: a short cover
uses existing collateral and cannot be rejected for cash. Use `trading-contract.md` §6 and the
full `execute_order` implementation for those paths.

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
  v_breakdown jsonb;
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
  select total, breakdown into v_charges, v_breakdown
    from public.calculate_charges(v_order.side, v_order.product, v_order.quantity, v_price);
  v_cost    := (v_order.quantity * v_price) + v_charges;

  -- CNC buys reserve their full value and charges. Only a shortfall beyond
  -- that reservation needs available_cash. MIS cover solvency is not this branch.
  if v_order.product = 'CNC' and v_order.side = 'BUY'
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
       set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS',
           executed_at = clock_timestamp()
     where id = p_order_id;
    return;
  end if;

  -- … release blocked margin, insert trade, upsert holding/position,
  --    update funds, append ledger, complete order …
end;
$$;

-- Internal execution helper: no browser role may call it directly.
revoke execute on function public.execute_order(uuid) from public, anon, authenticated;
```

- Every money-moving function uses `security definer`, `set search_path = ''`, and fully schema-qualified object names. Lock the user's `funds` row with `for update` before reading a balance.
- Business rejections set `REJECTED` and `rejection_reason`, then return normally. Only genuine faults use `raise exception`.
- Retire margin before an order leaves `OPEN`. The non-deferrable `orders_no_margin_unless_open` CHECK enforces §12.8 and fails with 23514 if a status changes while `blocked_margin` is non-zero. Call `release_margin` or `transfer_margin_to_position` first, or change both columns in one `UPDATE`. (F11)
- Use stable uppercase rejection codes that the UI maps to copy: `INSUFFICIENT_FUNDS`, `NO_HOLDING`, `MARKET_CLOSED`, `NO_QUOTE`, `INVALID_QUANTITY`.
- Immediately after locking an order, recheck `status = 'OPEN'`. Return without writing if it changed. A lock alone cannot stop a second matcher from filling the newly committed row again, or a cancellation racing a fill.
- Scheduler functions must tolerate retries and overlap. `match_open_orders` and `square_off_mis` must be safe twice in one minute, including simultaneous calls from two sessions.
- Test idempotency with concurrent calls from separate sessions. A sequential second run no longer selects the order, so it cannot expose a missing double-fill guard.
- Reserve margin at placement and retire it exactly once. `release_margin(order_id)` handles cancellations, rejections and cash-consuming fills. `transfer_margin_to_position(order_id, fill_price, actual_charges)` handles a fill that opens a short. Both zero `orders.blocked_margin`, but the transfer keeps collateral held on the position. `trading-contract.md` §6 is authoritative.
- `modify_order` re-reserves while the order remains open. It calls `release_margin`, writes the new `quantity`/`limit_price`, then calls `reserve_margin`, which alone calculates the requirement. Keep all three in a plpgsql block with an `EXCEPTION` clause. A false result from `reserve_margin` raises inside that block to roll it all back, after which the function returns `(false, 'INSUFFICIENT_FUNDS')` normally. Release must come first because `reserve_margin` exits early for `blocked_margin <> 0`; write the new terms before reserving because the function reads them from the row. (F27)
- Call `transfer_margin_to_position` before writing trade and position rows. It returns `(ok, required_collateral, entry_reference_price)`, and the caller writes the last two values to `positions`. If `ok = false`, the reservation is already released, so the caller marks the order `REJECTED`/`INSUFFICIENT_FUNDS`. Writing rows first would need a rollback subtransaction to undo them. For flips, keep the closing cash leg and attempted opening leg in the subtransaction required by the contract. (F23)
- Define §6's collateral formula only in `short_collateral_requirement(quantity, entry_reference_price)`. `reserve_margin`, `transfer_margin_to_position` and `recompute_position_collateral` must call it. A duplicate can make partial covers release a different amount. (F23)
- Call `recompute_position_collateral(user_id, symbol, new_net_quantity, order_id)` before writing the new quantity. It needs the target quantity: a full cover deletes the row, and a flip to long cannot retain collateral. The order id ties the release to the short cover for §12.9 reconciliation. (F23, Phase 4 checkpoint)
- In the migration that creates a money-moving function, revoke execute from `public`, `anon` and `authenticated` by default. A `security definer` helper bypasses RLS, so exposing it could let a user act on someone else's order id.
- The user-facing mutation functions granted to `authenticated` are `place_order`, `cancel_order`, `modify_order`, `reset_account` and `touch_symbol_demand`. Each uses `auth.uid()` for identity. The first four are called through Server Actions; `touch_symbol_demand` is the browser RPC exception documented in the core standards. `place_order` calls the internal `market_state` session check, so the check still applies when a caller invokes `place_order` directly by RPC.
- Keep these functions internal, without client-role grants: `execute_order`, `reserve_margin`, `release_margin`, `transfer_margin_to_position`, `recompute_position_collateral`, `short_collateral_requirement`, `short_margin_buffer`, `calculate_charges`, `charge_rates`, `market_state`, `market_constants`, `match_open_orders` and `square_off_mis`. They run inside another function or under the Edge Function's service role.
- Every `security definer` function uses `search_path = ''` and schema-qualifies every referenced object. A mutable search path can let an attacker substitute an object and gain privileges.
- A function granted to `authenticated` must not accept `user_id` as an argument. It reads `auth.uid()`; accepting another identity would defeat the access rule.

### Edge Function (`market-tick`)

The scheduler checks its secret before constructing a service-role client. This entrypoint excerpt
calls the existing `tick` helper, which applies the session gate, refreshes quotes, matches orders,
and squares off MIS positions in that order. It omits request-body parsing and the `session_at`
override; the full handler rejects an invalid override with 400 and `BAD_SESSION_AT`.

`tick` returns ordinary results with HTTP 200. Individual matcher or square-off faults are reported
in its `faulted` count, currently with `ok: true`. The contract also reserves HTTP 200 for a handled
`{ ok: false }` result; that is different from an unexpected throw caught by the entrypoint, which
returns 500 and `TICK_FAILED`. Access and configuration checks have their own statuses, shown below.

```ts
// supabase/functions/market-tick/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2.49.4'

Deno.serve(async (req) => {
  // JWT verification stays ON, but accepts the public browser key too.
  // The Vault-held scheduler secret is the second, required access check.
  const expected = Deno.env.get('SCHEDULER_SECRET')
  if (!expected) {
    console.error('[market-tick] SCHEDULER_SECRET is not configured')
    return Response.json({ ok: false, error: 'NOT_CONFIGURED' }, { status: 500 })
  }
  if (!secretMatches(req.headers.get('x-scheduler-secret'), expected)) {
    return Response.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  try {
    // `tick` checks the session, then refreshes quotes, matches orders and
    // squares off MIS positions. It writes nothing when the market is closed.
    // This excerpt uses the real clock; the authenticated session_at override
    // and its 400 BAD_SESSION_AT response are omitted here.
    // A returned result uses HTTP 200, including a handled { ok: false } result.
    return Response.json(await tick(supabase, new Date(), null))
  } catch (error) {
    // An unexpected thrown failure is the unhandled path: log the detail,
    // return a safe code and HTTP 500. Do not return String(error).
    console.error('[market-tick]', error)
    return Response.json({ ok: false, error: 'TICK_FAILED' }, { status: 500 })
  }
})
```

- Check `isTradingSession()` before any quote write, order match or square-off. A closed-session run writes nothing and returns 200 with `skipped: 'MARKET_CLOSED'`.
- A normally returned tick result uses HTTP 200; the contract uses that status for handled `{ ok: false }` results too. Unexpected throws return 500 with `TICK_FAILED`. A missing scheduler secret returns 500 with `NOT_CONFIGURED`, a wrong secret returns 401, and an invalid `session_at` returns 400. Do not turn an unexpected exception into a successful HTTP response.
- Return a safe error code, never an error object or `String(error)`. Scheduler-only endpoints follow the same rule against leaking raw database errors as every other endpoint.
- Keep JWT verification enabled and also compare a Vault-held scheduler secret in constant time before any read or write. Refuse access if the secret is unset. F16 measured the gateway accepting the public browser key, so JWT verification alone does not restrict the endpoint to the scheduler.
- Finish well inside 10 seconds. `MAX_SYMBOLS_PER_TICK` caps the selected symbols in this simulator-only build. The outbound rate limiter remains unbuilt by scope decision; it cannot currently provide a batch bound.
- This is the only writer of `quotes` and the only caller of `match_open_orders` and `square_off_mis`.

---
