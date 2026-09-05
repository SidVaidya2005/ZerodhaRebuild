-- `execute_order`: a closing leg is never rejected for want of funds.
--
-- Feature 29 found this while proving §10's promise that the square-off job
-- "never leaves a position open for want of funds". It did — see the comment on
-- the solvency check below. One condition changes; everything else in this
-- function is the definition from 20260822230000_fix_capped_loss.sql, reproduced
-- whole because a migration cannot patch a function in place.

create or replace function public.execute_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_funds public.funds%rowtype;
  v_holding public.holdings%rowtype;
  v_position public.positions%rowtype;
  v_price numeric(14, 2);
  v_fetched_at timestamptz;
  v_stale_ms integer;
  v_charges numeric(14, 2);
  v_breakdown jsonb;
  v_net integer;
  v_new_net integer;
  v_close_quantity integer;
  v_open_quantity integer;
  v_close_charges numeric(14, 2);
  v_open_charges numeric(14, 2);
  v_realised numeric(14, 2);
  v_settlement numeric(14, 2);
  v_transfer record;
  v_opens_short boolean;
  v_balance numeric(14, 2);
  v_capped numeric(14, 2);
  v_new_average numeric(14, 2);
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'execute_order: order % not found', p_order_id using errcode = 'P0002';
  end if;

  -- Re-check the status AFTER acquiring the lock, never before. At READ
  -- COMMITTED a transaction that waited on this lock is handed the freshly
  -- committed row, so a concurrent matcher run that already filled this order is
  -- visible right here. Without this guard that second run fills it again:
  -- duplicate trade, duplicate debit, corrupted ledger.
  if v_order.status <> 'OPEN' then
    return;
  end if;

  select * into v_funds from public.funds where user_id = v_order.user_id for update;

  -- ── Price it (§5) ─────────────────────────────────────────────────────────
  select ltp, fetched_at into v_price, v_fetched_at
    from public.quotes where symbol = v_order.symbol;
  select quote_stale_after_ms into v_stale_ms from public.market_constants();

  if v_price is null
     or extract(epoch from (now() - v_fetched_at)) * 1000 > v_stale_ms then
    if v_order.order_type = 'MARKET' then
      perform public.release_margin(p_order_id);
      update public.orders
         set status = 'REJECTED', rejection_reason = 'NO_QUOTE', executed_at = clock_timestamp()
       where id = p_order_id;
      return;
    end if;

    -- A limit order simply waits. It can only fill during a session, because
    -- only a session produces quotes, and an absent one is not a rejection.
    return;
  end if;

  if v_order.order_type = 'LIMIT' then
    -- Eligibility re-checked under the lock rather than trusted from the caller,
    -- so this function is safe to call on any open order. §5 fills at the
    -- OBSERVED crossing price, never at the limit.
    if v_order.side = 'BUY' and v_price > v_order.limit_price then
      return;
    end if;
    if v_order.side = 'SELL' and v_price < v_order.limit_price then
      return;
    end if;
  end if;

  select total, breakdown into v_charges, v_breakdown
    from public.calculate_charges(v_order.side, v_order.product, v_order.quantity, v_price);

  -- ── Split the order into its legs ─────────────────────────────────────────
  if v_order.product = 'CNC' then
    select * into v_holding
      from public.holdings
     where user_id = v_order.user_id and symbol = v_order.symbol
     for update;

    if v_order.side = 'BUY' then
      v_close_quantity := 0;
    else
      -- §8: CNC shorting does not exist, so a sell beyond the holding is not a
      -- short — it is a mistake.
      if coalesce(v_holding.quantity, 0) < v_order.quantity then
        perform public.release_margin(p_order_id);
        update public.orders
           set status = 'REJECTED', rejection_reason = 'NO_HOLDING', executed_at = clock_timestamp()
         where id = p_order_id;
        return;
      end if;
      v_close_quantity := v_order.quantity;
    end if;
  else
    select * into v_position
      from public.positions
     where user_id = v_order.user_id and symbol = v_order.symbol and product = 'MIS'
     for update;

    v_net := coalesce(v_position.net_quantity, 0);

    if v_order.side = 'BUY' then
      v_new_net := v_net + v_order.quantity;
      v_close_quantity := least(v_order.quantity, greatest(-v_net, 0));
    else
      v_new_net := v_net - v_order.quantity;
      v_close_quantity := least(v_order.quantity, greatest(v_net, 0));
    end if;
  end if;

  v_open_quantity := v_order.quantity - v_close_quantity;

  -- §9: charges are computed once on the whole order and apportioned pro-rata.
  -- The closing share is rounded and the opening leg takes the REMAINDER, so the
  -- two always sum to `trades.charges` and §12.6 cannot fail by a paisa.
  v_close_charges := round(
    v_charges * v_close_quantity::numeric / v_order.quantity::numeric, 2);
  v_open_charges := v_charges - v_close_charges;

  -- Whether this fill leaves a short open decides which function retires the
  -- reservation, and therefore who writes the CHARGES row.
  v_opens_short := v_order.side = 'SELL' and v_order.product = 'MIS' and v_new_net < 0;

  -- ── Solvency, for the opening leg only ────────────────────────────────────
  --
  -- §6 caps a cover's loss rather than refusing it, so a closing leg can never
  -- be rejected for funds — no position is ever stranded. Only fresh exposure
  -- can be, and the reservation is what it is measured against.
  --
  -- `v_open_quantity > 0` is what makes that literally true, and it was missing.
  -- With no opening leg the requirement collapsed to the charges alone, so a
  -- pure cover still needed `available_cash >= charges` — while the collateral
  -- that is about to be released, and would pay them, sits in
  -- `positions.blocked_margin` where this check cannot see it. An account whose
  -- cash had already been floored at zero by one capped square-off therefore had
  -- its *second* underwater short rejected and left open past 15:20, violating
  -- §10, identity 7, and architecture.md's "no position is ever stranded".
  -- Found by F29's tier 2 suite, not by reasoning about the code. (F29)
  if v_order.side = 'BUY'
     and v_open_quantity > 0
     and (v_funds.available_cash + v_order.blocked_margin)
         < (round(v_open_quantity::numeric * v_price, 2) + v_charges) then
    -- Release BEFORE the status changes. `orders_no_margin_unless_open` encodes
    -- §12.8 and a CHECK is not deferrable, so setting the status first leaves the
    -- row momentarily REJECTED while still holding margin, refused with 23514.
    perform public.release_margin(p_order_id);
    update public.orders
       set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS', executed_at = clock_timestamp()
     where id = p_order_id;
    return;
  end if;

  -- ── Retire the reservation, exactly once ──────────────────────────────────
  if v_opens_short then
    -- Passed the WHOLE order's charges, not the opening share: §6 step 6 is
    -- where a short entry's charges are released and debited, and that must
    -- account for the entire order so a crossing fill still writes exactly one
    -- CHARGES row.
    select * into v_transfer
      from public.transfer_margin_to_position(p_order_id, v_price, v_charges);

    if not v_transfer.ok then
      update public.orders
         set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS', executed_at = clock_timestamp()
       where id = p_order_id;
      return;
    end if;
  else
    perform public.release_margin(p_order_id);
  end if;

  -- ── The closing leg ───────────────────────────────────────────────────────
  v_realised := 0;

  if v_close_quantity > 0 then
    if v_order.side = 'SELL' then
      -- §12.9: a long close settles through SELL_CREDIT, never a REALISED_PNL row.
      v_settlement := round(v_close_quantity::numeric * v_price, 2);
      perform public.post_ledger(v_order.user_id, 'SELL_CREDIT', v_settlement, p_order_id,
                                 'Proceeds of the sale');

      v_realised := round(
        (v_price - coalesce(v_holding.average_price, v_position.average_price))
          * v_close_quantity::numeric, 2) - v_close_charges;
    else
      -- Covering a short. The collateral comes back first, then the settlement.
      perform public.recompute_position_collateral(
        v_order.user_id, v_order.symbol, v_net + v_close_quantity);

      -- §7: the GROSS basis, deliberately. A short's proceeds were never credited
      -- at entry and its entry charges were already debited, so settling from the
      -- net `average_price` would debit those charges a second time.
      v_settlement := round(
        (v_position.entry_reference_price - v_price) * v_close_quantity::numeric, 2);

      -- §9 reports from the NET average, and is a different number on purpose.
      v_realised := round(
        (v_position.average_price - v_price) * v_close_quantity::numeric, 2) - v_close_charges;
    end if;
  end if;

  -- ── Charges, once, for the whole order ────────────────────────────────────
  --
  -- Skipped on the transfer path, which has already written this order's CHARGES
  -- row as part of §6 step 6. Writing one here as well debited every short entry
  -- twice — the defect this migration exists to fix.
  if v_opens_short then
    v_balance := (select available_cash from public.funds where user_id = v_order.user_id);
  else
    v_balance := public.post_ledger(v_order.user_id, 'CHARGES', -v_charges, p_order_id,
                                    'Charges on the fill');
  end if;

  -- ── Settle a cover, capping the loss per §6 ───────────────────────────────
  if v_close_quantity > 0 and v_order.side = 'BUY' then
    if v_settlement < 0 and (v_balance + v_settlement) < 0 then
      -- §6: the position still closes, and cash floors at zero.
      --
      -- The credit is written FIRST and the full loss second, which is the only
      -- order that works: `funds_available_cash_non_negative` and
      -- `fund_ledger_balance_after_non_negative` are non-deferrable CHECKs, so
      -- debiting the whole loss and crediting the shortfall back would be
      -- refused with 23514 on the intermediate row.
      --
      -- The REALISED_PNL row carries the loss in full and the adjustment carries
      -- exactly the part the account could not cover, so identity 1 still holds
      -- and the divergence from a real broker is auditable rather than hidden in
      -- a partial debit.
      v_capped := -(v_balance + v_settlement);
      perform public.post_ledger(v_order.user_id, 'SIMULATION_ADJUSTMENT', v_capped, p_order_id,
                                 'Loss beyond the account balance, absorbed by the simulator');
      perform public.post_ledger(v_order.user_id, 'REALISED_PNL', v_settlement, p_order_id,
                                 'Settlement of the covered short, capped at the account balance');
    else
      perform public.post_ledger(v_order.user_id, 'REALISED_PNL', v_settlement, p_order_id,
                                 'Settlement of the covered short');
    end if;
  end if;

  -- ── The opening leg ───────────────────────────────────────────────────────
  if v_open_quantity > 0 and v_order.side = 'BUY' then
    perform public.post_ledger(v_order.user_id, 'BUY_DEBIT',
                               -round(v_open_quantity::numeric * v_price, 2), p_order_id,
                               'Cost of the purchase');
  end if;

  -- ── Holdings and positions (§8) ───────────────────────────────────────────
  if v_order.product = 'CNC' then
    if v_order.side = 'BUY' then
      -- §8: charges capitalise INTO the average, matching how a broker reports
      -- cost basis.
      insert into public.holdings (user_id, symbol, quantity, average_price)
      values (v_order.user_id, v_order.symbol, v_open_quantity,
              round((round(v_open_quantity::numeric * v_price, 2) + v_open_charges)
                    / v_open_quantity::numeric, 2))
      on conflict (user_id, symbol) do update
        set quantity = public.holdings.quantity + excluded.quantity,
            average_price = round(
              (public.holdings.quantity * public.holdings.average_price
                + round(excluded.quantity::numeric * v_price, 2) + v_open_charges)
              / (public.holdings.quantity + excluded.quantity)::numeric, 2);

    elsif v_holding.quantity = v_close_quantity then
      -- §12.5: a row that reaches zero is deleted, never retained at zero.
      delete from public.holdings
       where user_id = v_order.user_id and symbol = v_order.symbol;
    else
      -- §8: a partial close leaves `average_price` alone.
      update public.holdings
         set quantity = quantity - v_close_quantity
       where user_id = v_order.user_id and symbol = v_order.symbol;
    end if;

  elsif v_new_net = 0 then
    delete from public.positions
     where user_id = v_order.user_id and symbol = v_order.symbol and product = 'MIS';

  elsif v_close_quantity > 0 and v_open_quantity = 0 then
    -- A pure partial close. Quantity moves, both averages stay put, and
    -- `opened_at` is deliberately not reset (§8, §10).
    update public.positions
       set net_quantity = v_new_net,
           realised_pnl = realised_pnl + v_realised
     where user_id = v_order.user_id and symbol = v_order.symbol and product = 'MIS';

  elsif v_new_net > 0 then
    -- A long, either fresh, added to, or flipped from a short. The flip's
    -- collateral was already released above, and a long may carry neither
    -- collateral nor a gross reference price.
    v_new_average := case
      when v_net > 0 then round(
        (v_net * v_position.average_price
          + round(v_open_quantity::numeric * v_price, 2) + v_open_charges)
        / v_new_net::numeric, 2)
      else round(
        (round(v_open_quantity::numeric * v_price, 2) + v_open_charges)
        / v_open_quantity::numeric, 2)
    end;

    insert into public.positions
      (user_id, symbol, product, net_quantity, average_price, entry_reference_price,
       blocked_margin, realised_pnl)
    values (v_order.user_id, v_order.symbol, 'MIS', v_new_net, v_new_average, null, 0, v_realised)
    on conflict (user_id, symbol, product) do update
      set net_quantity = v_new_net,
          average_price = v_new_average,
          entry_reference_price = null,
          blocked_margin = 0,
          realised_pnl = public.positions.realised_pnl + v_realised;

  else
    -- A short, either fresh, added to, or flipped from a long. §8: a short's
    -- average is net PROCEEDS per share, so charges lower it. Applying the long
    -- formula here makes entry charges reappear as profit.
    v_new_average := case
      when v_net < 0 then round(
        ((-v_net) * v_position.average_price
          + round(v_open_quantity::numeric * v_price, 2) - v_open_charges)
        / (-v_new_net)::numeric, 2)
      else round(
        (round(v_open_quantity::numeric * v_price, 2) - v_open_charges)
        / v_open_quantity::numeric, 2)
    end;

    insert into public.positions
      (user_id, symbol, product, net_quantity, average_price, entry_reference_price,
       blocked_margin, realised_pnl)
    values (v_order.user_id, v_order.symbol, 'MIS', v_new_net, v_new_average,
            v_transfer.entry_reference_price, v_transfer.required_collateral, v_realised)
    on conflict (user_id, symbol, product) do update
      set net_quantity = v_new_net,
          average_price = v_new_average,
          entry_reference_price = v_transfer.entry_reference_price,
          blocked_margin = v_transfer.required_collateral,
          realised_pnl = public.positions.realised_pnl + v_realised;
  end if;

  -- ── The trade, and the transition ─────────────────────────────────────────
  insert into public.trades
    (user_id, order_id, symbol, side, product, quantity, price, charges, charge_breakdown,
     realised_pnl)
  values (v_order.user_id, p_order_id, v_order.symbol, v_order.side, v_order.product,
          v_order.quantity, v_price, v_charges, v_breakdown, v_realised);

  update public.orders
     set status = 'COMPLETE',
         filled_quantity = v_order.quantity,
         average_price = v_price,
         executed_at = clock_timestamp()
   where id = p_order_id;
end;
$$;
