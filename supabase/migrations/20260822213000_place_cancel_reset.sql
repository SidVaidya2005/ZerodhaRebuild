-- The three functions a browser is allowed to call.
--
-- Each derives the user from `auth.uid()` and never accepts a user id, which is
-- what makes the grant safe: an argument would let a caller name someone else's
-- account, and `security definer` bypasses RLS by design.

-- ---------------------------------------------------------------------------
-- The opening balance, in one place.
-- ---------------------------------------------------------------------------
--
-- F13 held it as a local constant inside `handle_new_user`, which was fine while
-- exactly one function needed it. `reset_account` needs the identical figure —
-- §11's success criterion is that a reset returns the account to *exactly* the
-- post-signup state, and two literals that must agree is how that stops being
-- true. `handle_new_user` is re-created here to read it rather than left holding
-- a second copy.
create or replace function public.opening_balance()
returns numeric
language sql
immutable
parallel safe
as $$
  select 100000.00::numeric
$$;

comment on function public.opening_balance() is
  'The simulated cash every account is credited with, per trading-contract.md §11. Read by handle_new_user and reset_account, so §11''s "returns to exactly the post-signup state" is structural rather than two literals that have to agree. Must stay identical to OPENING_BALANCE in src/lib/constants.ts; pnpm test:parity is what catches drift.';

