-- Feature 34's reads: the trade history view, its filter vocabulary, and the
-- money totals over a filtered set.
--
-- **The fixture's two RELIANCE trades are 20 minutes apart and fall on
-- different IST days.** 18:20 and 18:40 UTC are both 2026-03-10 in UTC, but
-- 23:50 on the 10th and 00:10 on the 11th in Asia/Kolkata. That pair is the
-- whole reason `traded_on` is computed in the view: a filter written against
-- `traded_at::date` passes every other assertion in this file and files the
-- second trade on the wrong day, where it is invisible on screen rather than
-- obviously wrong.
--
-- Every total is hand-computed in the comments rather than restated as the
-- expression the function uses, per the trap the Phase 1 checkpoint caught in
-- the charge suite.
--
-- The isolation assertion is paired with a falsification: security_invoker is
-- switched off and the same query must start leaking, which is what proves RLS
-- and not the join is the boundary (F18).
begin;
select plan(16);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Written as the connecting role, which owns these tables and bypasses RLS.

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true),
  ('INFY',     'Infosys Limited',             'INFY.NS',     true)
  on conflict (symbol) do update set is_active = excluded.is_active;

-- `orders_limit_price_iff_limit` makes limit_price mandatory on a LIMIT and
-- forbidden on a MARKET, so the fixture cannot be uniform here.
insert into public.orders
  (id, user_id, symbol, side, order_type, product, quantity, limit_price,
   filled_quantity, average_price, status, blocked_margin)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111',
   'RELIANCE', 'BUY',  'MARKET', 'CNC', 10, null,    10, 1400.00, 'COMPLETE', 0),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111',
   'RELIANCE', 'SELL', 'LIMIT',  'CNC', 10, 1415.00, 10, 1420.00, 'COMPLETE', 0),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '11111111-1111-1111-1111-111111111111',
   'INFY',     'SELL', 'MARKET', 'MIS',  5, null,     5, 1500.00, 'COMPLETE', 0);

-- Three trades. Realised sums to 0.00 + 120.50 + 30.25 = 150.75; charges to
-- 18.53 + 18.53 + 10.00 = 47.06. Buy value is 10 × 1400 = 14000.00; sell value
-- is 10 × 1420 + 5 × 1500 = 21700.00. Each breakdown sums exactly to its
-- `charges` because §12.6 is a CHECK, not a preference.
insert into public.trades
  (user_id, order_id, symbol, side, product, quantity, price, charges,
   charge_breakdown, realised_pnl, traded_at)
values
  -- 23:50 IST on the 10th.
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'RELIANCE', 'BUY', 'CNC', 10, 1400.00, 18.53,
   '{"brokerage":0,"stt":14.00,"exchange_txn":0.43,"sebi_turnover":0.01,
     "stamp_duty":2.10,"dp_charge":0,"gst":1.99}'::jsonb, 0.00,
   '2026-03-10 18:20:00+00'),
  -- 00:10 IST on the 11th — same UTC day as the row above.
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   'RELIANCE', 'SELL', 'CNC', 10, 1420.00, 18.53,
   '{"brokerage":0,"stt":14.00,"exchange_txn":0.43,"sebi_turnover":0.01,
     "stamp_duty":2.10,"dp_charge":0,"gst":1.99}'::jsonb, 120.50,
   '2026-03-10 18:40:00+00'),
  -- 11:30 IST on the 12th, a different symbol and product.
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
   'INFY', 'SELL', 'MIS', 5, 1500.00, 10.00,
   '{"brokerage":0,"stt":7.50,"exchange_txn":0.23,"sebi_turnover":0.01,
     "stamp_duty":0,"dp_charge":2.20,"gst":0.06}'::jsonb, 30.25,
   '2026-03-12 06:00:00+00');

-- ── Ada: the view ───────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- The assertion this whole suite exists for.
select results_eq(
  $$ select symbol, side, traded_on from public.trade_history order by traded_at $$,
  $$ values ('RELIANCE'::text, 'BUY'::public.order_side,  '2026-03-10'::date),
            ('RELIANCE'::text, 'SELL'::public.order_side, '2026-03-11'::date),
            ('INFY'::text,     'SELL'::public.order_side, '2026-03-12'::date) $$,
  'traded_on is the IST calendar day: two trades 20 minutes apart straddle midnight and land on different days'
);

select isnt(
  (select traded_on from public.trade_history where side = 'SELL' and symbol = 'RELIANCE'),
  (select (traded_at at time zone 'UTC')::date from public.trade_history
    where side = 'SELL' and symbol = 'RELIANCE'),
  'and that day is not the UTC one — a naive traded_at::date would file it 24 hours early'
);

