-- Feature 29: `square_off_mis`.
--
-- The claims under test are §10's: no MIS position survives 15:20, the exit is
-- flagged so Reports can tell it from a user exit, CNC is never touched, and a
-- short whose loss exceeds everything the account holds still closes.
--
-- **The fixture empties the world first**, for the same reason
-- `13-match-open-orders.sql` does: `square_off_mis` takes no user and no symbol,
-- so a real open position would be squared off and counted. Safe only because
-- the suite rolls back.
--
-- **No `market_state` stub.** 2026-09-07 is a real trading Monday and the
-- function's own guard calls `market_state(p_at)`, so passing real timestamps
-- exercises the session gate rather than bypassing it. Positions are opened by
-- resting a LIMIT order and calling `execute_order` directly — `place_order`
-- gates MARKET orders on the *current* session (§5), which would make the suite
-- depend on the hour it runs; a LIMIT has no such gate.
begin;
select plan(25);

delete from public.orders;
delete from public.positions;
delete from public.holdings;
delete from public.quotes;

-- 15:19 and 15:20 IST on Monday 2026-09-07, in UTC.
create or replace function pg_temp.at_1519() returns timestamptz language sql immutable as $$
  select '2026-09-07T09:49:00Z'::timestamptz
$$;
create or replace function pg_temp.at_1520() returns timestamptz language sql immutable as $$
  select '2026-09-07T09:50:00Z'::timestamptz
$$;

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- A: MIS long
  ('22222222-2222-2222-2222-222222222222'),  -- B: MIS short, covers normally
  ('33333333-3333-3333-3333-333333333333'),  -- C: CNC holding only
  ('44444444-4444-4444-4444-444444444444');  -- D: MIS short beyond the account

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true),
  ('INFY', 'Infosys Limited', 'INFY.NS', true)
  on conflict (symbol) do update set is_active = excluded.is_active;

insert into public.quotes (symbol, ltp, prev_close, provider, fetched_at) values
  ('RELIANCE', 100.00, 100.00, 'SIMULATOR', now()),
  ('INFY', 100.00, 100.00, 'SIMULATOR', now());

