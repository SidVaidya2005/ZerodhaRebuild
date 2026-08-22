-- The view filtered twice, and only one of the two filters was doing the work.
--
-- As first written, watchlist_rows carried `where w.user_id = (select auth.uid())`
-- *and* security_invoker. Falsifying the isolation showed the WHERE clause alone
-- was holding the line: turning security_invoker off left another user still
-- seeing nothing, because the predicate had already filtered them out. The
-- invoker setting was therefore untested, and a future edit could have dropped
-- it with every test still green.
--
-- CLAUDE.md makes RLS the security boundary rather than application code, and a
-- predicate hand-written into a view is application code. Removing it leaves one
-- mechanism — the watchlist_items_read_own policy, reached through
-- security_invoker — which is the one the rest of the schema already relies on,
-- and which the suite can now actually falsify.
create or replace view public.watchlist_rows
with (security_invoker = on) as
  select w.symbol,
         w.sort_order,
         i.name,
         i.exchange,
         i.is_active,
         q.ltp,
         q.prev_close,
         case
           when q.ltp is null or q.prev_close is null then null
           else q.ltp - q.prev_close
         end as change,
         case
           when q.ltp is null or q.prev_close is null or q.prev_close = 0 then null
           else round((q.ltp - q.prev_close) / q.prev_close * 100, 2)
         end as change_pct,
         q.provider,
         q.provider_ts,
         q.fetched_at
    from public.watchlist_items w
    join public.instruments i on i.symbol = w.symbol
    left join public.quotes q on q.symbol = w.symbol;

comment on view public.watchlist_rows is
  'The watchlist panel read, one row per watched symbol, change computed in Postgres. Rows are scoped by RLS on watchlist_items through security_invoker — the view holds no predicate of its own.';
