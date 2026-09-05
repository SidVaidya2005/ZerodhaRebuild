-- `square_off_mis`: intraday positions do not survive the day.
--
-- Feature 29, trading-contract.md §10. At or after 15:20 IST every open MIS
-- position is exited at the last traded price, releasing its collateral and
-- deleting the row — the same thing a user exit does, which is exactly why this
-- function performs no settlement of its own.
--
-- **The exit is a real order, filled by `execute_order`.** `architecture.md`'s
-- invariant admits no other route: a square-off is a fill, and fills happen only
-- there. So this writes a MARKET order for the position's quantity and calls
-- `execute_order` on it, inheriting §3's charges, §6's collateral release, §7's
-- ledger rows, §9's realised P&L and §6's loss cap without restating any of them.
-- The order row is visible on the Orders page under Executed, which is also how
-- Kite presents an auto square-off.
--
-- No margin is reserved for it. The exit is entirely a closing leg, so there is
-- nothing to reserve — `reserve_margin` is never called and `blocked_margin`
-- stays 0.
create or replace function public.square_off_mis(p_at timestamptz default now())
returns table (squared integer, faulted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_position record;
  v_exit_id uuid;
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
      -- A long is closed by selling, a short by buying back.
      insert into public.orders
        (user_id, symbol, side, order_type, product, quantity, blocked_margin)
      values (
        v_position.user_id,
        v_position.symbol,
        case when v_position.net_quantity > 0 then 'SELL' else 'BUY' end::public.order_side,
        'MARKET',
        'MIS',
        abs(v_position.net_quantity),
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
  'Exits every open MIS position at the last traded price at or after 15:20 IST, per trading-contract.md §10. A no-op before then and on a holiday, so it is safe to run every minute. Performs no settlement of its own: it writes a MARKET exit order and calls execute_order, which releases the collateral, writes the ledger and applies §6''s loss cap. Flags the resulting trade is_auto_squareoff. A stale quote rejects the exit with NO_QUOTE and the next run retries it. Internal-only — the market-tick Edge Function calls it as the service role.';

revoke execute on function public.square_off_mis(timestamptz) from public, anon, authenticated;
