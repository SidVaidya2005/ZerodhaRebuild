-- Feature 32's single read: the Funds cards and the counts its reset dialog names.
--
-- Every figure is hand-computed in the fixture comments rather than restated as
-- the expression the view uses, per the trap the Phase 1 checkpoint caught in
-- the charge suite.
--
-- **What is deliberately not here: §11's reset guarantee.** `10-orders.sql`
-- section L already proves it — everything wiped, exactly one fresh
-- SIGNUP_CREDIT, the balance restored, watchlist_items untouched and no other
-- account affected. F32 adds a button and a Server Action, not a second reset,
-- so restating those six assertions here would be a copy of a passing test
-- rather than coverage. Identity 3 is likewise `09-margin-identities.sql`.
--
-- The isolation assertion is paired with a falsification: security_invoker is
-- switched off and the same query must start leaking. The correlated
-- `where user_id = f.user_id` clauses inside this view are subquery correlation,
-- not a security predicate, and this is what proves the difference.
begin;
select plan(12);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Written as the connecting role, which owns these tables and bypasses RLS.

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true)
  on conflict (symbol) do update set is_active = excluded.is_active;

-- Two filled orders for Ada, so the trades below have something to hang off.
insert into public.orders
  (id, user_id, symbol, side, order_type, product, quantity, filled_quantity,
   average_price, status, blocked_margin)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111',
   'RELIANCE', 'BUY',  'MARKET', 'CNC', 10, 10, 1400.00, 'COMPLETE', 0),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '11111111-1111-1111-1111-111111111111',
   'RELIANCE', 'SELL', 'MARKET', 'CNC', 10, 10, 1420.00, 'COMPLETE', 0);

-- Two trades. Realised P&L sums to 120.50 − 20.25 = 100.25, and each breakdown
-- sums exactly to its `charges` because §12.6 is a CHECK, not a preference.
insert into public.trades
  (user_id, order_id, symbol, side, product, quantity, price, charges,
   charge_breakdown, realised_pnl)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
   'RELIANCE', 'BUY', 'CNC', 10, 1400.00, 18.53,
   '{"brokerage":0,"stt":14.00,"exchange_txn":0.43,"sebi_turnover":0.01,
     "stamp_duty":2.10,"dp_charge":0,"gst":1.99}'::jsonb, 120.50),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   'RELIANCE', 'SELL', 'CNC', 10, 1420.00, 18.53,
   '{"brokerage":0,"stt":14.00,"exchange_txn":0.43,"sebi_turnover":0.01,
     "stamp_duty":2.10,"dp_charge":0,"gst":1.99}'::jsonb, -20.25);

insert into public.holdings (user_id, symbol, quantity, average_price) values
  ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 10, 1400.00);

-- A short, so `blocked_margin` is non-zero and the fixture satisfies identity 3
-- rather than quietly contradicting it.
insert into public.positions
  (user_id, symbol, product, net_quantity, average_price, entry_reference_price, blocked_margin)
values
  ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'MIS', -20, 45.00, 45.00, 1200.00);

-- Two more ledger rows on top of the bootstrap's SIGNUP_CREDIT, netting to zero
-- so `available_cash` still equals Σ ledger and the fixture does not assert
-- against a state §12.1 forbids.
insert into public.fund_ledger (user_id, type, amount, balance_after, note) values
  ('11111111-1111-1111-1111-111111111111', 'MARGIN_BLOCK',   -5000.00,  95000.00, 'fixture'),
  ('11111111-1111-1111-1111-111111111111', 'MARGIN_RELEASE',  5000.00, 100000.00, 'fixture');

-- used_margin pinned to the position's collateral, per identity 3.
update public.funds
   set available_cash = 100000.00, used_margin = 1200.00, opening_balance = 100000.00
 where user_id = '11111111-1111-1111-1111-111111111111';

-- ── Ada: the overview ───────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select results_eq(
  $$ select available_cash, used_margin, opening_balance, realised_pnl
       from public.funds_overview $$,
  $$ values (100000.00::numeric, 1200.00::numeric, 100000.00::numeric, 100.25::numeric) $$,
  'the cards read straight off funds, with §9''s realised figure summed beside them'
);

select is(
  (select realised_pnl from public.funds_overview),
  100.25::numeric,
  '§9: realised P&L is the sum over trades — 120.50 + (−20.25) — and nothing else'
);

select results_eq(
  $$ select order_count, trade_count, holding_count, position_count, ledger_count
       from public.funds_overview $$,
  $$ values (2::bigint, 2::bigint, 1::bigint, 1::bigint, 3::bigint) $$,
  '§11: the five counts the reset dialog names match their tables'
);

select is(
  (select ledger_count from public.funds_overview),
  3::bigint,
  'the ledger count includes the bootstrap SIGNUP_CREDIT, not only rows a trade wrote'
);

-- ── Bob: a never-traded account ─────────────────────────────────────────────

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select results_eq(
  $$ select available_cash, used_margin, opening_balance, realised_pnl
       from public.funds_overview $$,
  $$ values (100000.00::numeric, 0.00::numeric, 100000.00::numeric, 0.00::numeric) $$,
  'a never-traded account still produces a row, driven from funds rather than trades'
);

select is(
  (select realised_pnl from public.funds_overview),
  0.00::numeric,
  'and reports realised P&L as 0.00 rather than null — coalesce is what makes the empty sum honest'
);

select results_eq(
  $$ select order_count, trade_count, holding_count, position_count, ledger_count
       from public.funds_overview $$,
  $$ values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 1::bigint) $$,
  'with nothing to delete but the opening credit, which bootstrap wrote'
);

select is(
  (select count(*) from public.funds_overview),
  1::bigint,
  'exactly one row per caller — the correlated subqueries do not multiply it'
);

-- ── Isolation, and the falsification that gives it meaning ──────────────────

select is_empty(
  $$ select 1 from public.funds_overview
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'one user cannot read another''s cash through the view'
);

select is(
  (select realised_pnl from public.funds_overview),
  0.00::numeric,
  'nor another user''s realised P&L — the correlated sum is scoped by the outer row RLS allowed'
);

reset role;
alter view public.funds_overview set (security_invoker = off);
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select isnt_empty(
  $$ select 1 from public.funds_overview
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'with security_invoker off the view leaks, which proves RLS and not the correlated predicate is the boundary'
);

reset role;
alter view public.funds_overview set (security_invoker = on);
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is_empty(
  $$ select 1 from public.funds_overview
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'and switching it back restores the caller-only row'
);

select * from finish();
rollback;
