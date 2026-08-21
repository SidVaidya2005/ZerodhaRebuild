-- Every CHECK and foreign key on the money tables, driven to failure on purpose.
--
-- Three of these constraints are `trading-contract.md` §12 reconciliation
-- identities encoded in the schema, so the assertions below are the difference
-- between "the contract says so" and "the database refuses otherwise".
--
-- Each case isolates ONE constraint: every other column in the row is valid, so
-- a 23514 can only have come from the constraint under test. A case that trips
-- two constraints proves neither.
--
-- Runs as the connecting role throughout. RLS denial is 01-rls-money.sql's job;
-- this file is about what cannot be stored even by something allowed to write.
begin;
select plan(29);

-- ── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
-- Created by F13's bootstrap trigger on the insert above; pinned, not inserted.
update public.profiles set client_id = 'ZR100001'
  where id = '11111111-1111-1111-1111-111111111111';
insert into public.instruments (symbol, name, yahoo_symbol)
  values ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS');
-- funds: created by the bootstrap trigger at exactly these figures.
insert into public.orders (id, user_id, symbol, side, order_type, product, quantity)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET', 'CNC', 10);

-- ── funds (§12.4) ───────────────────────────────────────────────────────────

select throws_ok(
  $$update public.funds set available_cash = -1
     where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'available_cash cannot go negative — §12.4, the last line of defence');

select throws_ok(
  $$update public.funds set used_margin = -1
     where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'used_margin cannot go negative');

-- ── fund_ledger ─────────────────────────────────────────────────────────────

select throws_ok(
  $$insert into public.fund_ledger (user_id, type, amount, balance_after)
    values ('11111111-1111-1111-1111-111111111111', 'CHARGES', -10, -10)$$,
  '23514', null,
  'balance_after cannot go negative — cash floors at zero even in the §6 capped-loss case');

-- The contract removed RESET deliberately: reset_account wipes the ledger rather
-- than appending to it, because "returns to exactly the post-signup state" and
-- "keeps a RESET row" cannot both be true (§11).
select throws_ok(
  $$insert into public.fund_ledger (user_id, type, amount, balance_after)
    values ('11111111-1111-1111-1111-111111111111', 'RESET', 0, 0)$$,
  '22P02', null,
  'there is no RESET ledger type — §11 wipes rather than appends');

-- ── orders ──────────────────────────────────────────────────────────────────

select throws_ok(
  $$insert into public.orders (user_id, symbol, side, order_type, product, quantity)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET', 'CNC', 0)$$,
  '23514', null,
  'an order for zero shares is not an order');

-- §1: no counterparty book exists, so a fill is all of it or none of it.
select throws_ok(
  $$insert into public.orders (user_id, symbol, side, order_type, product,
      quantity, filled_quantity)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET',
      'CNC', 10, 4)$$,
  '23514', null,
  'a partial fill cannot be stored — §1 fills are all-or-nothing');

select throws_ok(
  $$insert into public.orders (user_id, symbol, side, order_type, product, quantity)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'LIMIT', 'CNC', 10)$$,
  '23514', null,
  'a LIMIT order without a limit price is refused');

select throws_ok(
  $$insert into public.orders (user_id, symbol, side, order_type, product,
      quantity, limit_price)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET',
      'CNC', 10, 1400)$$,
  '23514', null,
  'a MARKET order carrying a limit price is refused');

select throws_ok(
  $$insert into public.orders (user_id, symbol, side, order_type, product,
      quantity, filled_quantity, status)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET',
      'CNC', 10, 10, 'COMPLETE')$$,
  '23514', null,
  'a COMPLETE order must record the price it filled at');

select throws_ok(
  $$insert into public.orders (user_id, symbol, side, order_type, product,
      quantity, average_price)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET',
      'CNC', 10, 1400)$$,
  '23514', null,
  'an OPEN order cannot claim an average price');

