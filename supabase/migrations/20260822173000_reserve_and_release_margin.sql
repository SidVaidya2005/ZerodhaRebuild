-- Reservation and release: the two halves of `orders.blocked_margin`.
--
-- Every movement between `funds.available_cash` and `funds.used_margin` that an
-- *order* causes happens in one of these two functions. `trading-contract.md`
-- §12.3 is the reason they are a pair rather than four scattered updates: the
-- identity spans two tables and is not expressible as a CHECK, so the only
-- defence is that one statement block changes both sides.

-- ---------------------------------------------------------------------------
-- reserve_margin
-- ---------------------------------------------------------------------------
--
-- Returns false and writes NOTHING when the user cannot cover the requirement.
-- `place_order` (F24) is what turns that into a REJECTED row with
-- INSUFFICIENT_FUNDS — this function does not touch `status`, because the same
-- CHECK that makes §12.8 structural (`orders_no_margin_unless_open`) makes the
-- ordering of those two writes load-bearing, and F24 owns that ordering.
create or replace function public.reserve_margin(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_funds public.funds%rowtype;
  v_price numeric(14, 2);
  v_long_quantity integer;
  v_shorting_excess integer;
  v_charges numeric;
  v_requirement numeric;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'reserve_margin: order % not found', p_order_id using errcode = 'P0002';
  end if;

  -- Re-checked AFTER the lock, per code-standards.md. Reserving against an
  -- order that has already been cancelled or filled would block cash nothing
  -- will ever release.
  if v_order.status <> 'OPEN' then
    return false;
  end if;

  -- Idempotency. Reserving twice is not a no-op like releasing twice is — it
  -- would block the requirement a second time and leave §12.3 holding against a
  -- figure no order carries.
  if v_order.blocked_margin <> 0 then
    return true;
  end if;

  -- §6: `limit_price` for a limit order, the current `ltp` for a market one.
  if v_order.order_type = 'LIMIT' then
    v_price := v_order.limit_price;
  else
    select ltp into v_price from public.quotes where symbol = v_order.symbol;
    if v_price is null then
      -- A caller error, not a business rejection. §5 rejects a market order with
      -- no usable quote as NO_QUOTE, and that decision — including the staleness
      -- window this function deliberately does not re-implement — belongs to
      -- execute_order, before it ever gets here.
      raise exception 'reserve_margin: no quote for % on market order %', v_order.symbol, p_order_id
        using errcode = 'P0002';
    end if;
  end if;

  v_charges := (select total from public.calculate_charges(
    v_order.side, v_order.product, v_order.quantity, v_price));

  if v_order.side = 'BUY' then
    -- No leverage: the full value of the trade plus estimated charges.
    v_requirement := round(v_order.quantity::numeric * v_price, 2) + v_charges;

  elsif v_order.product = 'CNC' then
    -- §6: a delivery sell reserves nothing. It requires the holding instead,
    -- and that check is execute_order's — NO_HOLDING, not INSUFFICIENT_FUNDS.
    v_requirement := 0;

  else
    -- An MIS sell reserves only the part that opens a short.
    --
    -- Selling 10 against an existing MIS long of 4 closes 4 and shorts 6; the
    -- closing 4 carry no obligation and need no collateral. Reserving all 10
    -- would over-block by the closing quantity, and reserving 0 would leave a
    -- short uncollateralised — both are wrong, and the excess is the only
    -- figure that is right.
    select coalesce(net_quantity, 0) into v_long_quantity
      from public.positions
     where user_id = v_order.user_id
       and symbol = v_order.symbol
       and product = 'MIS';

    v_shorting_excess := v_order.quantity - greatest(coalesce(v_long_quantity, 0), 0);

    if v_shorting_excess <= 0 then
      -- Fully covered by an existing long. Reserves nothing, exactly like a CNC
      -- sell — there is no obligation left open after this fill.
      v_requirement := 0;
    else
      -- §6: a short reserves the COLLATERAL it will have to hold, not the
      -- notional. Those differ by the whole buffer, so reserving the notional
      -- would leave every short — not merely a gap-up fill — short by roughly a
      -- fifth of the trade at fill, and would let a user place a maximum-size
      -- short that its own fill then rejects.
      --
      -- Estimated entry charges ride along, because §6 step 2 measures the
      -- reservation against `required_collateral + actual_charges`. Releasing
      -- them and debiting the real figure is transfer_margin_to_position's
      -- step 6.
      v_requirement := public.short_collateral_requirement(v_shorting_excess, v_price) + v_charges;
    end if;
  end if;

  if v_requirement = 0 then
    return true;
  end if;

  -- Locked before the balance is read, per code-standards.md, so two orders
  -- placed at once serialise instead of both seeing the same cash.
  select * into v_funds from public.funds where user_id = v_order.user_id for update;
  if not found then
    raise exception 'reserve_margin: no funds row for user %', v_order.user_id using errcode = 'P0002';
  end if;

  if v_funds.available_cash < v_requirement then
    return false;
  end if;

  -- §12.3: both sides move in the same statement.
  update public.funds
     set available_cash = available_cash - v_requirement,
         used_margin = used_margin + v_requirement
   where user_id = v_order.user_id
  returning * into v_funds;

  update public.orders set blocked_margin = v_requirement where id = p_order_id;

  insert into public.fund_ledger (user_id, type, amount, balance_after, order_id, note)
  values (v_order.user_id, 'MARGIN_BLOCK', -v_requirement, v_funds.available_cash, p_order_id,
          'Margin blocked on order placement');

  return true;
end;
$$;

comment on function public.reserve_margin(uuid) is
  'Blocks the margin an order requires per trading-contract.md §6 and writes MARGIN_BLOCK. Returns false and writes nothing if the user cannot cover it; the caller writes the REJECTED row, because orders_no_margin_unless_open makes the ordering of those two writes load-bearing. A buy reserves notional + charges; an MIS sell reserves the collateral for its shorting excess only. Internal-only.';

-- ---------------------------------------------------------------------------
-- release_margin
-- ---------------------------------------------------------------------------
--
-- Idempotent by §4: returns immediately when `blocked_margin` is already zero,
-- which is what makes "retired exactly once" safe under a matcher that may run
-- twice in the same minute.
--
-- Deliberately does NOT re-check `status = 'OPEN'`. It is always called while
-- the order is still OPEN — `orders_no_margin_unless_open` guarantees it, since
-- an order holding margin cannot be in any other status — so a status guard
-- here would be dead code that reads as if it were doing something.
create or replace function public.release_margin(p_order_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_funds public.funds%rowtype;
  v_amount numeric(14, 2);
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'release_margin: order % not found', p_order_id using errcode = 'P0002';
  end if;

  if v_order.blocked_margin = 0 then
    return 0;
  end if;

  v_amount := v_order.blocked_margin;

  select * into v_funds from public.funds where user_id = v_order.user_id for update;

  update public.funds
     set available_cash = available_cash + v_amount,
         used_margin = used_margin - v_amount
   where user_id = v_order.user_id
  returning * into v_funds;

  update public.orders set blocked_margin = 0 where id = p_order_id;

  insert into public.fund_ledger (user_id, type, amount, balance_after, order_id, note)
  values (v_order.user_id, 'MARGIN_RELEASE', v_amount, v_funds.available_cash, p_order_id,
          'Margin released');

  return v_amount;
end;
$$;

comment on function public.release_margin(uuid) is
  'Returns an order''s whole reservation to available_cash and writes MARGIN_RELEASE. Idempotent per trading-contract.md §4 — returns 0 without writing when blocked_margin is already zero. Returns the amount released. Internal-only.';

revoke execute on function public.reserve_margin(uuid) from public, anon, authenticated;
revoke execute on function public.release_margin(uuid) from public, anon, authenticated;
