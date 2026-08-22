-- Feature 18's four functions and the view the panel reads.
--
-- The two denial modes are kept apart here as they are in 01-rls-identity.sql.
-- `42501` means the role holds no execute grant and never reached the function
-- body. A returned `0` means the function ran and its own guard refused. Both
-- protect touch_symbol_demand, and a test that accepted either could not say
-- which one was doing the work — so the definer guard is exercised through a
-- role that *does* hold the grant.
begin;
select plan(30);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Written as the connecting role, which owns these tables and bypasses RLS.

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true),
  ('INFY',     'Infosys Limited',             'INFY.NS',     true),
  ('NOQUOTE',  'Never Quoted Limited',        'NOQUOTE.NS',  true),
  ('GONE',     'Delisted Industries',         'GONE.NS',     false)
  on conflict (symbol) do update set is_active = excluded.is_active;

-- RELIANCE is the arithmetic case: 100 against a prev_close of 80 is +20.00 and
-- +25.00%. NOQUOTE deliberately gets no row at all, so the left join is what
-- produces its nulls.
insert into public.quotes (symbol, ltp, prev_close, provider) values
  ('RELIANCE', 100.00, 80.00, 'SIMULATOR'),
  ('INFY',      50.00, 50.00, 'SIMULATOR')
  on conflict (symbol) do update
    set ltp = excluded.ltp, prev_close = excluded.prev_close;

-- F13's bootstrap seeded each user a default list. These assertions name
-- specific rows, so start from a known-empty one.
delete from public.watchlist_items
 where user_id in (
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222'
 );

-- ── Ada: the write paths ────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select is(public.add_watchlist_item('RELIANCE'), 1, 'adding a symbol reports one row written');
select is(public.add_watchlist_item('INFY'), 1, 'adding a second symbol reports one row written');

-- The sort_order is assigned by the function, not the column default, which is
-- the whole reason reorder can work at all.
select results_eq(
  $$ select symbol, sort_order from public.watchlist_items
      where user_id = '11111111-1111-1111-1111-111111111111' order by sort_order $$,
  $$ values ('RELIANCE', 1::smallint), ('INFY', 2::smallint) $$,
  'each add takes the next sort_order rather than the default zero'
);

select is(public.add_watchlist_item('RELIANCE'), 0, 'adding a symbol already listed is a no-op');
select is(public.add_watchlist_item('NOSUCHTHING'), 0, 'adding an unknown symbol is a no-op, not an error');
select is(public.add_watchlist_item('GONE'), 0, 'a delisted symbol cannot be added');

-- ── Ada: the view ───────────────────────────────────────────────────────────

select results_eq(
  $$ select symbol from public.watchlist_rows order by sort_order $$,
  $$ values ('RELIANCE'), ('INFY') $$,
  'the view returns the caller''s own rows in sort order'
);

select results_eq(
  $$ select change, change_pct from public.watchlist_rows where symbol = 'RELIANCE' $$,
  $$ values (20.00::numeric, 25.00::numeric) $$,
  'the change and its percentage are computed in Postgres'
);

select is(public.add_watchlist_item('NOQUOTE'), 1, 'a symbol with no quote can still be watched');
select results_eq(
  $$ select ltp, change, change_pct from public.watchlist_rows where symbol = 'NOQUOTE' $$,
  $$ values (null::numeric, null::numeric, null::numeric) $$,
  'a symbol with no quote yields nulls rather than a fabricated zero'
);

-- ── Ada: reorder ────────────────────────────────────────────────────────────

select is(public.move_watchlist_item('RELIANCE', 'down'), 1, 'moving down reports the swap');
select results_eq(
  $$ select symbol from public.watchlist_rows order by sort_order $$,
  $$ values ('INFY'), ('RELIANCE'), ('NOQUOTE') $$,
  'the order after the swap is persisted, not just returned'
);

select is(public.move_watchlist_item('INFY', 'up'), 0, 'moving up from the top is a no-op');
select is(public.move_watchlist_item('NOQUOTE', 'down'), 0, 'moving down from the bottom is a no-op');
select throws_ok(
  $$ select public.move_watchlist_item('INFY', 'sideways') $$,
  '22023',
  null,
  'an unknown direction is rejected rather than guessed'
);
select is(public.move_watchlist_item('NOSUCHTHING', 'up'), 0, 'moving a symbol not on the list is a no-op');

-- ── Ada: remove ─────────────────────────────────────────────────────────────

select is(public.remove_watchlist_item('NOQUOTE'), 1, 'removing a listed symbol reports one row');
select is_empty(
  $$ select 1 from public.watchlist_rows where symbol = 'NOQUOTE' $$,
  'the removed symbol is gone from the view'
);
select is(public.remove_watchlist_item('NOSUCHTHING'), 0, 'removing a symbol not on the list is a no-op');

-- ── Ada: touch_symbol_demand ────────────────────────────────────────────────

-- Set a priority the function must not disturb. Written as the owner, because
-- no client role may write this table directly — which is the reason the
-- function needs definer rights in the first place.
reset role;
insert into public.symbol_demand (symbol, priority, last_requested_at)
values ('RELIANCE', 5, now() - interval '1 day')
  on conflict (symbol) do update
    set priority = 5, last_requested_at = now() - interval '1 day';

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select is(public.touch_symbol_demand(array['RELIANCE', 'INFY']), 2, 'touching two known symbols reports two rows');
select ok(
  (select last_requested_at > now() - interval '1 minute'
     from public.symbol_demand where symbol = 'RELIANCE'),
  'last_requested_at is moved forward'
);
select is(
  (select priority from public.symbol_demand where symbol = 'RELIANCE'), 5::smallint,
  'priority is untouched — the client cannot starve the tick of what must refresh'
);
select is(public.touch_symbol_demand(array['NOSUCHTHING']), 0, 'an unknown symbol is ignored rather than raising a foreign key error');
select throws_ok(
  $$ select public.touch_symbol_demand((select array_agg('S' || g) from generate_series(1, 201) g)) $$,
  '22023',
  null,
  'a list longer than the whole universe is refused'
);

-- ── Grace: the isolation the whole feature rests on ─────────────────────────

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is_empty(
  $$ select 1 from public.watchlist_rows $$,
  'the view shows another user nothing, because security_invoker keeps RLS on'
);
select is(public.remove_watchlist_item('RELIANCE'), 0, 'one user cannot delete another''s watchlist row');
select is(public.move_watchlist_item('RELIANCE', 'down'), 0, 'one user cannot reorder another''s watchlist');

-- ── The two denial modes, kept apart ────────────────────────────────────────

-- Granted the function, but holding no session: the guard inside is what refuses.
set local request.jwt.claim.sub = '';
select is(public.touch_symbol_demand(array['RELIANCE']), 0, 'a granted role with no session is refused by the function''s own guard');

-- Holding no grant: the request never reaches the body.
set local role anon;
select throws_ok(
  $$ select public.add_watchlist_item('RELIANCE') $$,
  '42501',
  null,
  'anon holds no execute grant on the watchlist writes'
);
select throws_ok(
  $$ select public.touch_symbol_demand(array['RELIANCE']) $$,
  '42501',
  null,
  'anon holds no execute grant on touch_symbol_demand either'
);

select * from finish();
rollback;