-- §12.8, and the reason code-standards.md's execute_order example changed: this
-- is not deferrable, so a function cannot set the status and release the margin
-- in that order. Note every other column here is valid — average_price is set,
-- so the only thing wrong with this row is the margin.
select throws_ok(
  $$insert into public.orders (user_id, symbol, side, order_type, product,
      quantity, filled_quantity, status, average_price, blocked_margin)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET',
      'CNC', 10, 10, 'COMPLETE', 1400, 100)$$,
  '23514', null,
  'a COMPLETE order cannot still hold margin — §12.8');

select throws_ok(
  $$insert into public.orders (user_id, symbol, side, order_type, product,
      quantity, status, blocked_margin)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET',
      'CNC', 10, 'CANCELLED', 100)$$,
  '23514', null,
  'a CANCELLED order cannot still hold margin — §12.8');

select lives_ok(
  $$insert into public.orders (user_id, symbol, side, order_type, product,
      quantity, status, blocked_margin)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'BUY', 'MARKET',
      'CNC', 10, 'OPEN', 14100)$$,
  'an OPEN order may hold margin — the positive control for §12.8');

-- ── trades (§12.6) ──────────────────────────────────────────────────────────

-- §2 makes `charges` the sum of the already-rounded components rather than a
-- rounding of the unrounded sum, precisely so this reconciliation is exact.
select lives_ok(
  $$insert into public.trades (user_id, order_id, symbol, side, product,
      quantity, price, charges, charge_breakdown)
    values ('11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RELIANCE', 'BUY', 'CNC',
      10, 1400.00, 18.53,
      '{"brokerage":0,"stt":14.00,"exchange_txn":0.43,"sebi_turnover":0.01,
        "stamp_duty":2.10,"dp_charge":0,"gst":1.99}'::jsonb)$$,
  'a breakdown summing exactly to charges is accepted — §12.6 positive control');

select throws_ok(
  $$insert into public.trades (user_id, order_id, symbol, side, product,
      quantity, price, charges, charge_breakdown)
    values ('11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RELIANCE', 'BUY', 'CNC',
      10, 1400.00, 18.54,
      '{"brokerage":0,"stt":14.00,"exchange_txn":0.43,"sebi_turnover":0.01,
        "stamp_duty":2.10,"dp_charge":0,"gst":1.99}'::jsonb)$$,
  '23514', null,
  'a breakdown one paisa off its total is refused — §12.6');

select throws_ok(
  $$insert into public.trades (user_id, order_id, symbol, side, product,
      quantity, price, charges, charge_breakdown)
    values ('11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RELIANCE', 'BUY', 'CNC',
      10, 1400.00, 999.99, '{"brokerage":0}'::jsonb)$$,
  '23514', null,
  'a breakdown missing components cannot be stored — absent keys are 0, not omitted');

-- A key present but JSON null is the same hole through a different door, which
-- is why the shape check tests the type rather than mere containment.
select throws_ok(
  $$insert into public.trades (user_id, order_id, symbol, side, product,
      quantity, price, charges, charge_breakdown)
    values ('11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RELIANCE', 'BUY', 'CNC',
      10, 1400.00, 0,
      '{"brokerage":0,"stt":null,"exchange_txn":0,"sebi_turnover":0,
        "stamp_duty":0,"dp_charge":0,"gst":0}'::jsonb)$$,
  '23514', null,
  'a component set to JSON null is refused — a CHECK passes on NULL, so this must not reach it');

select throws_ok(
  $$insert into public.trades (user_id, order_id, symbol, side, product,
      quantity, price, charges, charge_breakdown)
    values ('11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RELIANCE', 'BUY', 'CNC',
      10, 0, 0,
      '{"brokerage":0,"stt":0,"exchange_txn":0,"sebi_turnover":0,
        "stamp_duty":0,"dp_charge":0,"gst":0}'::jsonb)$$,
  '23514', null,
  'a trade cannot execute at a price of zero');

-- ── holdings (§8, §12.5) ────────────────────────────────────────────────────

