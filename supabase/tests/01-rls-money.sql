-- RLS on the six money tables.
--
-- The posture here is stricter than anywhere else in the schema: `select` is the
-- only grant any client role holds, and only over its owner's rows. There is no
-- write policy for any command on any of these tables, because every write
-- arrives through a `security definer` function built in features 22-24.
--
-- So each table gets four assertions: the owner reads their own, the owner reads
-- none of anyone else's, and insert/update/delete are refused outright with
-- 42501 — a missing grant, not a policy filtering rows away.
begin;
select plan(33);

-- ── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

-- F13's trigger created the profiles, funds and SIGNUP_CREDIT rows on the
-- inserts above, so the fixture pins values rather than re-creating rows.
update public.profiles set client_id = 'ZR100001'
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set client_id = 'ZR100002'
  where id = '22222222-2222-2222-2222-222222222222';

insert into public.instruments (symbol, name, yahoo_symbol) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS');

-- funds: created by the bootstrap trigger at exactly these figures.

insert into public.orders (id, user_id, symbol, side, order_type, product, quantity)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET', 'CNC', 10),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222', 'RELIANCE', 'BUY', 'MARKET', 'CNC', 10);

-- fund_ledger: the bootstrap already wrote one SIGNUP_CREDIT row per user.

-- charge_breakdown must sum to charges, so these are real figures: a CNC buy of
-- 10 @ 1400 carries no brokerage, no DP and no STT-on-buy exemption.
insert into public.trades
  (user_id, order_id, symbol, side, product, quantity, price, charges, charge_breakdown)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'RELIANCE', 'BUY', 'CNC', 10, 1400.00, 18.53,
   '{"brokerage":0,"stt":14.00,"exchange_txn":0.43,"sebi_turnover":0.01,
     "stamp_duty":2.10,"dp_charge":0,"gst":1.99}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'RELIANCE', 'BUY', 'CNC', 10, 1400.00, 18.53,
   '{"brokerage":0,"stt":14.00,"exchange_txn":0.43,"sebi_turnover":0.01,
     "stamp_duty":2.10,"dp_charge":0,"gst":1.99}'::jsonb);

insert into public.holdings (user_id, symbol, quantity, average_price) values
  ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 10, 1401.85),
  ('22222222-2222-2222-2222-222222222222', 'RELIANCE', 10, 1401.85);

insert into public.positions
  (user_id, symbol, product, net_quantity, average_price, entry_reference_price, blocked_margin)
values
  ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'MIS', -5, 1399.00, 1400.00, 8420.00),
  ('22222222-2222-2222-2222-222222222222', 'RELIANCE', 'MIS', -5, 1399.00, 1400.00, 8420.00);

-- ── As user A ───────────────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select isnt_empty($$select user_id from public.funds$$,
  'user A reads their own funds');
select is_empty(
  $$select user_id from public.funds
     where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'user A reads none of user B''s funds');

select isnt_empty($$select id from public.fund_ledger$$,
  'user A reads their own ledger');
select is_empty(
  $$select id from public.fund_ledger
     where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'user A reads none of user B''s ledger');

select isnt_empty($$select id from public.orders$$,
  'user A reads their own orders');
select is_empty(
  $$select id from public.orders
     where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'user A reads none of user B''s orders');

select isnt_empty($$select id from public.trades$$,
  'user A reads their own trades');
select is_empty(
  $$select id from public.trades
     where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'user A reads none of user B''s trades');

select isnt_empty($$select symbol from public.holdings$$,
  'user A reads their own holdings');
select is_empty(
  $$select symbol from public.holdings
     where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'user A reads none of user B''s holdings');

select isnt_empty($$select symbol from public.positions$$,
  'user A reads their own positions');
select is_empty(
  $$select symbol from public.positions
     where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'user A reads none of user B''s positions');

-- ── No client role writes any of these, ever ────────────────────────────────
--
-- 42501 every time: the request never reaches a policy, because the grant is not
-- there. This is what makes the money functions the only write path.

