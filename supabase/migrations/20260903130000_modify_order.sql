-- The fourth function a browser may call, and the one `code-standards.md`'s
-- grant list has named since F11 without anything building it.
--
-- F24 filed it against F27 rather than inventing it into scope: an order's terms
-- are only modifiable while it is OPEN, and until F26 there was no way to place
-- an order that rested. There is now.
--
-- **Only `quantity` and `limit_price` move.** Side, product, order type and
-- symbol are not modifiable, because changing any of them is a different order
-- with a different reservation and a different pre-flight — cancel and re-place
-- is the honest way to express that, and it is one click away.

-- ---------------------------------------------------------------------------
-- modify_order
-- ---------------------------------------------------------------------------
--
-- Returns `(ok, reason)` rather than a bare boolean. A modify has four distinct
-- ways to decline and only one of them is about money; collapsing them into
-- `false` would leave the Server Action unable to say which, and
-- `code-standards.md` requires the user see mapped copy rather than a guess.
--
-- **The re-reservation reuses `reserve_margin`.** New terms mean a new
-- requirement, and §6 is the only place that knows how to compute one — a short
-- reserves collateral rather than notional, a buy against an open short reserves
-- only its opening quantity, and an MIS sell reserves only its shorting excess.
-- Recomputing any of that here would be the second copy of the formula that
-- `constraints.md` → Charges rules out, and it would drift the first time §6
-- changed. So the sequence is: release, write the new terms, reserve again.
--
-- The order matters and is forced from both ends. `reserve_margin` returns early
-- when `blocked_margin <> 0`, so it cannot be called before the release — it
-- would report success having reserved nothing against the new quantity. And the
-- terms have to be written before the reserve, because `reserve_margin` reads
-- them off the row rather than taking them as arguments.
--
-- **The EXCEPTION block is what makes a failed modify free.** A plpgsql block
-- with an exception handler is a subtransaction: raising inside it rolls back
-- everything the block wrote — the release, the new terms, the ledger row — and
-- execution continues at the handler. So an unaffordable modify leaves the order
-- on its original terms *and* holding its original reservation, and reports that
-- normally. Without it the alternatives are both worse: raise and abort the
-- whole RPC, which makes a business outcome travel as a fault, or pre-compute
-- the requirement, which is the duplicated formula above.
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
        using errcode = 'P0001';
    end if;
  exception
    when sqlstate 'P0001' then
      return query select false, 'INSUFFICIENT_FUNDS'::text;
      return;
  end;

  return query select true, null::text;
end;
$$;

comment on function public.modify_order(uuid, integer, numeric) is
  'Changes the quantity and limit price of the caller''s own OPEN order, re-reserving margin for the new terms through release_margin + reserve_margin so trading-contract.md §6 stays written in one place. Returns (ok, reason): NOT_FOUND when it is not the caller''s or does not exist, NOT_OPEN once it has left OPEN, NOT_MODIFIABLE for a limit price that does not match the order type, INVALID_QUANTITY, or INSUFFICIENT_FUNDS — in which case a subtransaction has rolled the whole attempt back and the order keeps its original terms and reservation. Derives the user from auth.uid().';

-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- The fourth exception in code-standards.md's grant policy, on the same terms as
-- the other three: a Server Action calls it on the user's behalf, and it reads
-- auth.uid() rather than trusting an argument.
grant execute on function public.modify_order(uuid, integer, numeric) to authenticated;
revoke execute on function public.modify_order(uuid, integer, numeric) from public, anon;
