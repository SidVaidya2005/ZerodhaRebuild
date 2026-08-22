-- The signup bootstrap: what exists the moment a user is created.
--
-- Every assertion here runs against a real insert into auth.users, because the
-- trigger is the thing under test — calling handle_new_user() directly would
-- prove the body works and say nothing about whether it is wired up.
begin;
select plan(30);

-- ── The trigger is wired to the right event ─────────────────────────────────

select has_trigger(
  'auth', 'users', 'on_auth_user_created',
  'auth.users carries the bootstrap trigger'
);

select is(
  (select action_timing || ' ' || event_manipulation
     from information_schema.triggers
    where trigger_name = 'on_auth_user_created'),
  'AFTER INSERT',
  'the bootstrap fires after insert, so the user row it references already exists'
);

-- security definer bypasses RLS, so a callable copy would be a hole.
select ok(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'authenticated cannot call the bootstrap directly'
);

select ok(
  not has_function_privilege('anon', 'public.generate_client_id()', 'execute'),
  'anon cannot call the client id generator'
);

-- ── A signup with full Google metadata ──────────────────────────────────────
-- The universe is emptied first, deliberately. Before F14 it was empty by
-- accident, which made the FK-safe watchlist path below look proven when it was
-- only untested. The delete rolls back with the rest of the transaction.
--
-- Nine tables reference `instruments.symbol`, so emptying it means emptying
-- them first. This is not tidiness: from F26 the app can place orders into this
-- same database, and the first real order made this suite fail permanently with
-- `orders_symbol_fkey` — a red tier 2 caused by *using the product*. Deleting
-- the dependants here keeps the suite independent of whatever the account
-- happens to hold, and every one of these deletes rolls back with the rest.

delete from public.trades;
delete from public.orders;
delete from public.positions;
delete from public.holdings;
delete from public.watchlist_items;
delete from public.candles;
delete from public.candle_sync;
delete from public.quotes;
delete from public.symbol_demand;
delete from public.instruments;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '10000000-0000-0000-0000-000000000001',
  'ada@example.com',
  '{"full_name": "Ada Lovelace", "avatar_url": "https://example.com/ada.jpg"}'::jsonb
);