revoke execute on function public.opening_balance() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- place_order
-- ---------------------------------------------------------------------------
--
-- Returns the composite rather than a bare id. A business rejection returns
-- normally per code-standards.md, so `error` is null and a bare id would leave
-- the Server Action unable to tell a fill from a rejection; raising instead
-- would roll back the very REJECTED row §4's lifecycle and the Orders page both
-- require.
create or replace function public.place_order(
  p_symbol text,
  p_side public.order_side,
  p_order_type public.order_type,
  p_product public.product_type,
  p_quantity integer,
  p_limit_price numeric default null
)
returns table (order_id uuid, status public.order_status, rejection_reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_order_id uuid;
  v_holding integer;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'place_order: no authenticated user' using errcode = '42501';
  end if;

  -- §4's rejection reasons are business outcomes and get a row. A malformed
  -- argument is not one of those: the Server Action parses through Zod before it
  -- calls, so anything reaching here malformed is a caller defect and raising is
  -- the honest answer. `orders_quantity_positive` would refuse the row anyway.
  if p_quantity is null or p_quantity <= 0 then
    return query select null::uuid, 'REJECTED'::public.order_status, 'INVALID_QUANTITY'::text;
    return;
  end if;

  if (p_order_type = 'LIMIT') <> (p_limit_price is not null) then
    raise exception 'place_order: a limit order needs a limit price and a market order must not carry one'
      using errcode = '22023';
  end if;

  insert into public.orders
    (user_id, symbol, side, order_type, product, quantity, limit_price)
  values (v_user_id, p_symbol, p_side, p_order_type, p_product, p_quantity, p_limit_price)
  returning id into v_order_id;

  -- §5: a market order placed outside the session is rejected. A limit order may
  -- be placed then and simply waits — it can only fill during a session, because
  -- only a session produces quotes.
  if p_order_type = 'MARKET' and public.market_state(now()) <> 'OPEN' then
    update public.orders
       set status = 'REJECTED', rejection_reason = 'MARKET_CLOSED'
     where id = v_order_id;
    return query select v_order_id, 'REJECTED'::public.order_status, 'MARKET_CLOSED'::text;
    return;
  end if;

  -- §8: CNC shorting does not exist. Checked here so the user is told now rather
  -- than at a fill that may be days away; `execute_order` re-checks under the
  -- lock, because a holding can be sold from under a resting limit order.
  if p_side = 'SELL' and p_product = 'CNC' then
    select coalesce(quantity, 0) into v_holding
      from public.holdings where user_id = v_user_id and symbol = p_symbol;

    if coalesce(v_holding, 0) < p_quantity then
      update public.orders
         set status = 'REJECTED', rejection_reason = 'NO_HOLDING'
       where id = v_order_id;
      return query select v_order_id, 'REJECTED'::public.order_status, 'NO_HOLDING'::text;
      return;
    end if;
  end if;

  if not public.reserve_margin(v_order_id) then
    update public.orders
       set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS'
     where id = v_order_id;
    return query select v_order_id, 'REJECTED'::public.order_status, 'INSUFFICIENT_FUNDS'::text;
    return;
  end if;

  -- A market order executes in the same transaction; a limit order waits for the
  -- matcher (F28). Either way the row below is read back rather than assumed,
  -- because execute_order may itself have rejected the fill.
  if p_order_type = 'MARKET' then
    perform public.execute_order(v_order_id);
  end if;

  return query
    select o.id, o.status, o.rejection_reason from public.orders o where o.id = v_order_id;
end;
$$;

comment on function public.place_order(text, public.order_side, public.order_type, public.product_type, integer, numeric) is
  'Places an order per trading-contract.md §4: insert, pre-flight rejections, reserve margin, and execute inline for a market order. Returns (order_id, status, rejection_reason) so the caller can tell a fill from a rejection — a business rejection returns normally, so `error` is null and a bare id would not distinguish them. Derives the user from auth.uid().';

-- ---------------------------------------------------------------------------
-- cancel_order
-- ---------------------------------------------------------------------------
create or replace function public.cancel_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_order public.orders%rowtype;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'cancel_order: no authenticated user' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  -- Scoped by the same predicate RLS would apply. `security definer` bypasses
  -- RLS, so without this a user could cancel by guessing an id — and returning
  -- the same false either way declines to confirm that the id exists.
  if not found or v_order.user_id <> v_user_id then
    return false;
  end if;

  -- §4: OPEN is the only status any transition may start from, re-checked after
  -- the lock so a cancel racing a fill loses cleanly rather than double-releasing.
  if v_order.status <> 'OPEN' then
    return false;
  end if;

  -- Release BEFORE the status changes: `orders_no_margin_unless_open` is a
  -- non-deferrable CHECK, so the other order refuses with 23514.
  perform public.release_margin(p_order_id);

  update public.orders set status = 'CANCELLED', executed_at = now() where id = p_order_id;

  return true;
end;
$$;

comment on function public.cancel_order(uuid) is
  'Cancels the caller''s own OPEN order and returns its reservation, per trading-contract.md §4. Returns false if it is not the caller''s, does not exist, or has already left OPEN. Derives the user from auth.uid().';

-- ---------------------------------------------------------------------------
-- reset_account
-- ---------------------------------------------------------------------------
--
-- §11, in one transaction. There is deliberately no RESET ledger type: an
-- earlier draft appended one while also claiming the account returns to exactly
-- the post-signup state, and those cannot both be true.
create or replace function public.reset_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_opening numeric(14, 2);
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'reset_account: no authenticated user' using errcode = '42501';
  end if;

  v_opening := public.opening_balance();

  -- trades before orders: trades.order_id is a foreign key, and while it cascades
  -- the explicit order says what is being deleted rather than relying on it.
  delete from public.trades where user_id = v_user_id;
  delete from public.positions where user_id = v_user_id;
  delete from public.holdings where user_id = v_user_id;
  -- Every row, including the SIGNUP_CREDIT, which carries no order_id and so
  -- would survive the cascade below. A fresh one is written at the end.
  delete from public.fund_ledger where user_id = v_user_id;
  delete from public.orders where user_id = v_user_id;

  update public.funds
     set available_cash = v_opening,
         used_margin = 0,
         opening_balance = v_opening
   where user_id = v_user_id;

  insert into public.fund_ledger (user_id, type, amount, balance_after, note)
  values (v_user_id, 'SIGNUP_CREDIT', v_opening, v_opening, 'Opening simulated balance');

  -- §11: profiles, watchlist_items, instruments and quotes are untouched.
end;
$$;

comment on function public.reset_account() is
  'Restores the caller''s account to exactly the post-signup state per trading-contract.md §11: orders, trades, holdings, positions and every ledger row deleted, cash and opening_balance back to opening_balance(), used_margin zero, and one fresh SIGNUP_CREDIT. Leaves profiles, watchlist_items, instruments and quotes alone. There is no RESET ledger type. Derives the user from auth.uid().';

-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- These three are the exceptions in code-standards.md's grant policy: a Server
-- Action calls each on the user's behalf, and each reads auth.uid() rather than
-- trusting an argument.
grant execute on function public.place_order(text, public.order_side, public.order_type, public.product_type, integer, numeric)
  to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.reset_account() to authenticated;

revoke execute on function public.place_order(text, public.order_side, public.order_type, public.product_type, integer, numeric)
  from public, anon;
revoke execute on function public.cancel_order(uuid) from public, anon;
revoke execute on function public.reset_account() from public, anon;