select results_eq(
  $$ select value from public.trade_history order by traded_at $$,
  $$ values (14000.00::numeric), (14200.00::numeric), (7500.00::numeric) $$,
  'value is quantity × price computed in SQL, never in TypeScript'
);

select results_eq(
  $$ select symbol, order_type from public.trade_history order by traded_at $$,
  $$ values ('RELIANCE'::text, 'MARKET'::public.order_type),
            ('RELIANCE'::text, 'LIMIT'::public.order_type),
            ('INFY'::text,     'MARKET'::public.order_type) $$,
  'the order join carries order_type through, so a fill is distinguishable from a market order on screen'
);

-- ── The totals ──────────────────────────────────────────────────────────────

select results_eq(
  $$ select trade_count, realised_pnl, charges_total, buy_value, sell_value
       from public.reports_summary() $$,
  $$ values (3::bigint, 150.75::numeric, 47.06::numeric, 14000.00::numeric, 21700.00::numeric) $$,
  'unfiltered: the totals equal the hand-computed sums over all three trades'
);

select is(
  (select realised_pnl from public.reports_summary()),
  (select coalesce(sum(realised_pnl), 0)::numeric(14,2) from public.trades),
  '§9: realised P&L is Σ trades.realised_pnl and nothing else — asserted against the table, not the view'
);

select results_eq(
  $$ select trade_count, realised_pnl from public.reports_summary('2026-03-10', '2026-03-10') $$,
  $$ values (1::bigint, 0.00::numeric) $$,
  'a single-day filter takes the 23:50 IST trade only, not the 00:10 one 20 minutes later'
);

select results_eq(
  $$ select trade_count, realised_pnl from public.reports_summary('2026-03-11', '2026-03-11') $$,
  $$ values (1::bigint, 120.50::numeric) $$,
  'and the next day takes that one, proving the boundary falls between them'
);

select results_eq(
  $$ select trade_count, realised_pnl from public.reports_summary('2026-03-10', '2026-03-12') $$,
  $$ values (3::bigint, 150.75::numeric) $$,
  'both bounds are inclusive — the first and last day are inside their own range'
);

select results_eq(
  $$ select trade_count, realised_pnl from public.reports_summary('2026-03-11', '2026-03-11', 'INFY') $$,
  $$ values (0::bigint, 0.00::numeric) $$,
  'date and symbol narrow together, and an empty set reports 0.00 rather than null'
);

select results_eq(
  $$ select trade_count, realised_pnl, sell_value from public.reports_summary(null, null, 'INFY') $$,
  $$ values (1::bigint, 30.25::numeric, 7500.00::numeric) $$,
  'a symbol filter with null bounds is the unbounded path, not a second query'
);

-- The function's own count and a direct count under the same filter are derived
-- independently; the page shows both, so they must never disagree.
select is(
  (select trade_count from public.reports_summary('2026-03-10', '2026-03-11')),
  (select count(*) from public.trade_history
    where traded_on between '2026-03-10' and '2026-03-11'),
  'the function''s trade_count equals a direct count over the same filter'
);

-- ── The filter vocabulary ───────────────────────────────────────────────────

select results_eq(
  $$ select symbol from public.traded_symbols order by symbol $$,
  $$ values ('INFY'::text), ('RELIANCE'::text) $$,
  'traded_symbols is distinct: two RELIANCE trades produce one option, not two'
);

-- ── Isolation, and the falsification that gives it meaning ──────────────────

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is_empty(
  $$ select 1 from public.trade_history $$,
  'a second user reads none of Ada''s trades through the view'
);

reset role;
alter view public.trade_history set (security_invoker = off);
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select isnt_empty(
  $$ select 1 from public.trade_history $$,
  'with security_invoker off it leaks, which proves RLS and not the join is the boundary'
);

reset role;
alter view public.trade_history set (security_invoker = on);

-- ── Grants ──────────────────────────────────────────────────────────────────
-- The publishable key ships in the browser bundle, so anon reaching any of the
-- three would publish one user's trade history to anyone who reads the
-- JavaScript (F10).

select ok(
  not has_table_privilege('anon', 'public.trade_history', 'select')
  and not has_table_privilege('anon', 'public.traded_symbols', 'select')
  and not has_function_privilege('anon', 'public.reports_summary(date,date,text)', 'execute'),
  'anon holds no privilege on either view or the summary function'
);

select * from finish();
rollback;
