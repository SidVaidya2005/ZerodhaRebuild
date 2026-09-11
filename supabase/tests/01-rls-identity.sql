-- RLS on the user-owned tables: profiles and watchlist_items.
--
-- The two denial modes are asserted separately throughout, because they are
-- different facts about the system. `is_empty()` means a policy filtered the
-- rows away — the command was allowed, it just matched nothing. `throws_ok(…,
-- '42501')` means the request never reached a policy, because the role holds no
-- grant for that command. A test that accepts either cannot tell you which layer
-- is actually protecting the row.
begin;
select plan(15);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Created as the connecting role, which owns these tables and so bypasses RLS.
-- F13's bootstrap trigger does not exist yet, so the profiles rows are written
-- by hand here.

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

-- F13's trigger created these rows on the inserts above. The fixture only
-- pins the values these assertions read; inserting them again would collide.
update public.profiles set client_id = 'ZR100001', full_name = 'Ada'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set client_id = 'ZR100002', full_name = 'Grace'
  where id = '22222222-2222-2222-2222-222222222222';

insert into public.instruments (symbol, name, yahoo_symbol) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS'),
  ('INFY', 'Infosys Limited', 'INFY.NS')
  on conflict (symbol) do nothing;

-- F13's bootstrap seeded each user a default watchlist from the F14 universe.
-- This suite asserts on specific rows, so it starts from a known-empty list
-- rather than from whatever the default happens to contain this quarter.
delete from public.watchlist_items
 where user_id in (
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222'
 );

insert into public.watchlist_items (user_id, symbol, sort_order) values
  ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 0),
  ('22222222-2222-2222-2222-222222222222', 'INFY', 0);

-- Postgres does not index a foreign key automatically. watchlist_items' primary
-- key leads with user_id, so it does not cover a lookup by symbol — and without
-- this index, ON DELETE CASCADE from instruments scans the whole table.
select has_index(
  'public', 'watchlist_items', 'watchlist_items_symbol_idx',
  'watchlist_items indexes its symbol foreign key separately from the primary key'
);

-- ── As user A ───────────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select isnt_empty(
  $$select id from public.profiles$$,
  'user A reads their own profile'
);

select is_empty(
  $$select id from public.profiles
     where id = '22222222-2222-2222-2222-222222222222'$$,
  'user A reads none of user B''s profile — the policy filters it away'
);

-- Stronger than it was, and the assertion moved with it. This used to be
-- is_empty() — RLS filtered the row away and the statement updated nothing.
-- F35 narrowed the grant to `update (theme)`, so no role can write full_name at
-- all now, on any row, and the refusal comes before the policy is consulted.
select throws_ok(
  $$update public.profiles set full_name = 'stolen'
     where id = '22222222-2222-2222-2222-222222222222'$$,
  '42501',
  null,
  'user A cannot rename user B — and since F35, cannot rename anyone including themselves'
);

select isnt_empty(
  $$update public.profiles set theme = 'light'
     where id = '11111111-1111-1111-1111-111111111111'
     returning id$$,
  'user A can change their own theme — the one column F35 leaves open'
);

-- No INSERT grant: a user who could write their own profile row could choose
-- their own client_id. F13's trigger creates it as definer instead.
select throws_ok(
  $$insert into public.profiles (id, client_id)
    values ('33333333-3333-3333-3333-333333333333', 'ZR999999')$$,
  '42501',
  null,
  'no role may insert a profile — the bootstrap trigger owns that'
);

-- No DELETE grant either: the row cascades from auth.users.
select throws_ok(
  $$delete from public.profiles
     where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'user A cannot delete their own profile row'
);

select throws_ok(
  $$update public.profiles set theme = 'solarized'
     where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'theme is constrained to light or dark by a CHECK, not only by the UI'
);

select isnt_empty(
  $$select symbol from public.watchlist_items$$,
  'user A reads their own watchlist'
);

select is_empty(
  $$select symbol from public.watchlist_items
     where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'user A reads none of user B''s watchlist'
);

select lives_ok(
  $$insert into public.watchlist_items (user_id, symbol, sort_order)
    values ('11111111-1111-1111-1111-111111111111', 'INFY', 1)$$,
  'user A adds to their own watchlist — what feature 18''s Server Action needs'
);

-- The WITH CHECK clause, not the grant: A holds INSERT, so the request reaches a
-- policy and the policy refuses the row.
select throws_ok(
  $$insert into public.watchlist_items (user_id, symbol)
    values ('22222222-2222-2222-2222-222222222222', 'RELIANCE')$$,
  '42501',
  null,
  'user A cannot plant a symbol in user B''s watchlist'
);

select is_empty(
  $$delete from public.watchlist_items
     where user_id = '22222222-2222-2222-2222-222222222222'
     returning symbol$$,
  'user A cannot delete from user B''s watchlist'
);

-- ── As a signed-out visitor ─────────────────────────────────────────────────

reset role;
set local role anon;

select throws_ok(
  $$select id from public.profiles$$,
  '42501',
  null,
  'anon holds no grant on profiles at all'
);

select throws_ok(
  $$select symbol from public.watchlist_items$$,
  '42501',
  null,
  'anon holds no grant on watchlist_items at all'
);

reset role;
select * from finish();
rollback;