select is(
  (select count(*)::int from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'),
  1,
  'signup creates exactly one profile'
);

select matches(
  (select client_id from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'),
  '^ZR[0-9]{6}$',
  'the client id is ZR followed by exactly six digits'
);

select is(
  (select full_name from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'),
  'Ada Lovelace',
  'the name is copied from the Google identity'
);

select is(
  (select avatar_url from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'),
  'https://example.com/ada.jpg',
  'the avatar is copied from the Google identity'
);

select is(
  (select theme from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'),
  'dark',
  'the profile defaults to the dark theme'
);

-- ── The money, per trading-contract.md §11 ──────────────────────────────────

select results_eq(
  $$select available_cash, used_margin, opening_balance from public.funds
     where user_id = '10000000-0000-0000-0000-000000000001'$$,
  $$values (100000.00::numeric(14,2), 0.00::numeric(14,2), 100000.00::numeric(14,2))$$,
  'the account opens at exactly the opening balance, with no margin used'
);

select is(
  (select count(*)::int from public.fund_ledger
    where user_id = '10000000-0000-0000-0000-000000000001'),
  1,
  'exactly one ledger row exists at signup'
);

select results_eq(
  $$select type::text, amount, balance_after, order_id from public.fund_ledger
     where user_id = '10000000-0000-0000-0000-000000000001'$$,
  $$values ('SIGNUP_CREDIT', 100000.00::numeric(14,2), 100000.00::numeric(14,2), null::uuid)$$,
  'that row is the signup credit, and it belongs to no order'
);

-- §12.1 — available_cash is the sum of the ledger.
select is(
  (select sum(amount) from public.fund_ledger
    where user_id = '10000000-0000-0000-0000-000000000001'),
  (select available_cash from public.funds
    where user_id = '10000000-0000-0000-0000-000000000001'),
  'identity 12.1 holds from the first moment: the ledger sums to available cash'
);

-- §12.2 — the newest balance_after equals available_cash.
select is(
  (select balance_after from public.fund_ledger
    where user_id = '10000000-0000-0000-0000-000000000001'
    order by created_at desc limit 1),
  (select available_cash from public.funds
    where user_id = '10000000-0000-0000-0000-000000000001'),
  'identity 12.2 holds from the first moment: the newest balance_after matches'
);

-- ── The watchlist, with instruments empty ───────────────────────────────────
-- The seed must be a no-op on an empty universe rather than a foreign key
-- violation. Ada signed up above with the table emptied, which is that case.

select is(
  (select count(*)::int from public.watchlist_items
    where user_id = '10000000-0000-0000-0000-000000000001'),
  0,
  'with no instruments seeded the watchlist is empty and the signup still succeeded'
);

-- ── The watchlist, with instruments seeded ──────────────────────────────────

insert into public.instruments (symbol, name, yahoo_symbol) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS'),
  ('INFY', 'Infosys Limited', 'INFY.NS'),
  ('TCS', 'Tata Consultancy Services Limited', 'TCS.NS');

insert into auth.users (id, email, raw_user_meta_data)
values (
  '10000000-0000-0000-0000-000000000002',
  'grace@example.com',
  '{"name": "Grace Hopper", "picture": "https://example.com/grace.jpg"}'::jsonb
);

select is(
  (select count(*)::int from public.watchlist_items
    where user_id = '10000000-0000-0000-0000-000000000002'),
  3,
  'the watchlist seeds only the symbols that exist, skipping the other seven'
);

-- The list order is preserved, not whatever order the planner returned:
-- RELIANCE is 1st in the default list, TCS 2nd, INFY 4th.
select results_eq(
  $$select symbol from public.watchlist_items
     where user_id = '10000000-0000-0000-0000-000000000002'
     order by sort_order$$,
  $$values ('RELIANCE'), ('TCS'), ('INFY')$$,
  'sort_order follows the default list, not the join order'
);

-- Google's other spelling of each field.
select is(
  (select full_name from public.profiles
    where id = '10000000-0000-0000-0000-000000000002'),
  'Grace Hopper',
  'the name is also read from the `name` key Google sometimes sends instead'
);

select is(
  (select avatar_url from public.profiles
    where id = '10000000-0000-0000-0000-000000000002'),
  'https://example.com/grace.jpg',
  'the avatar is also read from the `picture` key'
);

-- ── A signup with no metadata at all ────────────────────────────────────────

insert into auth.users (id, email)
values ('10000000-0000-0000-0000-000000000003', 'anon@example.com');

select is(
  (select full_name from public.profiles
    where id = '10000000-0000-0000-0000-000000000003'),
  null,
  'a user with no metadata still bootstraps, with a null name rather than a failure'
);

select is(
  (select available_cash from public.funds
    where user_id = '10000000-0000-0000-0000-000000000003'),
  100000.00::numeric(14,2),
  'and still opens with the full balance'
);

-- ── A repeat sign-in creates nothing new ────────────────────────────────────
-- This is what "repeat sign-in" actually is: Supabase updates auth.users rather
-- than inserting a second row, and the trigger is scoped to INSERT. The function
-- itself cannot be called directly to check — Postgres refuses a trigger
-- function outside a trigger — so the reachable claim is asserted instead of a
-- synthetic one.

update auth.users
set last_sign_in_at = now(), raw_user_meta_data = '{"full_name": "Ada Lovelace"}'::jsonb
where id = '10000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.profiles
    where id = '10000000-0000-0000-0000-000000000001'),
  1,
  'signing in again leaves exactly one profile'
);

select is(
  (select count(*)::int from public.fund_ledger
    where user_id = '10000000-0000-0000-0000-000000000001'),
  1,
  'signing in again leaves exactly one signup credit — no second helping of cash'
);

select is(
  (select available_cash from public.funds
    where user_id = '10000000-0000-0000-0000-000000000001'),
  100000.00::numeric(14,2),
  'and the balance is untouched by the repeat sign-in'
);

-- ── The retry is bounded, and failure leaves nothing behind ─────────────────
-- The only way to reach this path is to make generation collide every time,
-- which is why generate_client_id() is a separate function: it can be replaced
-- inside this transaction and rolled back with everything else.
--
-- Attempts are counted with a sequence rather than a table on purpose —
-- nextval() is not rolled back by the failed statement, so the count survives
-- the very failure it is measuring.

create sequence public.zr_client_id_attempts;

update public.profiles set client_id = 'ZR999999'
  where id = '10000000-0000-0000-0000-000000000001';

create or replace function public.generate_client_id()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'ZR999999' from nextval('public.zr_client_id_attempts');
$$;

select throws_ok(
  $$insert into auth.users (id, email)
    values ('10000000-0000-0000-0000-000000000009', 'collide@example.com')$$,
  'P0001',
  'CLIENT_ID_EXHAUSTED',
  'ten collisions raise CLIENT_ID_EXHAUSTED rather than looping forever'
);

select is(
  currval('public.zr_client_id_attempts')::int,
  10,
  'generation was attempted exactly ten times — not nine, not until the heat death'
);

-- The bootstrap runs inside the signup transaction, so its failure takes the
-- user row with it. A user who exists without funds would break every money
-- function from feature 22 onward.
select is(
  (select count(*)::int from auth.users
    where id = '10000000-0000-0000-0000-000000000009'),
  0,
  'the signup itself failed: no auth.users row survives'
);

select is(
  (select count(*)::int from public.profiles
    where id = '10000000-0000-0000-0000-000000000009'),
  0,
  'no orphan profile'
);

select is(
  (select count(*)::int from public.funds
    where user_id = '10000000-0000-0000-0000-000000000009'),
  0,
  'no orphan funds row'
);

select is(
  (select count(*)::int from public.fund_ledger
    where user_id = '10000000-0000-0000-0000-000000000009'),
  0,
  'and no cash was credited to an account that does not exist'
);

select * from finish();
rollback;
