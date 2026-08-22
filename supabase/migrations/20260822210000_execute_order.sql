-- `execute_order`: the one place a fill happens.
--
-- `CLAUDE.md` makes that a standing rule, and this is the function it names.
-- Everything money-shaped that a fill does happens inside this single locked
-- statement block: pricing per §5, charges per §3, retiring the reservation
-- through F23, the trade row, the holding or position, the ledger, and the
-- status transition.
--
-- It is deliberately the longest function in the schema. The alternative —
-- splitting the four cases into four functions — would put a fill's cash
-- movements behind four separate locks and make §12.3 true only in between.

-- ---------------------------------------------------------------------------
-- One ledger row, one cash movement.
-- ---------------------------------------------------------------------------
--
-- `execute_order` writes up to five ledger rows and every one has to carry the
-- balance *after* itself (§12.2). Threading that by hand five times is how a
-- `balance_after` ends up recorded before the update that produced it, so it is
-- written once here and called.
--
-- Returns the new balance so a caller that needs to reason about headroom — the
-- capped-loss path in §6 — does not have to re-read the row it just wrote.
create or replace function public.post_ledger(
  p_user_id uuid,
  p_type public.ledger_type,
  p_amount numeric,
  p_order_id uuid,
  p_note text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(14, 2);
begin
  if p_amount = 0 then
    -- A ledger row means cash moved (§1). A zero row would be a claim that
    -- something happened, and Reports would render it.
    return (select available_cash from public.funds where user_id = p_user_id);
  end if;

  update public.funds
     set available_cash = available_cash + p_amount
   where user_id = p_user_id
  returning available_cash into v_balance;

  insert into public.fund_ledger (user_id, type, amount, balance_after, order_id, note)
  values (p_user_id, p_type, p_amount, v_balance, p_order_id, p_note);

  return v_balance;
end;
$$;

comment on function public.post_ledger(uuid, public.ledger_type, numeric, uuid, text) is
  'Moves available_cash by a signed amount and records the fund_ledger row carrying the balance after it, per trading-contract.md §12.1 and §12.2. A zero amount writes nothing — a ledger row means cash moved. Returns the new balance. Internal-only.';

-- ---------------------------------------------------------------------------
-- execute_order
-- ---------------------------------------------------------------------------
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
  -- The order splits into at most two legs. A fill that crosses zero has both.
  v_net integer;
  v_new_net integer;
  v_close_quantity integer;
  v_open_quantity integer;
  v_close_charges numeric(14, 2);
  v_open_charges numeric(14, 2);
  v_realised numeric(14, 2);
  v_settlement numeric(14, 2);
  v_transfer record;
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

  -- Locked before any balance is read, so concurrent orders serialise.
  select * into v_funds from public.funds where user_id = v_order.user_id for update;

  -- ── Price it (§5) ─────────────────────────────────────────────────────────
  select ltp, fetched_at into v_price, v_fetched_at
    from public.quotes where symbol = v_order.symbol;
  select quote_stale_after_ms into v_stale_ms from public.market_constants();

  if v_price is null
     or extract(epoch from (now() - v_fetched_at)) * 1000 > v_stale_ms then
    if v_order.order_type = 'MARKET' then
      -- §5: never filled at a stale price.
      perform public.release_margin(p_order_id);
      update public.orders
         set status = 'REJECTED', rejection_reason = 'NO_QUOTE', executed_at = now()
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
    -- OBSERVED crossing price, not at the limit — price improvement that was
    -- actually seen, never modelled.
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
           set status = 'REJECTED', rejection_reason = 'NO_HOLDING', executed_at = now()
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

  -- ── Solvency, for the opening leg only ────────────────────────────────────
  --
  -- §6 caps a cover's loss rather than refusing it, so a closing leg can never
  -- be rejected for funds — no position is ever stranded. Only fresh exposure
  -- can be, and the reservation is what it is measured against.
  if v_order.side = 'BUY'
     and (v_funds.available_cash + v_order.blocked_margin)
         < (round(v_open_quantity::numeric * v_price, 2) + v_charges) then
    -- Release BEFORE the status changes. `orders_no_margin_unless_open` encodes
    -- §12.8 and a CHECK is not deferrable, so setting the status first leaves the
    -- row momentarily REJECTED while still holding margin, and that UPDATE is
    -- refused with 23514.
    perform public.release_margin(p_order_id);
    update public.orders
       set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS', executed_at = now()
     where id = p_order_id;
    return;
  end if;

  -- ── Retire the reservation, exactly once ──────────────────────────────────
  --
  -- A fill that leaves a short open moves its collateral onto the position; every
  -- other fill returns the whole reservation to cash. The transfer runs BEFORE
  -- the trade and position rows are written, so its shortfall path has nothing
  -- to unwind.
  if v_order.side = 'SELL' and v_order.product = 'MIS' and v_new_net < 0 then
    select * into v_transfer
      from public.transfer_margin_to_position(p_order_id, v_price, v_charges);

    if not v_transfer.ok then
      update public.orders
         set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS', executed_at = now()
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
      -- Closing a long, in holdings or in a position. §12.9: a long close settles
      -- through SELL_CREDIT, never through a REALISED_PNL row.
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
      -- net `average_price` would debit those charges a second time and leave the
      -- balance short by exactly them on every cover.
      v_settlement := round(
        (v_position.entry_reference_price - v_price) * v_close_quantity::numeric, 2);

      -- §9 reports from the NET average, and is a different number on purpose.
      v_realised := round(
        (v_position.average_price - v_price) * v_close_quantity::numeric, 2) - v_close_charges;
    end if;
  end if;

  -- ── Charges, once, for the whole order ────────────────────────────────────
  v_balance := public.post_ledger(v_order.user_id, 'CHARGES', -v_charges, p_order_id,
                                  'Charges on the fill');

  -- ── Settle a cover, capping the loss per §6 ───────────────────────────────
  if v_close_quantity > 0 and v_order.side = 'BUY' then
    if v_settlement < 0 and (v_balance + v_settlement) < 0 then
      -- The position still closes. Cash floors at zero, the shortfall is booked
      -- as an auditable SIMULATION_ADJUSTMENT so identity 1 still holds, and
      -- `trades.realised_pnl` below still carries the TRUE, uncapped loss.
      v_capped := -v_balance;
      perform public.post_ledger(v_order.user_id, 'REALISED_PNL', v_capped, p_order_id,
                                 'Loss on the cover, capped at the account balance');
      perform public.post_ledger(v_order.user_id, 'SIMULATION_ADJUSTMENT',
                                 v_capped - v_settlement, p_order_id,
                                 'Loss beyond the account balance, absorbed by the simulator');
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

  -- The margin is already retired, so this UPDATE satisfies
  -- `orders_no_margin_unless_open`. `average_price` is the fill price here —
  -- the order's own record of what it filled at, not the position's basis.
  update public.orders
     set status = 'COMPLETE',
         filled_quantity = v_order.quantity,
         average_price = v_price,
         executed_at = now()
   where id = p_order_id;
end;
$$;

comment on function public.execute_order(uuid) is
  'The only place an order fills, per CLAUDE.md. One locked statement block: price per trading-contract.md §5, charges per §3, retire the reservation through F23, settle the closing and opening legs, write the trade, holding or position, ledger and status. Safe to call on any OPEN order — it re-checks the status under the lock and re-checks limit eligibility, so a limit order that is not crossing simply returns. Internal-only.';

revoke execute on function public.post_ledger(uuid, public.ledger_type, numeric, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.execute_order(uuid) from public, anon, authenticated;