select throws_ok(
  $$update public.funds set available_cash = 999999$$, '42501', null,
  'user A cannot inflate their own cash');
select throws_ok(
  $$insert into public.funds (user_id, available_cash, opening_balance)
    values ('11111111-1111-1111-1111-111111111111', 1, 1)$$, '42501', null,
  'user A cannot insert a funds row');
select throws_ok(
  $$delete from public.funds$$, '42501', null,
  'user A cannot delete a funds row');

select throws_ok(
  $$insert into public.fund_ledger (user_id, type, amount, balance_after)
    values ('11111111-1111-1111-1111-111111111111', 'SIGNUP_CREDIT', 1, 1)$$,
  '42501', null, 'user A cannot forge a ledger entry');
select throws_ok(
  $$update public.fund_ledger set amount = 999999$$, '42501', null,
  'user A cannot rewrite the ledger');
select throws_ok(
  $$delete from public.fund_ledger$$, '42501', null,
  'user A cannot erase the ledger');

select throws_ok(
  $$insert into public.orders (user_id, symbol, side, order_type, product, quantity)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET', 'CNC', 1)$$,
  '42501', null, 'user A cannot place an order by direct insert — place_order() only');
select throws_ok(
  $$update public.orders set status = 'COMPLETE'$$, '42501', null,
  'user A cannot fill their own order');
select throws_ok(
  $$delete from public.orders$$, '42501', null,
  'user A cannot delete an order');

select throws_ok(
  $$insert into public.trades (user_id, order_id, symbol, side, product,
      quantity, price, charges, charge_breakdown)
    values ('11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RELIANCE', 'BUY', 'CNC', 1, 1, 0,
      '{"brokerage":0,"stt":0,"exchange_txn":0,"sebi_turnover":0,
        "stamp_duty":0,"dp_charge":0,"gst":0}'::jsonb)$$,
  '42501', null, 'user A cannot invent a trade');
select throws_ok(
  $$update public.trades set realised_pnl = 999999$$, '42501', null,
  'user A cannot rewrite their P&L');
select throws_ok(
  $$delete from public.trades$$, '42501', null,
  'user A cannot delete a trade');

select throws_ok(
  $$insert into public.holdings (user_id, symbol, quantity, average_price)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 1, 1)$$,
  '42501', null, 'user A cannot grant themselves a holding');
select throws_ok(
  $$update public.holdings set quantity = 999999$$, '42501', null,
  'user A cannot inflate a holding');
select throws_ok(
  $$delete from public.holdings$$, '42501', null,
  'user A cannot delete a holding');

select throws_ok(
  $$insert into public.positions (user_id, symbol, product, net_quantity, average_price)
    values ('11111111-1111-1111-1111-111111111111', 'INFY', 'MIS', 1, 1)$$,
  '42501', null, 'user A cannot open a position by direct insert');
select throws_ok(
  $$update public.positions set blocked_margin = 0$$, '42501', null,
  'user A cannot release their own collateral');
select throws_ok(
  $$delete from public.positions$$, '42501', null,
  'user A cannot delete a position — and so cannot escape a square-off');

-- ── Grants, independently of policies ───────────────────────────────────────

reset role;

select is_empty(
  $$select table_name from information_schema.role_table_grants
     where grantee = 'anon'
       and table_schema = 'public'
       and table_name in ('funds', 'fund_ledger', 'orders',
                          'trades', 'holdings', 'positions')$$,
  'anon holds no privilege of any kind on any money table');

select is_empty(
  $$select table_name || ':' || privilege_type
      from information_schema.role_table_grants
     where grantee = 'authenticated'
       and table_schema = 'public'
       and table_name in ('funds', 'fund_ledger', 'orders',
                          'trades', 'holdings', 'positions')
       and privilege_type <> 'SELECT'$$,
  'authenticated holds SELECT and nothing else on every money table');

select isnt_empty(
  $$select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'orders'$$,
  'orders is in the supabase_realtime publication — the matcher fills asynchronously');

select * from finish();
rollback;
