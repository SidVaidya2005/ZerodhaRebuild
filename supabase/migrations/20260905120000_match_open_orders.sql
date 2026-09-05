-- `match_open_orders`: the resting side of the order book.
--
-- Feature 28. A LIMIT order placed away from the market rests as `OPEN` and
-- waits for a quote to cross it (trading-contract.md §5). This is the function
-- that notices, and it is called once per `market-tick` run, after the quote
-- upsert and inside the session gate — the gate is in the Edge Function because
-- `pg_cron`'s window cannot express 09:15–15:30 or a trading holiday.
--
-- **It contains no fill logic and no pricing.** `execute_order` is the only
-- place a fill happens (CLAUDE.md), and it is already safe to call on any open
-- order: it re-checks `status = 'OPEN'` and re-checks limit eligibility under
-- the row lock, so an order that is no longer crossing simply returns. The
-- selection below is therefore an **optimisation, not a correctness boundary** —
-- it exists to avoid taking row locks on orders that would decline anyway. A
-- bug in the predicate here can cost a fill a tick; it cannot cause a wrong one.
create or replace function public.match_open_orders()
returns table (filled integer, faulted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_status public.order_status;
  v_stale_ms integer;
  v_filled integer := 0;
  v_faulted integer := 0;
begin
  select quote_stale_after_ms into v_stale_ms from public.market_constants();

  -- Ordered by `placed_at`, and the ordering is load-bearing twice over.
  --
  -- Fairness: when a user's cash covers only one of two crossing orders, the
  -- one that has been resting longer fills. That is the exchange's own
  -- time-priority rule, and without an ORDER BY the loser would be arbitrary.
  --
  -- Deadlock avoidance: two simultaneous runs take the same order-row locks in
  -- the same sequence, so neither can hold what the other needs next. `id` is
  -- the tiebreak, because `clock_timestamp()` makes ties unlikely rather than
  -- impossible.
  --
  -- The staleness filter mirrors §5: a quote older than the window cannot price
  -- a fill, so selecting the order would only take a lock for `execute_order`
  -- to release.
  for v_order in
    select o.id
      from public.orders o
      join public.quotes q on q.symbol = o.symbol
     where o.status = 'OPEN'
       and o.order_type = 'LIMIT'
       and extract(epoch from (now() - q.fetched_at)) * 1000 <= v_stale_ms
       and (
         (o.side = 'BUY' and q.ltp <= o.limit_price)
         or (o.side = 'SELL' and q.ltp >= o.limit_price)
       )
     order by o.placed_at, o.id
  loop
    -- One subtransaction per order, the same shape `modify_order` uses (F27).
    -- A genuine fault rolls back that order alone and the run continues: the
    -- alternative lets one poisoned order block every user's fills on every
    -- tick until someone notices. Business rejections do not come through here
    -- — `execute_order` files those as REJECTED rows and returns normally.
    begin
      perform public.execute_order(v_order.id);

      -- `execute_order` returning is not the same as a fill. It returns without
      -- writing when a concurrent run already took the order, and it files a
      -- REJECTED row when the cash is gone. Read the status back so the count
      -- means what it says.
      select status into v_status from public.orders where id = v_order.id;
      if v_status = 'COMPLETE' then
        v_filled := v_filled + 1;
      end if;
    exception
      when others then
        raise warning 'match_open_orders: order % faulted: %', v_order.id, sqlerrm;
        v_faulted := v_faulted + 1;
    end;
  end loop;

  return query select v_filled, v_faulted;
end;
$$;

comment on function public.match_open_orders() is
  'Fills every resting LIMIT order whose symbol''s current quote has crossed it, oldest first, per trading-contract.md §5. Contains no fill logic: it calls execute_order, which re-checks status and eligibility under the row lock, so the selection here is an optimisation rather than a correctness boundary. Each call sits in its own subtransaction, so a faulting order cannot stop the run. Returns the number that reached COMPLETE and the number that faulted. Internal-only — the market-tick Edge Function calls it as the service role, inside the session gate.';

-- `security definer` bypasses RLS, so a callable helper is a hole: it fills
-- other people's orders. Internal-only, per code-standards.md's grant list.
revoke execute on function public.match_open_orders() from public, anon, authenticated;
