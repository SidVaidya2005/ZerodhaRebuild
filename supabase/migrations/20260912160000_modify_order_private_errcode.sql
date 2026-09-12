-- `modify_order`: the re-reservation failure gets its own SQLSTATE.
--
-- The Phase 5 checkpoint review found this. The subtransaction raised
-- `P0001` to signal "the new terms cannot be covered" and then caught
-- `P0001` to turn it into `INSUFFICIENT_FUNDS` — but `P0001` (`raise_exception`)
-- is the *default* SQLSTATE for any bare `RAISE EXCEPTION` in PL/pgSQL. Any such
-- error raised inside `release_margin`, inside `reserve_margin`, or by a trigger
-- on `orders` within that block was therefore caught by this handler and
-- reported to the user as a margin shortfall, whatever it actually was.
--
-- `20260911150000_flip_settles_before_reserving.sql` reasoned through exactly
-- this hazard for `execute_order` and minted `ZR001` for it; `modify_order` was
-- reproduced whole at 20260906110000 without the same treatment. This aligns
-- them: one project-private code, raised and caught in one place each, so the
-- handler can only ever catch the condition it was written for.
--
-- Everything else is the definition from
-- 20260906110000_modify_order_holding_preflight.sql, reproduced whole because a
-- migration cannot patch a function in place. `create or replace` keeps the
-- existing ACL, and the signature is unchanged, so no re-grant is needed.

create or replace function public.modify_order(
  p_order_id uuid,
  p_quantity integer,
  p_limit_price numeric default null
)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_order public.orders%rowtype;
  v_holding integer;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'modify_order: no authenticated user' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;

  -- Scoped by the same predicate RLS would apply, because `security definer`
  -- bypasses it. Returning the same answer for "does not exist" and "is not
  -- yours" declines to confirm that an id exists — the shape `cancel_order`
  -- already uses.
  if not found or v_order.user_id <> v_user_id then
    return query select false, 'NOT_FOUND'::text;
    return;
  end if;

  -- §4: OPEN is the only status any transition may start from, re-checked after
  -- the lock. A modify racing a fill loses cleanly here rather than rewriting the
  -- terms of an order that has already executed against the old ones.
  if v_order.status <> 'OPEN' then
    return query select false, 'NOT_OPEN'::text;
    return;
  end if;

  -- A MARKET order cannot rest in OPEN — `place_order` executes it in the same
  -- transaction — so in practice this is unreachable. It is checked anyway
  -- because `orders_limit_price_presence` would refuse the row with a raw 23514,
  -- and a caller deserves a code rather than a constraint name.
  if (v_order.order_type = 'LIMIT') <> (p_limit_price is not null) then
    return query select false, 'NOT_MODIFIABLE'::text;
    return;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    return query select false, 'INVALID_QUANTITY'::text;
    return;
  end if;

  -- §8: CNC shorting does not exist, and the same rule has to hold at both entry
  -- points. `place_order` refuses these terms outright, and `reserve_margin`
  -- reserves nothing for a CNC sell — so without this a modify was the one way to
  -- get an over-sized delivery sell resting on the book. `execute_order` re-checks
  -- under the lock regardless, because the holding can be sold from under a
  -- resting order after this returns.
  if v_order.side = 'SELL' and v_order.product = 'CNC' then
    select coalesce(quantity, 0) into v_holding
      from public.holdings
     where user_id = v_user_id and symbol = v_order.symbol;

    if coalesce(v_holding, 0) < p_quantity then
      return query select false, 'NO_HOLDING'::text;
      return;
    end if;
  end if;

  begin
    perform public.release_margin(p_order_id);

    update public.orders
       set quantity = p_quantity,
           limit_price = p_limit_price
     where id = p_order_id;

    if not public.reserve_margin(p_order_id) then
      -- Rolls back this block only: the release above, the new terms, and the
      -- MARGIN_RELEASE ledger row all disappear together.
      raise exception 'modify_order: cannot cover the new terms'
        using errcode = 'ZR001';
    end if;
  exception
    when sqlstate 'ZR001' then
      return query select false, 'INSUFFICIENT_FUNDS'::text;
      return;
  end;

  return query select true, null::text;
end;
$$;

comment on function public.modify_order(uuid, integer, numeric) is
  'Changes the quantity and limit price of the caller''s own OPEN order, re-reserving margin for the new terms through release_margin + reserve_margin so trading-contract.md §6 stays written in one place. Returns (ok, reason): NOT_FOUND when it is not the caller''s or does not exist, NOT_OPEN once it has left OPEN, NOT_MODIFIABLE for a limit price that does not match the order type, INVALID_QUANTITY, NO_HOLDING when a CNC sell would exceed the holding, or INSUFFICIENT_FUNDS — in which case a subtransaction has rolled the whole attempt back and the order keeps its original terms and reservation. Derives the user from auth.uid().';
