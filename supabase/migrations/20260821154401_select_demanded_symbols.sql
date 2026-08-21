-- Which symbols the tick refreshes.
--
-- The pipeline is demand-driven on purpose: refreshing all 200 instruments every
-- minute would burn quota on symbols nobody is looking at, and — once a real
-- provider exists — is exactly the traffic shape that got Yahoo to block this
-- machine for forty minutes during F14.
--
-- A SQL function rather than a query built in TypeScript, so pgTAP can test the
-- union and its ordering directly. The Edge Function calls it with the service
-- role and gets one bounded list back.
--
-- **Watchlists are part of the union**, which the original build plan did not
-- say. `symbol_demand` has no write path until F18 (`touch_symbol_demand` ships
-- there with its own grant and test) and nobody holds anything yet, so without
-- watchlists this function returns zero rows and the tick's entire write path —
-- the upsert, the provenance columns, `fetched_at` — ships untested. A symbol
-- someone is watching is genuinely demanded, and this stays correct after F18
-- narrows refreshes to what is actually on screen.

create or replace function public.select_demanded_symbols(p_limit int default 50)
returns table (symbol text, priority smallint)
language sql
stable
security definer
set search_path = ''
as $$
  -- Priorities are assigned here rather than read from each source, so the
  -- ordering is one decision in one place:
  --   20  open orders     — a price change may fill them this minute
  --   10  holdings/positions — P&L is wrong until they refresh, watched or not
  --    0  symbol_demand   — carries its own priority from F18
  --   -1  watchlists      — someone is looking, but nothing depends on it
  with demanded as (
    select o.symbol, 20::smallint as priority, now() as last_requested_at
      from public.orders o
     where o.status = 'OPEN'

    union all
    select h.symbol, 10::smallint, now() from public.holdings h

    union all
    select p.symbol, 10::smallint, now() from public.positions p

    union all
    select d.symbol, d.priority, d.last_requested_at from public.symbol_demand d

    union all
    select w.symbol, (-1)::smallint, now() from public.watchlist_items w
  )
  select d.symbol, max(d.priority)::smallint as priority
    from demanded d
    -- Only tradable instruments. A symbol delisted since it was watched keeps
    -- its rows elsewhere but must not be sent to a provider.
    join public.instruments i on i.symbol = d.symbol and i.is_active
   group by d.symbol
   -- Highest priority first, then most recently asked for. The cap is what keeps
   -- a run inside the ten-second budget, whatever the size of the universe.
   order by max(d.priority) desc, max(d.last_requested_at) desc, d.symbol
   limit greatest(p_limit, 0);
$$;

comment on function public.select_demanded_symbols(int) is
  'Symbols worth refreshing this tick: open orders, holdings, positions, symbol_demand and watchlists, deduplicated, ranked and capped.';

-- Internal only. It reads every user's holdings, positions and watchlists, so
-- `security definer` makes a callable copy a cross-user read. `code-standards.md`
-- grants execute on functions like this to no role at all — the Edge Function
-- reaches it with the service role, which needs no grant.
revoke execute on function public.select_demanded_symbols(int) from public, anon, authenticated;
