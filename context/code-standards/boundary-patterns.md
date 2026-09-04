# Code Standards — Boundary Patterns

> **Reference half of `context/code-standards.md`.** The always-binding rules live there.
> **`trading-contract.md` outranks every money rule stated here.**

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
- Margin is reserved at placement and **retired exactly once**, by one of two functions: `release_margin(order_id)` for cancellations, rejections and cash-consuming fills, or `transfer_margin_to_position(order_id, fill_price, actual_charges)` for a fill that opens a short. Both zero `orders.blocked_margin`; only the transfer keeps collateral held. See `trading-contract.md` §6 — that document is authoritative here.
- **`modify_order` re-reserves rather than retiring.** New terms mean a new requirement, and §6 is the only place that knows how to compute one — so it calls `release_margin`, writes the new `quantity`/`limit_price`, and calls `reserve_margin` again, never computing a requirement of its own. The three statements sit in a plpgsql block with an `EXCEPTION` clause, which makes them a subtransaction: a `reserve_margin` returning false raises inside the block, rolls all three back, and the function returns `(false, 'INSUFFICIENT_FUNDS')` normally. The release must come first — `reserve_margin` returns early when `blocked_margin <> 0` — and the terms must be written before it, because it reads them off the row. (F27)
- **Call `transfer_margin_to_position` before writing the trade and the position rows**, not after. It returns `(ok, required_collateral, entry_reference_price)`; on `ok = false` the reservation is already released and the caller only has to set `REJECTED`/`INSUFFICIENT_FUNDS`. Calling it after the writes would need a plpgsql exception block to roll them back as a subtransaction, for no gain. The caller writes the two returned figures into the `positions` row. (F23)
- **The §6 collateral formula is written in exactly one place**, `short_collateral_requirement(quantity, entry_reference_price)`. `reserve_margin`, `transfer_margin_to_position` and `recompute_position_collateral` all call it. A second copy is how a partial cover starts releasing the wrong amount. (F23)
- **`recompute_position_collateral(user_id, symbol, new_net_quantity)` is called before the new quantity is written**, and takes the quantity the position is about to become. A full cover deletes the row and a flip to long cannot carry collateral, so neither case can be expressed after the fact. (F23)
- **Every money-moving function has its execute permission revoked from `public`, `anon` and `authenticated` by default**, in the same migration that creates it. `security definer` bypasses RLS, so a callable helper is a hole: an authenticated user could invoke it against another user's order id.
- Only these are granted to `authenticated`, because a Server Action calls them on the user's behalf and each derives the user from `auth.uid()` rather than trusting an argument: `place_order`, `cancel_order`, `modify_order`, `reset_account`, `touch_symbol_demand`.
- These are **internal-only** and granted to no role — they run inside another function or as the service role from the Edge Function: `execute_order`, `reserve_margin`, `release_margin`, `transfer_margin_to_position`, `recompute_position_collateral`, `short_collateral_requirement`, `short_margin_buffer`, `calculate_charges`, `charge_rates`, `market_state`, `market_constants`, `match_open_orders`, `square_off_mis`.
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

