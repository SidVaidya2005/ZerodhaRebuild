-- What the tick refreshes, and who may ask.
--
-- The Edge Function itself is verified by invoking it; what belongs here is the
-- decision it delegates to the database — which symbols are worth a request this
-- minute, in what order, and bounded by what.
begin;
select plan(22);

-- ── Who may call it ─────────────────────────────────────────────────────────
-- It reads every user's holdings, positions and watchlists and is `security
-- definer`, so a callable copy would be a cross-user read.

select has_function(
  'public', 'select_demanded_symbols', array['integer'],
  'the demand function exists'
);

select ok(
  not has_function_privilege('authenticated', 'public.select_demanded_symbols(integer)', 'execute'),
  'a signed-in user cannot call it'
);

select ok(
  not has_function_privilege('anon', 'public.select_demanded_symbols(integer)', 'execute'),
  'and neither can an anonymous one'
);

select is(
  (select prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'select_demanded_symbols'),
  true,
  'it runs as its owner, which is why the grants above matter'
);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- The universe is already seeded, so these use real symbols. The bootstrap
-- trigger creates each user's profile, funds and default watchlist.

insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-000000000001', 'demand-a@example.com'),
  ('20000000-0000-0000-0000-000000000002', 'demand-b@example.com');

-- **Clear every source, not just this fixture's rows.** The tick asks what the
-- whole system wants refreshed, so `select_demanded_symbols` has no user filter
-- and any assertion about its result is an assertion about the entire database.
-- Scoping these deletes to the two fixture users passed only while the one real
-- account happened to hold an empty watchlist; the moment it was backfilled,
-- eight of its symbols appeared in a `bag_eq` that named two. Safe because the
-- suite runs inside a transaction that always rolls back.
delete from public.watchlist_items;
delete from public.symbol_demand;
delete from public.holdings;
delete from public.positions;
delete from public.orders;

insert into public.watchlist_items (user_id, symbol, sort_order) values
  ('20000000-0000-0000-0000-000000000001', 'RELIANCE', 0),
  ('20000000-0000-0000-0000-000000000002', 'RELIANCE', 0),
  ('20000000-0000-0000-0000-000000000002', 'INFY', 1);

-- ── Watchlists are part of the union ────────────────────────────────────────
-- Without this the function returns nothing until F18 ships touch_symbol_demand,
-- and the tick's whole write path would ship untested.

select bag_eq(
  $$select symbol from public.select_demanded_symbols(50)$$,
  $$values ('RELIANCE'), ('INFY')$$,
  'a watched symbol is demanded'
);

select is(
  (select count(*)::int from public.select_demanded_symbols(50) where symbol = 'RELIANCE'),
  1,
  'a symbol two people watch is requested once, not twice'
);

-- ── Priority ordering ───────────────────────────────────────────────────────

insert into public.orders (id, user_id, symbol, side, order_type, product, quantity, status)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        '20000000-0000-0000-0000-000000000001', 'TCS', 'BUY', 'MARKET', 'CNC', 10, 'OPEN');

insert into public.holdings (user_id, symbol, quantity, average_price)
values ('20000000-0000-0000-0000-000000000001', 'SBIN', 5, 800.00);

select is(
  (select symbol from public.select_demanded_symbols(50) limit 1),
  'TCS',
  'an open order is refreshed first — a price change may fill it this minute'
);

select is(
  (select priority from public.select_demanded_symbols(50) where symbol = 'SBIN'),
  10::smallint,
  'a holding outranks a watchlist entry: its P&L is wrong until it refreshes'
);

select cmp_ok(
  (select priority from public.select_demanded_symbols(50) where symbol = 'SBIN'), '>',
  (select priority from public.select_demanded_symbols(50) where symbol = 'INFY'),
  'and a watchlist-only symbol ranks below it'
);

-- ── The cap ─────────────────────────────────────────────────────────────────
-- Batch size is bounded by the limiter, never by the size of the universe: the
-- run must finish inside ten seconds, and once a real provider exists a burst
-- across 200 symbols is what got Yahoo to block this machine during F14.

insert into public.symbol_demand (symbol, priority)
select symbol, 0 from public.instruments
on conflict (symbol) do nothing;

select is(
  (select count(*)::int from public.select_demanded_symbols(50)),
  50,
  'two hundred demanded symbols yield exactly the cap'
);

select is(
  (select count(*)::int from public.select_demanded_symbols(3)),
  3,
  'and the cap is the argument, not a constant baked into the function'
);

select is(
  (select count(*)::int from public.select_demanded_symbols(0)),
  0,
  'a zero cap asks for nothing rather than erroring'
);

-- ── Only tradable instruments ───────────────────────────────────────────────

update public.instruments set is_active = false where symbol = 'RELIANCE';

select is(
  (select count(*)::int from public.select_demanded_symbols(200) where symbol = 'RELIANCE'),
  0,
  'a delisted symbol is never sent to a provider, however much it is watched'
);

-- ── Rolling the previous close ──────────────────────────────────────────────
-- `quotes.prev_close` is what a day change divides by and what the simulator's
-- ±5% band is measured from. Seeded from bhavcopy and never advanced, it would
-- pin both to the day the universe was seeded.

select has_function(
  'public', 'roll_previous_close', array['date'],
  'the roll function exists'
);

select ok(
  not has_function_privilege('authenticated', 'public.roll_previous_close(date)', 'execute'),
  'a signed-in user cannot rewrite every price''s baseline'
);

select ok(
  not has_function_privilege('anon', 'public.roll_previous_close(date)', 'execute'),
  'and neither can an anonymous one'
);

delete from public.quotes;

-- Three rows: one from a previous session, one already written today, and one
-- whose previous close already equals its last price.
insert into public.quotes (symbol, ltp, prev_close, provider, fetched_at) values
  ('RELIANCE', 1400.00, 1316.00, 'SIMULATOR', '2026-08-20T10:00:00+05:30'),
  ('TCS',      3100.00, 3000.00, 'SIMULATOR', '2026-08-21T10:00:00+05:30'),
  ('INFY',      900.00,  900.00, 'SIMULATOR', '2026-08-20T10:00:00+05:30');

select is(
  public.roll_previous_close('2026-08-21'),
  1,
  'only the stale row with something to roll is touched'
);

select is(
  (select prev_close from public.quotes where symbol = 'RELIANCE'),
  1400.00::numeric,
  'a previous session''s last price becomes this session''s previous close'
);

select is(
  (select prev_close from public.quotes where symbol = 'TCS'),
  3000.00::numeric,
  'a row already written this session is left alone'
);

select is(
  public.roll_previous_close('2026-08-21'),
  0,
  'running it again in the same session rolls nothing — the tick calls it every minute'
);

-- A symbol nobody demanded for several sessions: the honest previous close is
-- the last price actually observed, so its day change reads as zero rather than
-- being invented from a figure no one saw.
select is(
  public.roll_previous_close('2026-09-01'),
  1,
  'a gap of several sessions still rolls from the last price actually seen'
);

select is(
  (select prev_close from public.quotes where symbol = 'TCS'),
  3100.00::numeric,
  'and it rolls to that price, not to anything interpolated for the sessions missed'
);

select * from finish();
rollback;
