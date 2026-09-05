-- Feature 28: `match_open_orders`.
--
-- The claim under test is that the matcher fills exactly the resting LIMIT
-- orders whose quote has crossed them, oldest first, and that one faulting
-- order cannot stop the run.
--
-- **The fixture empties `orders` and `quotes` first.** `match_open_orders` asks
-- what the whole system should fill — it takes no user and no symbol — so a
-- suite that left the real account's resting orders in place would fill them
-- and count them, and its result would depend on what the developer happens to
-- be holding. This is the same reason `04-market-tick.sql` empties the demand
-- tables (F16). Safe only because the suite always rolls back.
--
-- **Orders are retired with `cancel_order`, never `delete`.** `fund_ledger`
-- and `trades` both reference `orders (id) on delete cascade`, so deleting a
-- resting order would take its `MARGIN_BLOCK` row with it while the cash it
-- moved stayed moved — §12.1 would then pass in section G for the wrong reason.
--
-- No `market_state` stub is needed: `place_order` gates only MARKET orders on
-- the session (§5), and every order here is a LIMIT. `execute_order` gates on
-- quote staleness, never on the session — the session gate lives in the Edge
-- Function, which is what calls this.
begin;
select plan(19);

delete from public.orders;
delete from public.quotes;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true)
  on conflict (symbol) do update set is_active = excluded.is_active;

insert into public.quotes (symbol, ltp, prev_close, provider, fetched_at) values
  ('RELIANCE', 100.00, 100.00, 'SIMULATOR', now());

