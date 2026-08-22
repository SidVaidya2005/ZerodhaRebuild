-- `reserve_margin` was blind to covers, and the consequence was that a user
-- could not close their own position.
--
-- F23 reserved `quantity × price + charges` for every buy. An MIS buy against an
-- open short is a **cover**, and the collateral already held against those
-- shares is what funds it — asking for fresh cash as well demands the money
-- twice. A user who shorted most of their balance has that money in
-- `used_margin` by construction, so the covering buy was rejected
-- INSUFFICIENT_FUNDS while the funds to pay for it sat in the collateral being
-- released by the very same fill.
--
-- Worked example, on the 100000.00 opening balance: short 800 at 100.00 blocks
-- roughly 96060 of collateral and leaves about 3940 in cash. Covering all 800 at
-- 100.00 asks for 80000 that the account does not have in cash, and is refused —
-- permanently, since nothing but the cover releases the collateral.
--
-- Symmetric to the sell rule F23 already had: a sell reserves only its shorting
-- excess, and now a buy reserves only its opening quantity. `trading-contract.md`
-- §6's table is amended in the same change.
--
-- Found by F24 while working out `execute_order`'s cash path, not by a test —
-- F23's suite reserved against accounts with plenty of spare cash, where the
-- over-reservation succeeds and is invisible.
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
  v_net_quantity integer;
  v_reservable integer;
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

  -- The MIS position this order acts against, if any. CNC has neither shorting
  -- nor a positions row, so it never nets against anything.
  if v_order.product = 'MIS' then
    select coalesce(net_quantity, 0) into v_net_quantity
      from public.positions
     where user_id = v_order.user_id and symbol = v_order.symbol and product = 'MIS';
  end if;
  v_net_quantity := coalesce(v_net_quantity, 0);

  if v_order.side = 'BUY' then
    -- Only the quantity that opens or adds to a long needs cash. The rest is a
    -- cover, funded by the collateral already held against those shares.
    v_reservable := v_order.quantity
      - least(v_order.quantity, greatest(-v_net_quantity, 0));

    -- No leverage: full value plus estimated charges over that quantity.
    v_requirement := round(v_reservable::numeric * v_price, 2) + v_charges;

  elsif v_order.product = 'CNC' then
    -- §6: a delivery sell reserves nothing. It requires the holding instead,
    -- and that check is execute_order's — NO_HOLDING, not INSUFFICIENT_FUNDS.
    v_requirement := 0;

  else
    -- An MIS sell reserves only the part that opens a short. Selling 10 against
    -- an existing MIS long of 4 closes 4 and shorts 6; the closing 4 carry no
    -- obligation and need no collateral.
    v_reservable := v_order.quantity - greatest(v_net_quantity, 0);

    if v_reservable <= 0 then
      -- Fully covered by an existing long. Reserves nothing, exactly like a CNC
      -- sell — there is no obligation left open after this fill.
      v_requirement := 0;
    else
      -- §6: a short reserves the COLLATERAL it will have to hold, not the
      -- notional. Those differ by the whole buffer, so reserving the notional
      -- would leave every short — not merely a gap-up fill — short by roughly a
      -- fifth of the trade at fill.
      v_requirement := public.short_collateral_requirement(v_reservable, v_price) + v_charges;
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
  'Blocks the margin an order requires per trading-contract.md §6 and writes MARGIN_BLOCK. Returns false and writes nothing if the user cannot cover it; the caller writes the REJECTED row, because orders_no_margin_unless_open makes the ordering of those two writes load-bearing. A buy reserves notional + charges over the quantity that OPENS a long — a cover is funded by the collateral already held. An MIS sell reserves the collateral for its shorting excess only. Internal-only.';

revoke execute on function public.reserve_margin(uuid) from public, anon, authenticated;
