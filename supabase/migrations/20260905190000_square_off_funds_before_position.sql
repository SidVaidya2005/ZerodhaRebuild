-- `square_off_mis` takes the funds row before the position row.
--
-- The position re-read added in 20260905180000 fixed a double-exit but created a
-- lock-order inversion, because it is held across the `execute_order` call:
--
--   execute_order    orders → funds → positions
--   square_off_mis   positions → [execute_order] → funds
--
-- Every other caller of `execute_order` — the order ticket, the matcher, a user
-- exit — takes funds first. Two transactions touching the same user's same MIS
-- symbol therefore closed an ABBA cycle, reproduced deterministically by
-- `squareoff-lockorder.race.test.ts`: the sweep was the victim, `exception when
-- others` swallowed the 40P01 as a fault, and the position stayed open past
-- 15:20 — which architecture.md states cannot happen. The other victim ordering
-- is no better: `execute_order` has no handler, so the user's own order fails
-- with a raw deadlock error they did nothing to cause.
--
-- The fix is ordering, not more locking. Taking the funds row first makes this
-- function's acquisition sequence a prefix of `execute_order`'s, so the two can
-- only ever queue. Two concurrent sweeps are unaffected: the loop's `order by`
-- is unchanged, so they still walk positions in the same sequence.
--
-- Reproduced whole because a migration cannot patch a function in place.

create or replace function public.square_off_mis(p_at timestamptz default now())
returns table (squared integer, faulted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position record;
  v_exit_id uuid;
  v_net integer;
  v_status public.order_status;
  v_minutes integer;
  v_square_off integer;
  v_squared integer := 0;
  v_faulted integer := 0;
begin
  -- Not a session, nothing to square off. This covers weekends, holidays and
  -- any hour outside 09:15–15:30 in one check. The Edge Function gates on the
  -- same thing, but this function is callable directly in tests and states its
  -- own precondition rather than trusting its caller.
  if public.market_state(p_at) <> 'OPEN' then
    return query select 0, 0;
    return;
  end if;

  -- Minute-of-day in IST, from the same constants the Edge Function reads.
  -- A no-op before 15:20 (§10), so the job is safe to run every minute.
  select (extract(epoch from (p_at + (c.ist_offset_minutes * interval '1 minute')))::bigint
          % 86400) / 60,
         c.square_off_ist
    into v_minutes, v_square_off
    from public.market_constants() c;

  if v_minutes < v_square_off then
    return query select 0, 0;
    return;
  end if;

  -- Oldest position first, for the same two reasons the matcher orders its
  -- sweep: a deterministic sequence under contention, and two simultaneous runs
  -- taking the same row locks in the same order so neither blocks the other's
  -- next acquisition. CNC is untouched — a holding is not an intraday position.
  for v_position in
    select p.user_id, p.symbol, p.net_quantity
      from public.positions p
     where p.product = 'MIS'
       and p.net_quantity <> 0
     order by p.opened_at, p.user_id, p.symbol
  loop
    begin
      -- Take the funds row FIRST, before the position row below.
      --
      -- `execute_order` locks funds and then positions; this function holds its
      -- position lock across the `execute_order` call it makes, so acquiring
      -- them the other way round closes a deadlock cycle with any concurrent
      -- order on the same user and symbol. Ordering is the whole point of this
      -- statement — the lock itself is redundant, since `execute_order` takes
      -- the same row a few lines later.
      --
      -- Deliberately outside the `not found` check below: a position that
      -- another run has already closed still has to have passed through here in
      -- the same order, or the ordering guarantee holds only for some rows.
      perform 1 from public.funds where user_id = v_position.user_id for update;

      -- Re-read the position under its own lock before writing anything.
      --
      -- The sweep above takes no locks, so two overlapping runs both select the
      -- same position. Without this the second one writes its exit order anyway,
      -- and `execute_order` — finding no position left to close — treats that
      -- SELL as *opening* a short: the job would create a naked position at
      -- 15:20 and block collateral against it. This is the same guard
      -- `execute_order` applies to an order's status, for the same reason, and
      -- the row lock is what makes the second run wait rather than guess.
      select net_quantity into v_net
        from public.positions
       where user_id = v_position.user_id
         and symbol = v_position.symbol
         and product = 'MIS'
         for update;

      if not found or v_net = 0 then
        -- Another run closed it while this one was waiting. Not a fault.
        continue;
      end if;

      -- A long is closed by selling, a short by buying back. `v_net`, not the
      -- quantity the sweep selected: a concurrent fill on this symbol may have
      -- committed while this iteration waited for the locks above, and the
      -- re-read under the lock is the quantity that is actually open.
      insert into public.orders
        (user_id, symbol, side, order_type, product, quantity, blocked_margin)
      values (
        v_position.user_id,
        v_position.symbol,
        case when v_net > 0 then 'SELL' else 'BUY' end::public.order_side,
        'MARKET',
        'MIS',
        abs(v_net),
        0
      )
      returning id into v_exit_id;

      perform public.execute_order(v_exit_id);

      select status into v_status from public.orders where id = v_exit_id;

      if v_status = 'COMPLETE' then
        -- Flagged here rather than inside `execute_order`, so the one function
        -- every order path depends on keeps its signature and its proof surface.
        -- Same transaction as the fill, so the two are atomic.
        update public.trades set is_auto_squareoff = true where order_id = v_exit_id;
        v_squared := v_squared + 1;
      end if;
      -- A REJECTED exit is not a fault. The only reachable reason is NO_QUOTE:
      -- §5 refuses to price a fill off a stale quote, and this job runs every
      -- minute until 15:30, so the position squares off on a later run. The
      -- rejected order row stays as the record of the attempt.
    exception
      when others then
        raise warning 'square_off_mis: position %/% faulted: %',
          v_position.user_id, v_position.symbol, sqlerrm;
        v_faulted := v_faulted + 1;
    end;
  end loop;

  return query select v_squared, v_faulted;
end;
$$;

comment on function public.square_off_mis(timestamptz) is
  'Exits every open MIS position at the last traded price at or after 15:20 IST, per trading-contract.md §10. A no-op before then and on a holiday, so it is safe to run every minute. Performs no settlement of its own: it writes a MARKET exit order and calls execute_order, which releases the collateral, writes the ledger and applies §6''s loss cap. Flags the resulting trade is_auto_squareoff. Locks the user''s funds row before the position row, matching execute_order''s order, so a concurrent order on the same position queues instead of deadlocking. A stale quote rejects the exit with NO_QUOTE and the next run retries it. Internal-only — the market-tick Edge Function calls it as the service role.';

revoke execute on function public.square_off_mis(timestamptz) from public, anon, authenticated;
