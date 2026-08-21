-- Give accounts that bootstrapped before F14 the watchlist they should have had.
--
-- A build-order artifact, not a defect in the trigger. `handle_new_user()` seeds
-- the default watchlist by intersecting a fixed symbol list against
-- `instruments` — deliberately, because F13 ships before F14 and a plain insert
-- would violate the foreign key. Any account created in that window therefore
-- got zero watchlist rows, and the only account on this project was created at
-- 14:11 UTC on 2026-08-21, about an hour before the universe was seeded.
--
-- It surfaced here because F16's demand union reads `watchlist_items`: with the
-- table empty, `select_demanded_symbols` returns nothing and the tick refreshes
-- nothing, whatever else is correct. F18's sidebar and F20's pill would have hit
-- the same emptiness later, with less to point at.
--
-- One-shot and idempotent. The symbol list is repeated from
-- `20260821140332_account_bootstrap.sql` rather than factored out: this runs
-- once, against accounts that already exist, so it cannot drift from a future
-- edit to the default the way a shared reader would have to be kept in step.

insert into public.watchlist_items (user_id, symbol, sort_order)
select p.id, i.symbol, (w.ord - 1)::smallint
  from public.profiles p
 cross join unnest(array[
         'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
         'SBIN', 'BHARTIARTL', 'ITC', 'LT', 'KOTAKBANK'
       ]) with ordinality as w (symbol, ord)
  join public.instruments i on i.symbol = w.symbol
 -- Only accounts with nothing at all. Someone who has curated their watchlist
 -- down to two symbols since signup must not have eight pushed back onto it.
 where not exists (
         select 1 from public.watchlist_items existing where existing.user_id = p.id
       )
on conflict (user_id, symbol) do nothing;