select throws_ok(
  $$insert into public.holdings (user_id, symbol, quantity, average_price)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 0, 1400)$$,
  '23514', null,
  'a holding at zero quantity is deleted, never stored — §12.5');

select throws_ok(
  $$insert into public.holdings (user_id, symbol, quantity, average_price)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', -5, 1400)$$,
  '23514', null,
  'a negative holding is impossible — CNC shorting does not exist (§8)');

-- ── positions (§6, §8, §12.11, §12.12) ──────────────────────────────────────

select throws_ok(
  $$insert into public.positions (user_id, symbol, product, net_quantity, average_price)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'MIS', 0, 1400)$$,
  '23514', null,
  'a position at zero net quantity is deleted, never stored — §8');

select throws_ok(
  $$insert into public.positions (user_id, symbol, product, net_quantity, average_price)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'CNC', 10, 1400)$$,
  '23514', null,
  'a CNC position is a bug, not a state — delivery settles into holdings');

-- §12.12: collateral is held against shorts only.
select throws_ok(
  $$insert into public.positions (user_id, symbol, product, net_quantity,
      average_price, blocked_margin)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'MIS', 10, 1400, 500)$$,
  '23514', null,
  'a long cannot hold collateral — §12.12');

-- §12.11 made structural: the two averages answer different questions, and a
-- long has no gross reference price because it needs no collateral basis.
select throws_ok(
  $$insert into public.positions (user_id, symbol, product, net_quantity,
      average_price, entry_reference_price)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'MIS', 10, 1400, 1400)$$,
  '23514', null,
  'a long cannot carry an entry_reference_price — §12.11');

select throws_ok(
  $$insert into public.positions (user_id, symbol, product, net_quantity, average_price)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'MIS', -10, 1399)$$,
  '23514', null,
  'a short MUST carry an entry_reference_price — without it, collateral has no basis');

select lives_ok(
  $$insert into public.positions (user_id, symbol, product, net_quantity,
      average_price, entry_reference_price, blocked_margin)
    values ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'MIS', -10,
      1399.00, 1400.00, 16840.00)$$,
  'a short carrying both averages and its collateral is accepted — §12.11 positive control');

-- ── Cascades ────────────────────────────────────────────────────────────────
--
-- A trade without its order is meaningless and a ledger row without its order is
-- unauditable. reset_account (§11) still deletes each table explicitly; these
-- cascades are the backstop against a future path that forgets one.

insert into public.orders (id, user_id, symbol, side, order_type, product, quantity)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111', 'RELIANCE', 'SELL', 'MARKET', 'CNC', 5);

insert into public.trades (user_id, order_id, symbol, side, product,
    quantity, price, charges, charge_breakdown)
  values ('11111111-1111-1111-1111-111111111111',
    'cccccccc-cccc-cccc-cccc-cccccccccccc', 'RELIANCE', 'SELL', 'CNC',
    5, 1410.00, 20.00,
    '{"brokerage":0,"stt":7.05,"exchange_txn":0.22,"sebi_turnover":0.01,
      "stamp_duty":0,"dp_charge":10.72,"gst":2.00}'::jsonb);

insert into public.fund_ledger (user_id, type, amount, balance_after, order_id)
  values ('11111111-1111-1111-1111-111111111111', 'SELL_CREDIT', 7050.00, 107050.00,
    'cccccccc-cccc-cccc-cccc-cccccccccccc');

delete from public.orders where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

select is_empty(
  $$select id from public.trades
     where order_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'deleting an order takes its trades with it');

select is_empty(
  $$select id from public.fund_ledger
     where order_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'deleting an order takes its ledger rows with it');

delete from public.profiles where id = '11111111-1111-1111-1111-111111111111';

-- Scoped to the fixture user, not the whole table. This suite runs as the
-- owning role, so RLS does not filter it: an unscoped `select … from
-- public.funds` also returns every real account in the database, and passed only
-- while there were none. F13's first live signup is what exposed that.
select is_empty(
  $$select user_id from public.funds
     where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'deleting a profile takes the whole account with it');

select * from finish();
rollback;
