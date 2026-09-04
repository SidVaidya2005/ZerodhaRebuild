-- Feature 27: `modify_order`.
--
-- The claim under test is that a modify re-reserves rather than retires, and
-- that a modify which cannot be covered changes **nothing at all**. That second
-- half is the reason the function carries a subtransaction, so it is the case
-- this file exists to falsify: run it against a build with the `EXCEPTION`
-- clause removed and section D goes red on the first assertion.
--
-- `market_state` is stubbed for the same reason `10-orders.sql` stubs it: a
-- suite whose result depends on the hour it runs is worse than no suite. The
-- stub is created inside the transaction and the rollback removes it.
begin;
select plan(29);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true)
  on conflict (symbol) do update set is_active = excluded.is_active;

insert into public.quotes (symbol, ltp, prev_close, provider, fetched_at) values
  ('RELIANCE', 100.00, 100.00, 'SIMULATOR', now())
  on conflict (symbol) do update
    set ltp = excluded.ltp, fetched_at = excluded.fetched_at,
        provider = excluded.provider, provider_ts = null;

create or replace function public.market_state(p_at timestamptz default now())
returns public.market_session_state language sql stable
as $$ select 'OPEN'::public.market_session_state $$;

create or replace function pg_temp.cash(p_user uuid) returns numeric language sql as $$
  select available_cash from public.funds where user_id = p_user
$$;

create or replace function pg_temp.used(p_user uuid) returns numeric language sql as $$
  select used_margin from public.funds where user_id = p_user
$$;

create or replace function pg_temp.blocked(p_order uuid) returns numeric language sql as $$
  select blocked_margin from public.orders where id = p_order
$$;

create or replace function pg_temp.qty(p_order uuid) returns integer language sql as $$
  select quantity from public.orders where id = p_order
$$;

create or replace function pg_temp.limit_price(p_order uuid) returns numeric language sql as $$
  select limit_price from public.orders where id = p_order
$$;

-- Places a resting limit order as the owning user, exactly as the Server Action
-- will: `place_order` reads auth.uid(), so the test sets the claim rather than
-- passing a user id.
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

create or replace function pg_temp.modify(
  p_user uuid, p_order uuid, p_quantity integer, p_limit numeric default null
) returns table (ok boolean, reason text) language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  return query select * from public.modify_order(p_order, p_quantity, p_limit);
end;
$$;

-- ── A. Raising the quantity blocks more ─────────────────────────────────────
--
-- A resting CNC limit BUY reserves notional + estimated charges (§6).
--
-- 10 @ 90.00 — turnover 900.00
--   brokerage 0 (delivery is free)
--   stt      0.001     × 900 = 0.90
--   exchange 0.0000307 × 900 = 0.02763 → 0.03
--   sebi     0.000001  × 900 = 0.0009  → 0.00
--   stamp    0.00015   × 900 = 0.135   → 0.14
--   gst 0.18 × (0 + 0.02763 + 0.0009) = 0.0051354 → 0.01
--   charges = 0.90 + 0.03 + 0.00 + 0.14 + 0.01 = 1.08
--   reservation = 900.00 + 1.08 = 901.08
--   cash = 100000.00 − 901.08 = 99098.92

create temporary table t_order (id uuid) on commit drop;
insert into t_order select pg_temp.rest('11111111-1111-1111-1111-111111111111', 'BUY', 10, 90.00);

select is(pg_temp.blocked((select id from t_order)), 901.08::numeric,
  'the resting order reserves notional + estimated charges');
select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'), 99098.92::numeric,
  'and available_cash falls by exactly that');
select is(pg_temp.used('11111111-1111-1111-1111-111111111111'), 901.08::numeric,
  '§12.3: used_margin equals the order''s blocked_margin');

-- 20 @ 90.00 — turnover 1800.00
--   stt      0.001     × 1800 = 1.80
--   exchange 0.0000307 × 1800 = 0.05526 → 0.06
--   sebi     0.000001  × 1800 = 0.0018  → 0.00
--   stamp    0.00015   × 1800 = 0.27
--   gst 0.18 × (0 + 0.05526 + 0.0018) = 0.0102708 → 0.01
--   charges = 1.80 + 0.06 + 0.00 + 0.27 + 0.01 = 2.14
--   reservation = 1800.00 + 2.14 = 1802.14
--   cash = 100000.00 − 1802.14 = 98197.86

select is(
  (select m.ok from pg_temp.modify('11111111-1111-1111-1111-111111111111',
                                   (select id from t_order), 20, 90.00) m),
  true, 'doubling the quantity is accepted');

select is(pg_temp.qty((select id from t_order)), 20, 'the stored quantity is the new one');
select is(pg_temp.blocked((select id from t_order)), 1802.14::numeric,
  'the reservation is recomputed for the new terms, not adjusted by a delta');
select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'), 98197.86::numeric,
  'available_cash reflects the whole new reservation');
select is(pg_temp.used('11111111-1111-1111-1111-111111111111'), 1802.14::numeric,
  '§12.3 still holds after the re-reservation');