create or replace function pg_temp.rest(
  p_user uuid, p_side public.order_side, p_quantity integer, p_limit numeric
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select order_id into v_id
    from public.place_order('RELIANCE', p_side, 'LIMIT', 'CNC', p_quantity, p_limit);
  return v_id;
end;
$$;

create or replace function pg_temp.cancel(p_user uuid, p_order uuid) returns boolean
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  return public.cancel_order(p_order);
end;
$$;

create or replace function pg_temp.status(p_order uuid) returns text language sql as $$
  select status::text from public.orders where id = p_order
$$;

create or replace function pg_temp.cash(p_user uuid) returns numeric language sql as $$
  select available_cash from public.funds where user_id = p_user
$$;

-- The three identities a matched run must leave standing (§12.1, §12.3, §12.8).
create or replace function pg_temp.identity_1(p_user uuid) returns boolean language sql as $$
  select (select available_cash from public.funds where user_id = p_user)
       = (select coalesce(sum(amount), 0) from public.fund_ledger where user_id = p_user)
$$;

create or replace function pg_temp.identity_3(p_user uuid) returns boolean language sql as $$
  select (select used_margin from public.funds where user_id = p_user)
       = (select coalesce(sum(blocked_margin), 0) from public.orders
           where user_id = p_user and status = 'OPEN')
       + (select coalesce(sum(blocked_margin), 0) from public.positions where user_id = p_user)
$$;

create or replace function pg_temp.identity_8(p_user uuid) returns boolean language sql as $$
  select not exists (
    select 1 from public.orders
     where user_id = p_user and status <> 'OPEN' and blocked_margin <> 0
  )
$$;

create temporary table t_run (filled integer, faulted integer) on commit drop;

-- ── A. A crossing buy fills; one below the market rests ─────────────────────
--
-- ltp is 100.00. A BUY is eligible when ltp <= limit_price (§5), so 110 crosses
-- and 90 does not. Both belong to the same user, whose ₹1,00,000 covers both
-- reservations — so what separates them is the predicate, not the money.

create temporary table t_a (label text, id uuid) on commit drop;
insert into t_a values
  ('crossing', pg_temp.rest('11111111-1111-1111-1111-111111111111', 'BUY', 10, 110.00)),
  ('resting',  pg_temp.rest('11111111-1111-1111-1111-111111111111', 'BUY', 10, 90.00));

insert into t_run select * from public.match_open_orders();

select is((select filled from t_run), 1, 'the run reports exactly one fill');
select is(pg_temp.status((select id from t_a where label = 'crossing')), 'COMPLETE',
  'a buy limit above the market fills');
select is(pg_temp.status((select id from t_a where label = 'resting')), 'OPEN',
  'a buy limit below the market keeps resting');

-- ── B. A crossing sell fills; one above the market rests ────────────────────
--
-- A SELL is eligible when ltp >= limit_price, so 90 crosses and 110 does not.
-- CNC selling needs the holding first (§8) — there is no CNC shorting.

insert into public.holdings (user_id, symbol, quantity, average_price) values
  ('22222222-2222-2222-2222-222222222222', 'RELIANCE', 50, 80.00);

create temporary table t_b (label text, id uuid) on commit drop;
insert into t_b values
  ('crossing', pg_temp.rest('22222222-2222-2222-2222-222222222222', 'SELL', 10, 90.00)),
  ('resting',  pg_temp.rest('22222222-2222-2222-2222-222222222222', 'SELL', 10, 110.00));

delete from t_run;
insert into t_run select * from public.match_open_orders();

select is((select filled from t_run), 1, 'the sell run reports exactly one fill');
select is(pg_temp.status((select id from t_b where label = 'crossing')), 'COMPLETE',
  'a sell limit below the market fills');
select is(pg_temp.status((select id from t_b where label = 'resting')), 'OPEN',
  'a sell limit above the market keeps resting');

-- ── C. A stale quote fills nothing, however far it has crossed ──────────────
--
-- §5: a fill is never priced off a quote older than `quote_stale_after_ms`.
-- The order below crosses by a mile; only the clock stops it.

update public.quotes
   set fetched_at = now()
     - ((select quote_stale_after_ms from public.market_constants()) + 60000)
       * interval '1 millisecond'
 where symbol = 'RELIANCE';

create temporary table t_c (id uuid) on commit drop;
insert into t_c select pg_temp.rest('11111111-1111-1111-1111-111111111111', 'BUY', 10, 500.00);

delete from t_run;
insert into t_run select * from public.match_open_orders();

select is((select filled from t_run), 0, 'a stale quote fills nothing');
select is(pg_temp.status((select id from t_c)), 'OPEN',
  'and the crossing order is left resting rather than rejected');

-- Freshen the quote and retire that order properly, so it does not fill into a
-- later section's counts.
update public.quotes set fetched_at = now() where symbol = 'RELIANCE';
select pg_temp.cancel('11111111-1111-1111-1111-111111111111', (select id from t_c));

-- ── D. Cash gone since placement: rejected, never a negative balance ────────
--
-- This setup is deliberately artificial, and that is worth stating. A buy
-- reserves notional + estimated charges at its *limit*, and §5 fills at the
-- observed price, which for a buy is at or below that limit — so a fill can
-- never cost more than its reservation, and this branch is unreachable through
-- the product's own flows. It is a defensive path, so the money is removed
-- behind the ledger's back to reach it. §12.1 and §12.3 are therefore never
-- asserted for this user: nothing here claims that state is coherent, only that
-- `execute_order` refuses rather than overdrawing.

create temporary table t_d (id uuid) on commit drop;
insert into t_d select pg_temp.rest('33333333-3333-3333-3333-333333333333', 'BUY', 10, 110.00);

update public.orders set blocked_margin = 0 where id = (select id from t_d);
update public.funds set available_cash = 0, used_margin = 0
 where user_id = '33333333-3333-3333-3333-333333333333';

delete from t_run;
insert into t_run select * from public.match_open_orders();

select is(pg_temp.status((select id from t_d)), 'REJECTED',
  'a crossing order the account can no longer afford is rejected');
select ok(pg_temp.cash('33333333-3333-3333-3333-333333333333') >= 0,
  '§12.4: available_cash never goes negative');

-- ── E. Oldest first ─────────────────────────────────────────────────────────
--
-- Two crossing orders for one user, both affordable. The ORDER BY is what makes
-- the older fill first, and `execute_order` stamps each trade with
-- `clock_timestamp()` — so the trades' order is the matcher's order, observable
-- without having to starve the account. The only orders still resting are A's
-- buy at 90 and B's sell at 110, neither of which crosses at 100.

create temporary table t_e (label text, id uuid) on commit drop;
insert into t_e values ('older', pg_temp.rest('11111111-1111-1111-1111-111111111111', 'BUY', 3, 110.00));
insert into t_e values ('newer', pg_temp.rest('11111111-1111-1111-1111-111111111111', 'BUY', 4, 110.00));

delete from t_run;
insert into t_run select * from public.match_open_orders();

select is((select filled from t_run), 2, 'both crossing orders fill');
select ok(
  (select traded_at from public.trades where order_id = (select id from t_e where label = 'older'))
  < (select traded_at from public.trades where order_id = (select id from t_e where label = 'newer')),
  'the order resting longer is filled first'
);

-- ── F. One faulting order does not stop the run ─────────────────────────────
--
-- The subtransaction is the whole point of the loop, so this is the case that
-- falsifies it: remove the `EXCEPTION` clause from `match_open_orders` and the
-- fault propagates, the run aborts, and the good order below never fills.
--
-- The fault is injected with a trigger rather than by stubbing a money
-- function, so nothing on the charge path is replaced while it runs.

create function pg_temp.explode() returns trigger language plpgsql as $$
begin
  raise exception 'injected fault for order quantity 7';
end;
$$;

create trigger t_explode before insert on public.trades
  for each row when (new.quantity = 7) execute function pg_temp.explode();

create temporary table t_f (label text, id uuid) on commit drop;
insert into t_f values ('faulting', pg_temp.rest('11111111-1111-1111-1111-111111111111', 'BUY', 7, 110.00));
insert into t_f values ('good',     pg_temp.rest('11111111-1111-1111-1111-111111111111', 'BUY', 5, 110.00));

delete from t_run;
insert into t_run select * from public.match_open_orders();

select is((select faulted from t_run), 1, 'the faulting order is counted as a fault');
select is((select filled from t_run), 1, 'and the run carries on to fill the next one');
select is(pg_temp.status((select id from t_f where label = 'good')), 'COMPLETE',
  'the order after the fault fills normally');
select is(pg_temp.status((select id from t_f where label = 'faulting')), 'OPEN',
  'the faulting order is rolled back to resting, so the next tick retries it');

drop trigger t_explode on public.trades;

-- ── G. The identities still hold after all of it ────────────────────────────

select ok(pg_temp.identity_1('11111111-1111-1111-1111-111111111111'),
  '§12.1: available_cash equals the sum of the ledger');
select ok(pg_temp.identity_3('11111111-1111-1111-1111-111111111111'),
  '§12.3: used_margin equals blocked margin across open orders and positions');
select ok(pg_temp.identity_8('11111111-1111-1111-1111-111111111111'),
  '§12.8: no order outside OPEN still holds margin');

select * from finish();
rollback;
