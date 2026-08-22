-- Collateral: the block path and the release path.
--
-- `trading-contract.md` §6 gives short collateral one formula and two movers.
-- `transfer_margin_to_position` is the only thing that can increase
-- `positions.blocked_margin`; `recompute_position_collateral` is the only thing
-- that can decrease it. Both read the requirement from
-- `short_collateral_requirement`, so §12.12 cannot be true in one and false in
-- the other.
--
-- The asymmetry between them is the point, not an inconsistency: on entry the
-- collateral arrives from the order's reservation and `available_cash` does not
-- move, so **no ledger row is written**. On a cover the collateral genuinely
-- returns to the user, so one is.

-- ---------------------------------------------------------------------------
-- transfer_margin_to_position
-- ---------------------------------------------------------------------------
--
-- Runs BEFORE the caller writes the trade and the position rows, which is why
-- it takes the fill rather than reading it back. §6 step 3 can refuse the fill,
-- and at this point there is no trade row and no position row to unwind — the
-- alternative was raising into a plpgsql exception block and relying on the
-- subtransaction rollback, which is a lot of machinery to avoid two arguments.
--
-- It returns the two figures the caller must write onto the `positions` row.
-- Handing back `entry_reference_price` rather than letting the caller derive it
-- is what makes §12.11 structural: the gross average has exactly one author, and
-- it is the module that also owns the collateral, so the two averages have no
-- opportunity to cross.
create or replace function public.transfer_margin_to_position(
  p_order_id uuid,
  p_fill_price numeric,
  p_actual_charges numeric
)
returns table (ok boolean, required_collateral numeric, entry_reference_price numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_position public.positions%rowtype;
  v_funds public.funds%rowtype;
  v_prior_short integer;
  v_short_quantity integer;
  v_added integer;
  v_reference numeric(14, 2);
  v_required numeric(14, 2);
  v_held numeric(14, 2);
  v_delta numeric(14, 2);
begin
  if p_fill_price is null or p_fill_price <= 0 then
    raise exception 'transfer_margin_to_position: fill price must be positive, got %', p_fill_price
      using errcode = '22023';
  end if;

  if p_actual_charges is null or p_actual_charges < 0 then
    raise exception 'transfer_margin_to_position: charges must be non-negative, got %', p_actual_charges
      using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'transfer_margin_to_position: order % not found', p_order_id using errcode = 'P0002';
  end if;

  if v_order.status <> 'OPEN' then
    raise exception 'transfer_margin_to_position: order % is %, not OPEN', p_order_id, v_order.status
      using errcode = 'P0002';
  end if;

  select * into v_position
    from public.positions
   where user_id = v_order.user_id and symbol = v_order.symbol and product = 'MIS'
   for update;

  -- Post-fill quantity. A sell subtracts, so this is negative exactly when the
  -- fill leaves a short open — which is the only case this function handles.
  v_short_quantity := -(coalesce(v_position.net_quantity, 0) - v_order.quantity);

  if v_order.side <> 'SELL' or v_order.product <> 'MIS' or v_short_quantity <= 0 then
    -- A caller error. A fill that leaves no short open retires its reservation
    -- through release_margin; sending it here would move cash into a collateral
    -- account nothing is ever going to release.
    raise exception
      'transfer_margin_to_position: order % does not open a short (side %, product %, post-fill net %)',
      p_order_id, v_order.side, v_order.product, -v_short_quantity
      using errcode = 'P0002';
  end if;

  -- §8: the quantity-weighted average of the GROSS fill prices. Charges are not
  -- folded in — that is `average_price`'s job, and §12.11 forbids the two
  -- meeting. Rounded to the column's scale here so the figure the collateral is
  -- computed from is byte-identical to the figure the caller stores; computing
  -- from an unrounded average and storing a rounded one would leave §12.12
  -- failing by a paisa on some quantities.
  v_prior_short := greatest(-coalesce(v_position.net_quantity, 0), 0);
  v_added := v_short_quantity - v_prior_short;

  if v_prior_short = 0 then
    v_reference := round(p_fill_price, 2);
  else
    v_reference := round(
      (v_prior_short::numeric * v_position.entry_reference_price + v_added::numeric * p_fill_price)
        / v_short_quantity::numeric, 2);
  end if;

  v_required := public.short_collateral_requirement(v_short_quantity, v_reference);

  -- §6 step 2. The position's own collateral is in the subtrahend because on a
  -- fill that ADDS to an existing short it is already held — subtracting only
  -- the order's reservation would block it a second time.
  v_held := v_order.blocked_margin + coalesce(v_position.blocked_margin, 0);
  v_delta := (v_required + p_actual_charges) - v_held;

  select * into v_funds from public.funds where user_id = v_order.user_id for update;

  -- §6 step 3. A short limit sell reserves against its limit but §5 fills at the
  -- observed crossing price, which for a sell is at or above it — so a gap-up
  -- fill can need more collateral than it reserved. It is the only case in the
  -- system where a better fill price demands more margin.
  if v_delta > 0 and v_funds.available_cash < v_delta then
    perform public.release_margin(p_order_id);
    return query select false, 0::numeric, null::numeric;
    return;
  end if;

  -- Steps 3 and 4: the reservation adjustment, in whichever direction.
  if v_delta <> 0 then
    update public.funds
       set available_cash = available_cash - v_delta,
           used_margin = used_margin + v_delta
     where user_id = v_order.user_id
    returning * into v_funds;

    insert into public.fund_ledger (user_id, type, amount, balance_after, order_id, note)
    values (
      v_order.user_id,
      case when v_delta > 0 then 'MARGIN_BLOCK' else 'MARGIN_RELEASE' end::public.ledger_type,
      -v_delta,
      v_funds.available_cash,
      p_order_id,
      case when v_delta > 0 then 'Additional collateral required by the fill price'
           else 'Reservation in excess of the collateral required' end
    );
  end if;

  -- Step 5. The collateral stops being the order's and becomes the position's.
  -- No ledger row: `available_cash` is byte-identical across this statement, and
  -- a MARGIN_RELEASE here for the full reservation is exactly the defect the
  -- split exists to prevent — it would make the collateral spendable while the
  -- obligation is still open. The caller writes `v_required` onto the position.
  update public.orders set blocked_margin = 0 where id = p_order_id;

  -- Step 6. The charge portion was reserved as an estimate; release it and debit
  -- what was actually charged, so the estimate is never paid as well as the
  -- actual. Net cash across the pair is zero, which is why both rows are needed
  -- for the ledger to show what happened rather than only where it ended.
  if p_actual_charges > 0 then
    update public.funds
       set available_cash = available_cash + p_actual_charges,
           used_margin = used_margin - p_actual_charges
     where user_id = v_order.user_id
    returning * into v_funds;

    insert into public.fund_ledger (user_id, type, amount, balance_after, order_id, note)
    values (v_order.user_id, 'MARGIN_RELEASE', p_actual_charges, v_funds.available_cash, p_order_id,
            'Estimated charges released from the reservation');

    update public.funds
       set available_cash = available_cash - p_actual_charges
     where user_id = v_order.user_id
    returning * into v_funds;

    insert into public.fund_ledger (user_id, type, amount, balance_after, order_id, note)
    values (v_order.user_id, 'CHARGES', -p_actual_charges, v_funds.available_cash, p_order_id,
            'Charges on the short entry');
  end if;

  return query select true, v_required, v_reference;
end;
$$;

comment on function public.transfer_margin_to_position(uuid, numeric, numeric) is
  'Converts a short-opening fill''s reservation into position collateral per trading-contract.md §6. Call it BEFORE writing the trade and position rows: on a shortfall it releases the whole reservation and returns ok = false, so there is nothing to unwind and the caller only has to set REJECTED/INSUFFICIENT_FUNDS. Returns the required_collateral and entry_reference_price the caller must write onto the positions row. The collateral move itself writes no ledger row, because no cash moves. Internal-only.';

-- ---------------------------------------------------------------------------
-- recompute_position_collateral
-- ---------------------------------------------------------------------------
--
-- The release side. Called BEFORE the caller writes the new quantity, because
-- the two cases that matter cannot be expressed afterwards: a full cover deletes
-- the row (§8), and a flip from short to long cannot carry collateral at all
-- (`positions_collateral_on_shorts_only`). Passing the quantity the position is
-- about to become handles entry, partial cover, full cover and flip with one
-- rule instead of four.
--
-- Refuses to increase the collateral. An increase means the caller reached for
-- the release path on a fill that adds to a short, and that fill has a
-- reservation of its own that only transfer_margin_to_position knows how to
-- retire — silently blocking the difference here would strand it.
create or replace function public.recompute_position_collateral(
  p_user_id uuid,
  p_symbol text,
  p_new_net_quantity integer
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position public.positions%rowtype;
  v_funds public.funds%rowtype;
  v_required numeric(14, 2);
  v_released numeric(14, 2);
begin
  select * into v_position
    from public.positions
   where user_id = p_user_id and symbol = p_symbol and product = 'MIS'
   for update;

  if not found then
    return 0;
  end if;

  -- A long holds nothing, so there is nothing to recompute and nothing to
  -- release. The CHECK already guarantees `blocked_margin` is zero here.
  if v_position.net_quantity > 0 then
    return 0;
  end if;

  -- §6: one formula. Zero quantity means the obligation is gone and the whole
  -- collateral comes back; a flip to long means the same thing.
  if p_new_net_quantity >= 0 then
    v_required := 0;
  else
    v_required := public.short_collateral_requirement(
      p_new_net_quantity, v_position.entry_reference_price);
  end if;

  v_released := v_position.blocked_margin - v_required;

  if v_released < 0 then
    raise exception
      'recompute_position_collateral: %/% would need % more collateral; adds go through transfer_margin_to_position',
      p_user_id, p_symbol, -v_released
      using errcode = 'P0002';
  end if;

  -- Stamped even when nothing is released, so the row always satisfies §12.12
  -- against the quantity the caller is about to write.
  update public.positions
     set blocked_margin = v_required
   where user_id = p_user_id and symbol = p_symbol and product = 'MIS';

  if v_released = 0 then
    return 0;
  end if;

  -- Unlike the entry transfer, this one writes a ledger row: the cash genuinely
  -- comes back to the user here, because the obligation it was held against has
  -- been covered.
  select * into v_funds from public.funds where user_id = p_user_id for update;

  update public.funds
     set available_cash = available_cash + v_released,
         used_margin = used_margin - v_released
   where user_id = p_user_id
  returning * into v_funds;

  insert into public.fund_ledger (user_id, type, amount, balance_after, note)
  values (p_user_id, 'MARGIN_RELEASE', v_released, v_funds.available_cash,
          'Collateral released as the short was covered');

  return v_released;
end;
$$;

comment on function public.recompute_position_collateral(uuid, text, integer) is
  'Recomputes an open short''s collateral against the quantity it is about to become and returns the difference to available_cash with a MARGIN_RELEASE row, per trading-contract.md §6 and §7. Call it BEFORE writing the new quantity: a full cover deletes the row and a flip to long cannot carry collateral, so neither case can be expressed afterwards. Returns the amount released. Refuses to increase collateral — that is transfer_margin_to_position''s job. Internal-only.';

revoke execute on function public.transfer_margin_to_position(uuid, numeric, numeric)
  from public, anon, authenticated;
revoke execute on function public.recompute_position_collateral(uuid, text, integer)
  from public, anon, authenticated;