-- §12.1: the ledger explains the balance. The modify wrote a MARGIN_RELEASE for
-- the old reservation and a MARGIN_BLOCK for the new one, and both are real
-- movements of available_cash.
select is(
  (select sum(amount) from public.fund_ledger
    where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  pg_temp.cash('11111111-1111-1111-1111-111111111111'),
  '§12.1: available_cash still equals the sum of the ledger');

select is(
  (select count(*)::integer from public.fund_ledger
    where user_id = '11111111-1111-1111-1111-111111111111'::uuid
      and order_id = (select id from t_order)),
  3, 'the order has three ledger rows: the original block, then release + block');

-- ── B. Lowering the quantity returns the difference ─────────────────────────
--
-- Back to 10 @ 90.00, so the reservation returns to 901.08 exactly — proving the
-- release side is the same formula and not a proportional adjustment.

select is(
  (select m.ok from pg_temp.modify('11111111-1111-1111-1111-111111111111',
                                   (select id from t_order), 10, 90.00) m),
  true, 'halving it back is accepted');
select is(pg_temp.blocked((select id from t_order)), 901.08::numeric,
  'the reservation returns to exactly its original figure');
select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'), 99098.92::numeric,
  'and so does available_cash — no rounding drift across the round trip');

-- ── C. Changing the limit price alone ──────────────────────────────────────
--
-- 10 @ 95.00 — turnover 950.00
--   stt      0.001     × 950 = 0.95
--   exchange 0.0000307 × 950 = 0.029165 → 0.03
--   sebi     0.000001  × 950 = 0.00095  → 0.00
--   stamp    0.00015   × 950 = 0.1425   → 0.14
--   gst 0.18 × (0 + 0.029165 + 0.00095) = 0.0054207 → 0.01
--   charges = 0.95 + 0.03 + 0.00 + 0.14 + 0.01 = 1.13
--   reservation = 950.00 + 1.13 = 951.13

select is(
  (select m.ok from pg_temp.modify('11111111-1111-1111-1111-111111111111',
                                   (select id from t_order), 10, 95.00) m),
  true, 'raising the limit price alone is accepted');
select is(pg_temp.limit_price((select id from t_order)), 95.00::numeric,
  'the stored limit price is the new one');
select is(pg_temp.blocked((select id from t_order)), 951.13::numeric,
  '§6: the reservation is evaluated at the new limit price');

-- ── D. An unaffordable modify changes nothing ──────────────────────────────
--
-- **The case the subtransaction exists for.** Remove the EXCEPTION clause from
-- `modify_order` and the release still stands: blocked_margin is 0, the quantity
-- is the new one, and the order rests uncollateralised. All four assertions
-- below go red.

select is(
  (select m.reason from pg_temp.modify('11111111-1111-1111-1111-111111111111',
                                       (select id from t_order), 100000, 95.00) m),
  'INSUFFICIENT_FUNDS', 'a modify beyond the balance is refused');

select is(pg_temp.qty((select id from t_order)), 10,
  'the quantity is untouched — the subtransaction rolled the write back');
select is(pg_temp.limit_price((select id from t_order)), 95.00::numeric,
  'and so is the limit price');
select is(pg_temp.blocked((select id from t_order)), 951.13::numeric,
  'the original reservation is still held, not released');
select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'), 99048.87::numeric,
  'available_cash is byte-identical to before the attempt');

-- ── E. Who may modify what ─────────────────────────────────────────────────

select is(
  (select m.reason from pg_temp.modify('22222222-2222-2222-2222-222222222222',
                                       (select id from t_order), 5, 95.00) m),
  'NOT_FOUND', 'another user''s order is NOT_FOUND, which declines to confirm the id exists');

select is(pg_temp.qty((select id from t_order)), 10,
  'and that attempt wrote nothing');

select is(
  (select m.reason from pg_temp.modify('11111111-1111-1111-1111-111111111111',
                                       '00000000-0000-0000-0000-000000000000'::uuid, 5, 95.00) m),
  'NOT_FOUND', 'an id that does not exist gets the same answer');

-- A filled order has left OPEN, and §4 makes OPEN the only status a transition
-- may start from.
create or replace function pg_temp.fill(p_user uuid, p_quantity integer)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select order_id into v_id
    from public.place_order('RELIANCE', 'BUY', 'MARKET', 'CNC', p_quantity, null);
  return v_id;
end;
$$;

create temporary table t_filled (id uuid) on commit drop;
insert into t_filled select pg_temp.fill('11111111-1111-1111-1111-111111111111', 1);

select is(
  (select o.status from public.orders o where o.id = (select id from t_filled)),
  'COMPLETE'::public.order_status, 'the fixture order filled');

select is(
  (select m.reason from pg_temp.modify('11111111-1111-1111-1111-111111111111',
                                       (select id from t_filled), 5) m),
  'NOT_OPEN', 'a filled order can no longer be modified');

select is(
  (select m.reason from pg_temp.modify('11111111-1111-1111-1111-111111111111',
                                       (select id from t_order), 0, 95.00) m),
  'INVALID_QUANTITY', 'a non-positive quantity is refused by code, not by a raw CHECK');

-- ── F. The grant ───────────────────────────────────────────────────────────

select ok(
  has_function_privilege('authenticated', 'public.modify_order(uuid, integer, numeric)', 'execute'),
  'modify_order is callable by authenticated — a Server Action calls it');

select ok(
  not has_function_privilege('anon', 'public.modify_order(uuid, integer, numeric)', 'execute'),
  'and not by anon, whose key ships in the browser bundle');

select finish();
rollback;