-- Opens a position through the real path: rest a crossing LIMIT, then fill it.
create or replace function pg_temp.open_mis(
  p_user uuid, p_symbol text, p_side public.order_side, p_quantity integer, p_limit numeric
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select order_id into v_id
    from public.place_order(p_symbol, p_side, 'LIMIT', 'MIS', p_quantity, p_limit);
  perform public.execute_order(v_id);
  return v_id;
end;
$$;

create or replace function pg_temp.cash(p_user uuid) returns numeric language sql as $$
  select available_cash from public.funds where user_id = p_user
$$;

create or replace function pg_temp.used(p_user uuid) returns numeric language sql as $$
  select used_margin from public.funds where user_id = p_user
$$;

create or replace function pg_temp.net_qty(p_user uuid, p_symbol text) returns integer language sql as $$
  select net_quantity from public.positions
   where user_id = p_user and symbol = p_symbol and product = 'MIS'
$$;

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

-- ── Positions to square off ─────────────────────────────────────────────────

-- A: long 10 RELIANCE at 100. A flat round trip still loses the charges.
select pg_temp.open_mis('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 10, 100.00);

-- B: short 10 RELIANCE at 100, comfortably collateralised.
select pg_temp.open_mis('22222222-2222-2222-2222-222222222222', 'RELIANCE', 'SELL', 10, 100.00);

-- C: a CNC holding and nothing intraday. The job must not touch it (§10).
insert into public.holdings (user_id, symbol, quantity, average_price) values
  ('33333333-3333-3333-3333-333333333333', 'RELIANCE', 40, 95.00);

-- D: short 100 INFY at 100 on a thin account, then the price quintuples.
--
-- Balance is pinned by moving the signup credit with it, so §12.1 stays true —
-- the money is not removed behind the ledger's back. Collateral is
-- 100 × 100 × 1.20 + closing charges ≈ 12,0xx, leaving ~3,000 spendable. A move
-- to 500 costs 40,000 to cover, which exceeds collateral plus cash, so §6's cap
-- applies: cash floors at zero and the remainder is a SIMULATION_ADJUSTMENT.
update public.funds set available_cash = 15000.00
 where user_id = '44444444-4444-4444-4444-444444444444';
update public.fund_ledger set amount = 15000.00, balance_after = 15000.00
 where user_id = '44444444-4444-4444-4444-444444444444';

select pg_temp.open_mis('44444444-4444-4444-4444-444444444444', 'INFY', 'SELL', 100, 100.00);
update public.quotes set ltp = 500.00, fetched_at = now() where symbol = 'INFY';

-- ── A. Before 15:20 the job is a no-op ──────────────────────────────────────

create temporary table t_run (squared integer, faulted integer) on commit drop;
insert into t_run select * from public.square_off_mis(pg_temp.at_1519());

select is((select squared from t_run), 0, 'at 15:19 nothing is squared off');
select is(pg_temp.net_qty('11111111-1111-1111-1111-111111111111', 'RELIANCE'), 10,
  'the long is still open a minute before the deadline');
select is((select count(*)::integer from public.trades where is_auto_squareoff), 0,
  'and no square-off trade has been written');

-- ── B. At 15:20 every MIS position is closed ────────────────────────────────

delete from t_run;
insert into t_run select * from public.square_off_mis(pg_temp.at_1520());

select is((select squared from t_run), 3, 'all three MIS positions are squared off');
select is((select faulted from t_run), 0, 'and none of them faulted');
select ok(pg_temp.net_qty('11111111-1111-1111-1111-111111111111', 'RELIANCE') is null,
  '§12.5: the long''s row is deleted, not left at zero');
select ok(pg_temp.net_qty('22222222-2222-2222-2222-222222222222', 'RELIANCE') is null,
  'the short''s row is deleted too');

-- ── C. The exit is flagged, and only the exit ───────────────────────────────

select is(
  (select count(*)::integer from public.trades where is_auto_squareoff), 3,
  'each square-off writes a trade flagged is_auto_squareoff');
select is(
  (select count(*)::integer from public.trades where not is_auto_squareoff and side = 'BUY'
     and user_id = '11111111-1111-1111-1111-111111111111'), 1,
  'the user''s own entry trade is not flagged');
select ok(
  (select realised_pnl from public.trades
    where user_id = '11111111-1111-1111-1111-111111111111' and is_auto_squareoff) < 0,
  '§9: a flat round trip realises a loss, because the charges are real');

-- ── D. Collateral comes back in full ────────────────────────────────────────

select is(pg_temp.used('22222222-2222-2222-2222-222222222222'), 0.00::numeric,
  '§12.3: the short''s collateral is fully released');
select ok(pg_temp.identity_3('22222222-2222-2222-2222-222222222222'),
  '§12.3 holds for the covered short');
select ok(pg_temp.identity_1('22222222-2222-2222-2222-222222222222'),
  '§12.1 holds for the covered short');

-- ── E. CNC is not an intraday position ──────────────────────────────────────

select is(
  (select quantity from public.holdings
    where user_id = '33333333-3333-3333-3333-333333333333' and symbol = 'RELIANCE'), 40,
  '§10: the CNC holding is untouched by the square-off');
select is(
  (select count(*)::integer from public.orders
    where user_id = '33333333-3333-3333-3333-333333333333'), 0,
  'and no exit order was written for a CNC-only account');

-- ── F. A loss beyond the account still closes (§6) ──────────────────────────

select ok(pg_temp.net_qty('44444444-4444-4444-4444-444444444444', 'INFY') is null,
  '§10: the unaffordable short is closed rather than stranded');
select is(pg_temp.cash('44444444-4444-4444-4444-444444444444'), 0.00::numeric,
  '§6: available_cash floors at exactly zero rather than going negative');
select is(
  (select count(*)::integer from public.fund_ledger
    where user_id = '44444444-4444-4444-4444-444444444444'
      and type = 'SIMULATION_ADJUSTMENT'), 1,
  '§7: the uncovered remainder is recorded as a SIMULATION_ADJUSTMENT');
select ok(
  (select realised_pnl from public.trades
    where user_id = '44444444-4444-4444-4444-444444444444' and is_auto_squareoff) < -15000,
  '§6: trades.realised_pnl carries the TRUE uncapped loss, not the capped cash effect');

-- ── G. A second underwater short on a floored account still closes ──────────
--
-- The case that found the bug. §6's cap floors `available_cash` at zero, so an
-- account with two losing shorts reaches the second cover with nothing spendable
-- — and `execute_order`'s solvency check used to demand `available_cash >=
-- charges` even with no opening leg, while the collateral that would pay them
-- sat in `positions.blocked_margin` where the check could not see it. The second
-- position was rejected and left open past 15:20.
--
-- Falsifiability: drop `v_open_quantity > 0` from that condition and the first
-- two assertions here go red, WIPRO surviving with `INSUFFICIENT_FUNDS`.

insert into auth.users (id) values ('55555555-5555-5555-5555-555555555555');
insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('WIPRO', 'Wipro Limited', 'WIPRO.NS', true)
  on conflict (symbol) do update set is_active = excluded.is_active;
insert into public.quotes (symbol, ltp, prev_close, provider, fetched_at) values
  ('WIPRO', 100.00, 100.00, 'SIMULATOR', now())
  on conflict (symbol) do update set ltp = 100.00, fetched_at = now();
update public.quotes set ltp = 100.00, fetched_at = now() where symbol = 'INFY';

update public.funds set available_cash = 30000.00
 where user_id = '55555555-5555-5555-5555-555555555555';
update public.fund_ledger set amount = 30000.00, balance_after = 30000.00
 where user_id = '55555555-5555-5555-5555-555555555555';

select pg_temp.open_mis('55555555-5555-5555-5555-555555555555', 'INFY', 'SELL', 100, 100.00);
select pg_temp.open_mis('55555555-5555-5555-5555-555555555555', 'WIPRO', 'SELL', 100, 100.00);

-- Both quintuple: each cover costs far more than the account can pay.
update public.quotes set ltp = 500.00, fetched_at = now() where symbol in ('INFY', 'WIPRO');

delete from t_run;
insert into t_run select * from public.square_off_mis(pg_temp.at_1520());

select is((select squared from t_run), 2,
  '§10: both underwater shorts close, even though the first one floors the cash');
select is(
  (select count(*)::integer from public.positions
    where user_id = '55555555-5555-5555-5555-555555555555'), 0,
  'identity 7: no MIS position survives, however little the account has left');
select is(pg_temp.cash('55555555-5555-5555-5555-555555555555'), 0.00::numeric,
  '§6: and cash still lands at exactly zero rather than going negative');

-- ── H. Running it again does nothing ────────────────────────────────────────

delete from t_run;
insert into t_run select * from public.square_off_mis(pg_temp.at_1520());
select is((select squared from t_run), 0,
  'a second run in the same minute squares off nothing — the job is idempotent');

-- ── I. Why square_off_mis must lock the position ────────────────────────────
--
-- Characterises the hazard the lock exists to prevent, deterministically —
-- the tier 3 race test cannot yet stage the interleaving reliably.
--
-- `execute_order` cannot tell an exit from an entry: a SELL MIS against no
-- position is, correctly, a short. So if two overlapping runs both select a
-- position and the first closes it, the second's exit order does not fail — it
-- opens a **naked short** that then survives the session with collateral against
-- it. `square_off_mis` therefore re-reads the position under its own lock and
-- writes no order when it has gone.

insert into auth.users (id) values ('66666666-6666-6666-6666-666666666666');
update public.quotes set ltp = 100.00, fetched_at = now() where symbol = 'RELIANCE';

select pg_temp.open_mis('66666666-6666-6666-6666-666666666666', 'RELIANCE', 'BUY', 10, 110.00);
delete from t_run;
insert into t_run select * from public.square_off_mis(pg_temp.at_1520());

select ok(pg_temp.net_qty('66666666-6666-6666-6666-666666666666', 'RELIANCE') is null,
  'the position is closed by the first run');

-- Exactly the order an overlapping second run would have written.
with exit_order as (
  insert into public.orders (user_id, symbol, side, order_type, product, quantity, blocked_margin)
  values ('66666666-6666-6666-6666-666666666666', 'RELIANCE', 'SELL', 'MARKET', 'MIS', 10, 0)
  returning id
)
select public.execute_order((select id from exit_order));

select is(pg_temp.net_qty('66666666-6666-6666-6666-666666666666', 'RELIANCE'), -10,
  'and a duplicate exit order would open a naked short — which is why the lock exists');

select * from finish();
rollback;
