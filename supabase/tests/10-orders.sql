-- Feature 24: the order engine, on hand-computed cases.
--
-- Every expected figure is computed in the comment above its assertion from the
-- §3 rate table, never restated as the expression the function uses.
--
-- **`market_state` is stubbed here, deliberately.** Tier 4 proves the real one
-- against the shared TypeScript module over every session boundary; what this
-- file needs is a *deterministic* session, because a suite whose result depends
-- on the day and hour it runs is worse than no suite. The stub is created inside
-- the transaction and the rollback removes it.
begin;
select plan(107);

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

-- Places an order as the owning user, exactly as the Server Action will.
create or replace function pg_temp.place(
  p_user uuid, p_side public.order_side, p_type public.order_type,
  p_product public.product_type, p_quantity integer, p_limit numeric default null
) returns table (order_id uuid, status public.order_status, rejection_reason text)
language plpgsql as $$
begin
  -- `place_order` reads auth.uid(), exactly as it will when a Server Action
  -- calls it, so the test sets the claim rather than passing a user id.
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  return query
    select * from public.place_order('RELIANCE', p_side, p_type, p_product, p_quantity, p_limit);
end;
$$;

create or replace function pg_temp.price(p_ltp numeric) returns void language sql as $$
  update public.quotes set ltp = p_ltp, fetched_at = now() where symbol = 'RELIANCE'
$$;

-- ── A. A CNC buy ────────────────────────────────────────────────────────────
--
-- CNC BUY 10 @ 100.00 — turnover 1000.00
--   brokerage 0 (delivery is free)
--   stt      0.001     × 1000 = 1.00
--   exchange 0.0000307 × 1000 = 0.0307 → 0.03
--   sebi     0.000001  × 1000 = 0.001  → 0.00
--   stamp    0.00015   × 1000 = 0.15
--   gst 0.18 × (0 + 0.0307 + 0.001) = 0.005706 → 0.01
--   charges = 1.00 + 0.03 + 0.00 + 0.15 + 0.01 = 1.19
--   cash out = 1000.00 + 1.19 = 1001.19
--   average  = (1000.00 + 1.19) / 10 = 100.119 → 100.12

select is(
  (select p.status from pg_temp.place('11111111-1111-1111-1111-111111111111', 'BUY', 'MARKET', 'CNC', 10) p),
  'COMPLETE'::public.order_status,
  'a market CNC buy fills inline'
);

select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'), 98998.81::numeric,
  'available_cash falls by exactly 10 × 100.00 + 1.19');

select is(pg_temp.used('11111111-1111-1111-1111-111111111111'), 0.00::numeric,
  'and no margin is left blocked');

select results_eq(
  $$ select quantity, average_price from public.holdings
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  $$ values (10, 100.12::numeric) $$,
  'the holding carries the quantity and the charges-capitalised average'
);

select results_eq(
  $$ select type::text, amount from public.fund_ledger
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid and type <> 'SIGNUP_CREDIT'
      order by created_at $$,
  $$ values ('MARGIN_BLOCK',   -1001.19::numeric),
            ('MARGIN_RELEASE',  1001.19::numeric),
            ('CHARGES',           -1.19::numeric),
            ('BUY_DEBIT',      -1000.00::numeric) $$,
  'four ledger rows: the reservation, its release, the charges and the cost'
);

select is(
  (select balance_after from public.fund_ledger
    where user_id = '11111111-1111-1111-1111-111111111111'::uuid
    order by created_at desc limit 1),
  98998.81::numeric,
  '§12.2: the newest balance_after is the balance'
);

select is(
  (select realised_pnl from public.trades where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  0.00::numeric,
  '§9: realised P&L is 0.00 on an opening leg, never null'
);

-- ── B. A second buy at a different price ────────────────────────────────────
--
-- CNC BUY 20 @ 110.00 — turnover 2200.00
--   stt 2.20, exchange 0.06754 → 0.07, sebi 0.0022 → 0.00, stamp 0.33
--   gst 0.18 × (0.06754 + 0.0022) = 0.0125532 → 0.01
--   charges = 2.20 + 0.07 + 0.00 + 0.33 + 0.01 = 2.61
--   new average = (10 × 100.12 + 2200.00 + 2.61) / 30 = 3203.81 / 30
--               = 106.7936… → 106.79

select lives_ok($$ select pg_temp.price(110.00) $$, 'the price moves to 110.00');

select is(
  (select p.status from pg_temp.place('11111111-1111-1111-1111-111111111111', 'BUY', 'MARKET', 'CNC', 20) p),
  'COMPLETE'::public.order_status,
  'the second buy fills'
);

select results_eq(
  $$ select quantity, average_price from public.holdings
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  $$ values (30, 106.79::numeric) $$,
  'the weighted average is recomputed over both fills, charges included'
);

-- ── C. A CNC sell, closing part of the holding ──────────────────────────────
--
-- CNC SELL 10 @ 120.00 — turnover 1200.00
--   stt 1.20, exchange 0.03684 → 0.04, sebi 0.0012 → 0.00, stamp 0 (sell)
--   dp 13.00 — a delivery sell, flat
--   gst 0.18 × (0.03684 + 0.0012 + 13.00) = 2.3468472 → 2.35
--   charges = 1.20 + 0.04 + 0.00 + 13.00 + 2.35 = 16.59
--   realised = (120.00 − 106.79) × 10 − 16.59 = 132.10 − 16.59 = 115.51

select lives_ok($$ select pg_temp.price(120.00) $$, 'the price moves to 120.00');

select is(
  (select p.status from pg_temp.place('11111111-1111-1111-1111-111111111111', 'SELL', 'MARKET', 'CNC', 10) p),
  'COMPLETE'::public.order_status,
  'a delivery sell against the holding fills'
);

select results_eq(
  $$ select quantity, average_price from public.holdings
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  $$ values (20, 106.79::numeric) $$,
  '§8: a partial close reduces the quantity and leaves average_price alone'
);

select is(
  (select realised_pnl from public.trades
    where user_id = '11111111-1111-1111-1111-111111111111'::uuid order by traded_at desc limit 1),
  115.51::numeric,
  '§9: realised P&L is net of the closing leg''s charges, and of those only'
);

select results_eq(
  $$ select type::text, amount from public.fund_ledger
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid
        and type in ('SELL_CREDIT', 'CHARGES')
      order by created_at desc limit 2 $$,
  $$ values ('CHARGES',      -16.59::numeric),
            ('SELL_CREDIT', 1200.00::numeric) $$,
  '§12.9: a long close settles through SELL_CREDIT, never a REALISED_PNL row'
);

select is_empty(
  $$ select 1 from public.fund_ledger
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid and type = 'REALISED_PNL' $$,
  'and writes no REALISED_PNL row at all'
);

-- ── D. A short entry ────────────────────────────────────────────────────────
--
-- Bo shorts 100 @ 100.00. Figures from F23's own suite:
--   entry charges                                  6.42
--   short_collateral_requirement(100, 100.00) = 12005.06
--   reservation = 12005.06 + 6.42            = 12011.48
--   at a fill of 100.00, delta = 0.00
--   average_price = (10000.00 − 6.42) / 100 = 99.9358 → 99.94   ← charges LOWER it
--   entry_reference_price = 100.00, gross

select lives_ok($$ select pg_temp.price(100.00) $$, 'the price returns to 100.00');

select is(
  (select p.status from pg_temp.place('22222222-2222-2222-2222-222222222222', 'SELL', 'MARKET', 'MIS', 100) p),
  'COMPLETE'::public.order_status,
  'an intraday sell with no long opens a short'
);

select results_eq(
  $$ select net_quantity, average_price, entry_reference_price, blocked_margin
       from public.positions where user_id = '22222222-2222-2222-2222-222222222222'::uuid $$,
  $$ values (-100, 99.94::numeric, 100.00::numeric, 12005.06::numeric) $$,
  '§8: entry charges LOWER a short''s average — 99.94, not 100.06 — and the gross basis is separate'
);

-- The falsification, asserted rather than performed: the long formula gives
-- 100.06, and covering flat at 100.00 would then report (100.06 − 100.00) × 100
-- = +6.00 — the entry charges, counted as a gain.
select cmp_ok(
  (select average_price from public.positions where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  '<', 100.00::numeric,
  'the long formula would give 100.06 and turn 6.42 of charges into a 6.00 profit'
);

select is(pg_temp.cash('22222222-2222-2222-2222-222222222222'), 87988.52::numeric,
  'cash falls by the collateral plus the actual charges, 12011.48');

select is(pg_temp.used('22222222-2222-2222-2222-222222222222'), 12005.06::numeric,
  'and the collateral is held against the position, not spent');

select results_eq(
  $$ select type::text, amount from public.fund_ledger
      where user_id = '22222222-2222-2222-2222-222222222222'::uuid and type <> 'SIGNUP_CREDIT'
      order by created_at $$,
  $$ values ('MARGIN_BLOCK',   -12011.48::numeric),
            ('MARGIN_RELEASE',      6.42::numeric),
            ('CHARGES',           -6.42::numeric) $$,
  'exactly ONE CHARGES row — the transfer writes it, and execute_order must not write a second'
);

select is(
  (select count(*) from public.fund_ledger
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid and type = 'CHARGES'),
  1::bigint,
  'stated separately, because a second row here debited every short entry twice'
);

select is_empty(
  $$ select 1 from public.fund_ledger
      where user_id = '22222222-2222-2222-2222-222222222222'::uuid and type = 'SELL_CREDIT' $$,
  '§7: no proceeds are credited on a short entry — a short settles on cover'
);

-- ── E. Covering half ────────────────────────────────────────────────────────
--
-- MIS BUY 50 @ 90.00 — turnover 4500.00
--   brokerage min(1.35, 20) = 1.35, stt 0 (intraday buy)
--   exchange 0.0000307 × 4500 = 0.13815 → 0.14
--   sebi     0.000001  × 4500 = 0.0045  → 0.00
--   stamp    0.00003   × 4500 = 0.135   → 0.14
--   gst 0.18 × (1.35 + 0.13815 + 0.0045) = 0.268677 → 0.27
--   charges = 1.35 + 0.14 + 0.00 + 0.14 + 0.27 = 1.90
--
--   collateral for the remaining 50 = 6002.53, so 6002.53 is released
--   cash settlement = (100.00 − 90.00) × 50 = 500.00   ← GROSS basis
--   reported P&L    = ( 99.94 − 90.00) × 50 − 1.90 = 495.10   ← NET basis

select lives_ok($$ select pg_temp.price(90.00) $$, 'the price falls to 90.00');

select is(
  (select p.status from pg_temp.place('22222222-2222-2222-2222-222222222222', 'BUY', 'MARKET', 'MIS', 50) p),
  'COMPLETE'::public.order_status,
  'a covering buy fills — and reserves from the collateral, not from cash'
);

select results_eq(
  $$ select net_quantity, average_price, blocked_margin
       from public.positions where user_id = '22222222-2222-2222-2222-222222222222'::uuid $$,
  $$ values (-50, 99.94::numeric, 6002.53::numeric) $$,
  '§8: a partial cover moves the quantity, leaves the average alone, and halves the collateral'
);

select is(pg_temp.cash('22222222-2222-2222-2222-222222222222'), 94489.15::numeric,
  'cash = 87988.52 + 6002.53 released − 1.90 charges + 500.00 settled');

select results_eq(
  $$ select type::text, amount from public.fund_ledger
      where user_id = '22222222-2222-2222-2222-222222222222'::uuid
      order by created_at desc limit 3 $$,
  $$ values ('REALISED_PNL',    500.00::numeric),
            ('CHARGES',          -1.90::numeric),
            ('MARGIN_RELEASE', 6002.53::numeric) $$,
  '§7: the cover releases the collateral, pays the charges and settles the difference'
);

-- The distinction the contract was corrected for. Settling from the net 99.94
-- would credit 497.00 and leave the balance 3.00 short — the entry charges,
-- debited a second time.
select is(
  (select realised_pnl from public.trades
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid order by traded_at desc limit 1),
  495.10::numeric,
  'trades.realised_pnl reports from the NET average while the cash row settled from the GROSS one'
);

-- ── F. Covering the rest ────────────────────────────────────────────────────

select is(
  (select p.status from pg_temp.place('22222222-2222-2222-2222-222222222222', 'BUY', 'MARKET', 'MIS', 50) p),
  'COMPLETE'::public.order_status,
  'the second half covers'
);

select is_empty(
  $$ select 1 from public.positions where user_id = '22222222-2222-2222-2222-222222222222'::uuid $$,
  '§12.5: the position is deleted at zero, never retained'
);

select is(pg_temp.used('22222222-2222-2222-2222-222222222222'), 0.00::numeric,
  'and all collateral is released');

-- Shorted 100 at 100.00, covered at 90.00: 1000.00 of gross gain, less 6.42 of
-- entry charges and 1.90 + 1.90 of exit charges.
select is(pg_temp.cash('22222222-2222-2222-2222-222222222222'), 100989.78::numeric,
  'the full round trip lands on 100000.00 + 1000.00 − 6.42 − 3.80');

select is(
  (select sum(amount) + 100000.00 from public.fund_ledger
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid and type <> 'SIGNUP_CREDIT'),
  100989.78::numeric,
  '§12.1: and the ledger sums to it'
);

-- The reported total is 990.20 against a true 989.78. The 0.42 is average_price
-- rounded to the paisa over 100 shares, which §9 accepts and §12.10 asserts
-- against the stored average rather than against the cash.
select is(
  (select sum(realised_pnl) from public.trades
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  990.20::numeric,
  'reported P&L differs from cash by 0.42 — average_price rounding, not a leak'
);

-- ── G. A fill that crosses zero ─────────────────────────────────────────────
--
-- Ada opens an MIS long of 4 @ 100.00, then sells 10 — closing 4 and shorting 6.
--
-- MIS BUY 4 @ 100.00 — turnover 400.00
--   brokerage 0.12, exchange 0.01228 → 0.01, sebi 0.0004 → 0.00, stamp 0.012 → 0.01
--   gst 0.18 × (0.12 + 0.01228 + 0.0004) = 0.0238824 → 0.02
--   charges = 0.16;  average = (400.00 + 0.16) / 4 = 100.04
--
-- MIS SELL 10 @ 100.00 — turnover 1000.00
--   brokerage 0.30, stt 0.25, exchange 0.03, sebi 0.00
--   gst 0.18 × (0.30 + 0.0307 + 0.001) = 0.059706 → 0.06
--   charges = 0.64
--   closing share = round(0.64 × 4 / 10, 2) = 0.26; opening share = 0.64 − 0.26 = 0.38
--   realised  = (100.00 − 100.04) × 4 − 0.26 = −0.16 − 0.26 = −0.42
--   new short average = (600.00 − 0.38) / 6 = 99.9366… → 99.94
--   collateral = short_collateral_requirement(6, 100.00) = 720.30

select lives_ok($$ select pg_temp.price(100.00) $$, 'the price returns to 100.00');

select is(
  (select p.status from pg_temp.place('11111111-1111-1111-1111-111111111111', 'BUY', 'MARKET', 'MIS', 4) p),
  'COMPLETE'::public.order_status,
  'an intraday long opens'
);

select results_eq(
  $$ select net_quantity, average_price, entry_reference_price, blocked_margin
       from public.positions where user_id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  $$ values (4, 100.04::numeric, null::numeric, 0.00::numeric) $$,
  '§12.12: a long carries no collateral and no gross reference price'
);

select is(
  (select p.status from pg_temp.place('11111111-1111-1111-1111-111111111111', 'SELL', 'MARKET', 'MIS', 10) p),
  'COMPLETE'::public.order_status,
  'selling 10 against a long of 4 fills — closing 4 and shorting 6'
);

select results_eq(
  $$ select net_quantity, average_price, entry_reference_price, blocked_margin
       from public.positions where user_id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  $$ values (-6, 99.94::numeric, 100.00::numeric, 720.30::numeric) $$,
  'the position flips to a short of 6 carrying only the opening leg''s charges'
);

select is(
  (select realised_pnl from public.trades
    where user_id = '11111111-1111-1111-1111-111111111111'::uuid order by traded_at desc limit 1),
  -0.42::numeric,
  'the closing leg realises against its 4/10 share of the charges, 0.26'
);

select is(
  (select count(*) from public.fund_ledger
    where order_id = (select id from public.orders
                       where user_id = '11111111-1111-1111-1111-111111111111'::uuid
                         and side = 'SELL' and product = 'MIS')
      and type = 'CHARGES'),
  1::bigint,
  'one CHARGES row for the whole order, both legs — §9'
);

select is(
  (select charges from public.trades
    where user_id = '11111111-1111-1111-1111-111111111111'::uuid order by traded_at desc limit 1),
  0.64::numeric,
  'and the two apportioned shares, 0.26 and 0.38, sum to it exactly'
);

-- ── H. Rejections ───────────────────────────────────────────────────────────

select is(
  (select p.rejection_reason from pg_temp.place('11111111-1111-1111-1111-111111111111', 'BUY', 'MARKET', 'CNC', 100000) p),
  'INSUFFICIENT_FUNDS',
  'a buy beyond the balance is rejected'
);

select is(
  (select status from public.orders where rejection_reason = 'INSUFFICIENT_FUNDS'),
  'REJECTED'::public.order_status,
  'and the order row exists to be shown, rather than being rolled back'
);

select is(
  (select p.rejection_reason from pg_temp.place('22222222-2222-2222-2222-222222222222', 'SELL', 'MARKET', 'CNC', 5) p),
  'NO_HOLDING',
  'a delivery sell without the holding is rejected NO_HOLDING, not INSUFFICIENT_FUNDS'
);

select is(
  (select p.rejection_reason from pg_temp.place('22222222-2222-2222-2222-222222222222', 'BUY', 'MARKET', 'CNC', 0) p),
  'INVALID_QUANTITY',
  'a zero quantity is rejected without an order row, which the CHECK would refuse anyway'
);

select is(pg_temp.cash('22222222-2222-2222-2222-222222222222'), 100989.78::numeric,
  'and no rejection moved a rupee');

-- A stale quote. The staleness window is five minutes.
select lives_ok(
  $$ update public.quotes set fetched_at = now() - interval '6 minutes' where symbol = 'RELIANCE' $$,
  'the quote goes stale'
);

select is(
  (select p.rejection_reason from pg_temp.place('22222222-2222-2222-2222-222222222222', 'BUY', 'MARKET', 'CNC', 1) p),
  'NO_QUOTE',
  '§5: a market order is never filled at a stale price'
);

select is(pg_temp.used('22222222-2222-2222-2222-222222222222'), 0.00::numeric,
  'and its reservation is released on the way out');

select lives_ok($$ select pg_temp.price(100.00) $$, 'the quote refreshes');

-- ── I. The session gate ─────────────────────────────────────────────────────

create or replace function public.market_state(p_at timestamptz default now())
returns public.market_session_state language sql stable
as $$ select 'CLOSED'::public.market_session_state $$;

select is(
  (select p.rejection_reason from pg_temp.place('22222222-2222-2222-2222-222222222222', 'BUY', 'MARKET', 'CNC', 1) p),
  'MARKET_CLOSED',
  '§5: a market order placed outside the session is rejected'
);

select is(
  (select p.status from pg_temp.place('22222222-2222-2222-2222-222222222222', 'BUY', 'LIMIT', 'CNC', 1, 90.00) p),
  'OPEN'::public.order_status,
  'but a limit order may be placed then and simply waits'
);

select cmp_ok(pg_temp.used('22222222-2222-2222-2222-222222222222'), '>', 0.00::numeric,
  'holding its reservation while it waits');

-- ── J. Cancelling ───────────────────────────────────────────────────────────

select is(
  (select public.cancel_order(id) from public.orders
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid and status = 'OPEN'),
  true,
  'an open order cancels'
);

select is(pg_temp.used('22222222-2222-2222-2222-222222222222'), 0.00::numeric,
  'and its reservation comes back in full');

select is(pg_temp.cash('22222222-2222-2222-2222-222222222222'), 100989.78::numeric,
  'leaving cash exactly where it was before the order');

select is(
  (select public.cancel_order(id) from public.orders
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid and status = 'CANCELLED'),
  false,
  'cancelling it again is a no-op'
);

-- `security definer` bypasses RLS, so the ownership check is the only thing
-- standing between a guessed id and someone else's order.
select is(
  (select public.cancel_order(id) from public.orders
    where user_id = '11111111-1111-1111-1111-111111111111'::uuid limit 1),
  false,
  'and Bo cannot cancel Ada''s order by id'
);

-- ── K. A cover the account cannot afford (§6) ───────────────────────────────
--
-- A short's loss is unbounded while its collateral is bounded, so this is a
-- stated simulator rule rather than an edge case: the position still closes,
-- cash floors at zero, and the shortfall is auditable.
--
-- Bo, holding 12100.00, shorts 100 @ 100.00 — reservation 12011.48, leaving
-- 88.52 in cash and 12005.06 of collateral. The price then triples.
--
-- MIS BUY 100 @ 250.00 — turnover 25000.00
--   brokerage min(7.50, 20) = 7.50, stt 0 (intraday buy)
--   exchange 0.0000307 × 25000 = 0.7675 → 0.77
--   sebi     0.000001  × 25000 = 0.025  → 0.03
--   stamp    0.00003   × 25000 = 0.75
--   gst 0.18 × (7.50 + 0.7675 + 0.025) = 1.49265 → 1.49
--   charges = 7.50 + 0.77 + 0.03 + 0.75 + 1.49 = 10.54
--
--   collateral back 12005.06 → 12093.58, charges → 12083.04
--   loss (100.00 − 250.00) × 100 = −15000.00, against 12083.04 of cash
--   → SIMULATION_ADJUSTMENT +2916.96, REALISED_PNL −15000.00, cash 0.00
--   → trades.realised_pnl = (99.94 − 250.00) × 100 − 10.54 = −15016.54, uncapped

-- Section I left the market closed; these fills need it open again.
create or replace function public.market_state(p_at timestamptz default now())
returns public.market_session_state language sql stable
as $$ select 'OPEN'::public.market_session_state $$;

update public.funds set available_cash = 12100.00, used_margin = 0
 where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
delete from public.fund_ledger where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
insert into public.fund_ledger (user_id, type, amount, balance_after, note)
values ('22222222-2222-2222-2222-222222222222'::uuid, 'SIGNUP_CREDIT', 12100.00, 12100.00, 'Fixture');

select is(
  (select p.status from pg_temp.place('22222222-2222-2222-2222-222222222222', 'SELL', 'MARKET', 'MIS', 100) p),
  'COMPLETE'::public.order_status,
  'the short opens on an account with almost nothing left over'
);

select lives_ok($$ select pg_temp.price(250.00) $$, 'the price triples against it');

select is(
  (select p.status from pg_temp.place('22222222-2222-2222-2222-222222222222', 'BUY', 'MARKET', 'MIS', 100) p),
  'COMPLETE'::public.order_status,
  '§6: the cover still fills — no position is ever stranded for want of funds'
);

select is(pg_temp.cash('22222222-2222-2222-2222-222222222222'), 0.00::numeric,
  'cash floors at exactly zero, never below');

select is_empty(
  $$ select 1 from public.positions where user_id = '22222222-2222-2222-2222-222222222222'::uuid $$,
  'and the position is closed');

select results_eq(
  $$ select type::text, amount from public.fund_ledger
      where user_id = '22222222-2222-2222-2222-222222222222'::uuid
        and type in ('SIMULATION_ADJUSTMENT', 'REALISED_PNL') order by created_at $$,
  $$ values ('SIMULATION_ADJUSTMENT',  2916.96::numeric),
            ('REALISED_PNL',         -15000.00::numeric) $$,
  'the loss is debited in full and the uncovered part credited — the credit first, or the CHECK refuses it'
);

select is(
  (select realised_pnl from public.trades
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid order by traded_at desc limit 1),
  -15016.54::numeric,
  '§6: trades.realised_pnl still carries the TRUE, uncapped loss so Reports stay honest'
);

select is(
  (select sum(amount) from public.fund_ledger
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  0.00::numeric,
  '§12.1: available_cash still equals the sum of the ledger across the capping'
);

-- ── L. Reset ────────────────────────────────────────────────────────────────

select lives_ok(
  $$ select public.reset_account() $$,
  'reset runs for the current user'
);

select results_eq(
  $$ select
       (select count(*) from public.orders   where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
       (select count(*) from public.trades   where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
       (select count(*) from public.holdings where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
       (select count(*) from public.positions where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
       (select count(*) from public.fund_ledger where user_id = '22222222-2222-2222-2222-222222222222'::uuid) $$,
  $$ values (0::bigint, 0::bigint, 0::bigint, 0::bigint, 1::bigint) $$,
  '§11: everything wiped, and exactly one ledger row left'
);

select results_eq(
  $$ select available_cash, used_margin, opening_balance from public.funds
      where user_id = '22222222-2222-2222-2222-222222222222'::uuid $$,
  $$ values (100000.00::numeric, 0.00::numeric, 100000.00::numeric) $$,
  'the balance is back to the opening figure'
);

select results_eq(
  $$ select type::text, amount, balance_after from public.fund_ledger
      where user_id = '22222222-2222-2222-2222-222222222222'::uuid $$,
  $$ values ('SIGNUP_CREDIT', 100000.00::numeric, 100000.00::numeric) $$,
  'and the one row is a fresh SIGNUP_CREDIT — §11 has no RESET type'
);

select cmp_ok(
  (select count(*) from public.watchlist_items
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid)::integer,
  '>', 0,
  '§11: watchlist_items is left alone'
);

select cmp_ok(
  (select count(*) from public.orders
    where user_id = '11111111-1111-1111-1111-111111111111'::uuid)::integer,
  '>', 0,
  'and the reset touched nobody else''s account'
);

-- ── M. A CNC sell that closes the holding out (F30) ─────────────────────────
--
-- **After L, deliberately.** `reset_account()` acts on `auth.uid()`, and
-- `pg_temp.place` sets that claim for the user it places as — so a section
-- placing an order for Ao ahead of the reset silently redirects the reset onto
-- Ao's account and takes four of L's assertions down with it. L is left reading
-- Bo's claim from K, which is what it was written against.
--
-- Ao has held 20 RELIANCE since section C. Selling all 20 must remove the row,
-- not leave it at zero: §8 says a row reaching zero quantity is deleted in both
-- tables, because a zero row would otherwise pollute Holdings, Positions and the
-- top-10 donut with a position the user does not have.
--
-- **Both assertions are needed and neither is redundant.** `holdings` carries
-- `CHECK (quantity > 0)`, so a build that tried to leave a zero row would raise
-- rather than write one — and the order would come back REJECTED with the row
-- still holding 20. Asserting only that the table is empty would then pass on a
-- build where the sell had failed outright, which is the same end state reached
-- for the opposite reason (the F29 lesson).

select lives_ok($$ select pg_temp.price(130.00) $$, 'the price moves to 130.00');

select is(
  (select p.status from pg_temp.place('11111111-1111-1111-1111-111111111111', 'SELL', 'MARKET', 'CNC', 20) p),
  'COMPLETE'::public.order_status,
  'a delivery sell of the entire holding fills'
);

select is_empty(
  $$ select 1 from public.holdings
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid $$,
  '§8: and the holdings row is deleted rather than left at quantity zero'
);

-- ── N. A capped loss on a fill that CROSSES ZERO (§6, §7) ───────────────────
--
-- Section K covers a capped loss on a pure cover, where nothing follows the cap.
-- This is the other shape: a BUY that covers a short *and* opens a long, whose
-- cover loss exceeds the account. Found by the Phase 4 checkpoint review.
--
-- §6's cap leaves `available_cash` at exactly zero. The opening leg's BUY_DEBIT
-- used to be posted straight after it, and `funds_available_cash_non_negative`
-- is not deferrable — so the debit was refused and the whole fill died with
-- 23514. Not a rejection: through `place_order` the RPC aborted outright, and
-- through `match_open_orders` the order faulted on every tick forever. §6 says
-- the position still closes and architecture.md says no position is ever
-- stranded; the loss cap was the thing preventing both.
--
-- **Falsifiability:** apply 20260905170000_closing_leg_never_rejected.sql (the
-- body with the opening leg posted after the cap) and the flip assertion below
-- dies on 23514 rather than merely reporting a wrong number.
--
-- Bo is restaged with 13000.00 — enough to afford a one-share opening leg at the
-- tripled price, which K's 12100.00 fixture is not.
--
-- Short 100 @ 100.00 — reservation 12011.48 (collateral 12005.06 + charges 6.42),
-- leaving 988.52 in cash, average_price 99.94, entry_reference_price 100.00.
--
-- The price triples. MIS BUY 101 @ 250.00 covers 100 and opens 1.
--   turnover 25250.00
--   brokerage 0.0003 × 25250 = 7.575 → 7.58, stt 0 (intraday buy)
--   exchange  0.0000307 × 25250 = 0.775175 → 0.78
--   sebi      0.000001  × 25250 = 0.02525  → 0.03
--   stamp     0.00003   × 25250 = 0.7575   → 0.76
--   gst 0.18 × (7.575 + 0.775175 + 0.02525) = 1.5075765 → 1.51
--   charges = 7.58 + 0.78 + 0.03 + 0.76 + 1.51 = 10.66
--   closing share round(10.66 × 100/101, 2) = 10.55, opening remainder 0.11
--
--   reservation 1 × 250.00 + 10.66 = 260.66 → cash 727.86
--   release 260.66 → 988.52, collateral 12005.06 → 12993.58, charges → 12982.92
--   BUY_DEBIT −250.00 → 12732.92   ← the row that has to land BEFORE the cap
--   loss (100.00 − 250.00) × 100 = −15000.00 against 12732.92
--   → SIMULATION_ADJUSTMENT +2267.08, REALISED_PNL −15000.00, cash 0.00
--   → trades.realised_pnl = (99.94 − 250.00) × 100 − 10.55 = −15016.55, uncapped

update public.funds set available_cash = 13000.00, used_margin = 0
 where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
delete from public.fund_ledger where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
insert into public.fund_ledger (user_id, type, amount, balance_after, note)
values ('22222222-2222-2222-2222-222222222222'::uuid, 'SIGNUP_CREDIT', 13000.00, 13000.00, 'Fixture');

select lives_ok($$ select pg_temp.price(100.00) $$, 'the price returns to 100.00');

select is(
  (select p.status from pg_temp.place('22222222-2222-2222-2222-222222222222', 'SELL', 'MARKET', 'MIS', 100) p),
  'COMPLETE'::public.order_status,
  'the short opens, leaving just enough cash for a one-share opening leg later'
);

select lives_ok($$ select pg_temp.price(250.00) $$, 'the price triples against it');

select is(
  (select p.status from pg_temp.place('22222222-2222-2222-2222-222222222222', 'BUY', 'MARKET', 'MIS', 101) p),
  'COMPLETE'::public.order_status,
  '§6: a fill crossing zero into a capped loss still completes — it does not abort on the CHECK'
);

select is(pg_temp.cash('22222222-2222-2222-2222-222222222222'), 0.00::numeric,
  'cash floors at exactly zero across the crossing, never below');

select is(
  (select net_quantity from public.positions
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid and symbol = 'RELIANCE'),
  1,
  '§8: the opening leg survives the capping — the flip leaves a long of 1, not nothing'
);

select results_eq(
  $$ select type::text, amount from public.fund_ledger
      where user_id = '22222222-2222-2222-2222-222222222222'::uuid
        and type in ('BUY_DEBIT', 'SIMULATION_ADJUSTMENT', 'REALISED_PNL') order by created_at $$,
  $$ values ('BUY_DEBIT',             -250.00::numeric),
            ('SIMULATION_ADJUSTMENT', 2267.08::numeric),
            ('REALISED_PNL',        -15000.00::numeric) $$,
  '§7: the purchase is paid for FIRST, and the simulator absorbs only what is left uncovered'
);

select is(
  (select sum(amount) from public.fund_ledger
    where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  0.00::numeric,
  '§12.1: available_cash still equals the sum of the ledger across a capped crossing'
);

-- ── O. A flip funded by its own sale (Phase 4 checkpoint) ───────────────────
--
-- `transfer_margin_to_position` tests the collateral shortfall against
-- `available_cash`, and until the checkpoint `execute_order` called it BEFORE
-- posting the closing leg's SELL_CREDIT. A SELL crossing zero was therefore
-- measured against a balance that excluded the proceeds of the very sale being
-- executed, and a flip whose own sale covered the shortfall five times over was
-- rejected INSUFFICIENT_FUNDS.
--
-- Reaching it needs a gap-up: §6 reserves a limit order against its limit_price
-- and §5 fills a limit sell at the observed price, which is at or ABOVE it, so
-- only a sell filling above its limit can need more collateral than it reserved.
-- At the limit, delta is zero and the bug is invisible — which is why section G,
-- a MARKET flip, passed throughout.
--
-- Cyd holds an MIS long of 10 @ 100.00 and rests a LIMIT SELL of 20 @ 100.00
-- while the market is at 90.00. Shorting excess = 20 − 10 = 10.
--   reserved   = short_collateral(10, 100.00) + charges(20 @ 100.00)
--              = 1200.51 + 1.28 = 1201.79        → cash 1300.00 − 1201.79 = 98.21
-- The price then gaps to 120.00 and it fills there.
--   required   = short_collateral(10, 120.00) + charges(20 @ 120.00)
--              = 1440.60 + 1.53 = 1442.13
--   delta      = 1442.13 − 1201.79 = 240.34, against 98.21 of cash
--   proceeds   = 10 × 120.00 = 1200.00, posted first, so the delta is affordable
--   closing share of charges = round(1.53 × 10 / 20, 2) = 0.77; opening = 0.76
--   realised   = (120.00 − 100.00) × 10 − 0.77 = 199.23
--   new short average = (1200.00 − 0.76) / 10 = 119.924 → 119.92
--   cash 98.21 + 1200.00 − 240.34 + 1.53 − 1.53 = 1057.87;  used_margin 1440.60

create or replace function public.market_state(p_at timestamptz default now())
returns public.market_session_state language sql stable
as $$ select 'OPEN'::public.market_session_state $$;

insert into auth.users (id) values ('33333333-3333-3333-3333-333333333333');

update public.funds set available_cash = 1300.00, used_margin = 0
 where user_id = '33333333-3333-3333-3333-333333333333'::uuid;
delete from public.fund_ledger where user_id = '33333333-3333-3333-3333-333333333333'::uuid;
insert into public.fund_ledger (user_id, type, amount, balance_after, note)
values ('33333333-3333-3333-3333-333333333333'::uuid, 'SIGNUP_CREDIT', 1300.00, 1300.00, 'Fixture');

-- A fixture long, so the arithmetic above is about the flip and not about how
-- the long was acquired. §12.12: a long carries no collateral.
insert into public.positions
  (user_id, symbol, product, net_quantity, average_price, entry_reference_price,
   blocked_margin, realised_pnl)
values ('33333333-3333-3333-3333-333333333333'::uuid, 'RELIANCE', 'MIS', 10, 100.00, null, 0, 0);

select lives_ok($$ select pg_temp.price(90.00) $$, 'the market sits below the limit');

select is(
  (select p.status from pg_temp.place('33333333-3333-3333-3333-333333333333', 'SELL', 'LIMIT', 'MIS', 20, 100.00) p),
  'OPEN'::public.order_status,
  'the limit sell rests rather than filling at 90.00'
);

select is(pg_temp.cash('33333333-3333-3333-3333-333333333333'), 98.21::numeric,
  'and it reserved 1201.79 against its LIMIT price, leaving 98.21');

select lives_ok($$ select pg_temp.price(120.00) $$, 'the price gaps above the limit');

select lives_ok(
  $$ select public.execute_order(
       (select id from public.orders
         where user_id = '33333333-3333-3333-3333-333333333333'::uuid and status = 'OPEN')) $$,
  'the gap-up fill runs');

select is(
  (select status from public.orders
    where user_id = '33333333-3333-3333-3333-333333333333'::uuid),
  'COMPLETE'::public.order_status,
  'the flip FILLS: 240.34 more collateral than it reserved, and its own sale pays for it'
);

select results_eq(
  $$ select net_quantity, average_price, entry_reference_price, blocked_margin
       from public.positions where user_id = '33333333-3333-3333-3333-333333333333'::uuid $$,
  $$ values (-10, 119.92::numeric, 120.00::numeric, 1440.60::numeric) $$,
  'the long of 10 becomes a short of 10 collateralised at the fill price, not the limit'
);

select is(
  (select realised_pnl from public.trades
    where user_id = '33333333-3333-3333-3333-333333333333'::uuid),
  199.23::numeric,
  'the closing leg realises against its 10/20 share of the charges, 0.77'
);

select is(pg_temp.cash('33333333-3333-3333-3333-333333333333'), 1057.87::numeric,
  '§12.1: cash reconciles across the whole flip');

select is(pg_temp.used('33333333-3333-3333-3333-333333333333'), 1440.60::numeric,
  '§12.3: used_margin equals the position collateral, with no order still holding any');

-- ── P. A flip the sale genuinely cannot fund writes NOTHING ─────────────────
--
-- The narrow guarantee from the checkpoint still binds: §1 forbids partial
-- fills, so an opening leg that cannot be collateralised rejects the whole
-- order, closing portion included. What must not survive is the SELL_CREDIT —
-- posting the proceeds before the shortfall is known means a refused flip would
-- otherwise leave cash in the ledger for a sale that never happened, and
-- identity 1 would hold over a fiction. The subtransaction is what prevents it.
--
-- Dev holds an MIS long of 1 and rests a LIMIT SELL of 20 @ 100.00 at 90.00.
-- Shorting excess = 19.
--   reserved = short_collateral(19, 100.00) + 1.28 = 2280.96 + 1.28 = 2282.24
--              → cash 2300.00 − 2282.24 = 17.76
--   required = short_collateral(19, 120.00) + 1.53 = 2737.14 + 1.53 = 2738.67
--   delta    = 456.43, against 17.76 of cash and only 1 × 120.00 of proceeds

insert into auth.users (id) values ('44444444-4444-4444-4444-444444444444');

update public.funds set available_cash = 2300.00, used_margin = 0
 where user_id = '44444444-4444-4444-4444-444444444444'::uuid;
delete from public.fund_ledger where user_id = '44444444-4444-4444-4444-444444444444'::uuid;
insert into public.fund_ledger (user_id, type, amount, balance_after, note)
values ('44444444-4444-4444-4444-444444444444'::uuid, 'SIGNUP_CREDIT', 2300.00, 2300.00, 'Fixture');

insert into public.positions
  (user_id, symbol, product, net_quantity, average_price, entry_reference_price,
   blocked_margin, realised_pnl)
values ('44444444-4444-4444-4444-444444444444'::uuid, 'RELIANCE', 'MIS', 1, 100.00, null, 0, 0);

select lives_ok($$ select pg_temp.price(90.00) $$, 'the market drops below the limit again');

select is(
  (select p.status from pg_temp.place('44444444-4444-4444-4444-444444444444', 'SELL', 'LIMIT', 'MIS', 20, 100.00) p),
  'OPEN'::public.order_status,
  'the second limit sell rests too'
);

select lives_ok($$ select pg_temp.price(120.00) $$, 'and the same gap-up arrives');

select lives_ok(
  $$ select public.execute_order(
       (select id from public.orders
         where user_id = '44444444-4444-4444-4444-444444444444'::uuid and status = 'OPEN')) $$,
  'the fill runs');

select results_eq(
  $$ select status::text, rejection_reason from public.orders
      where user_id = '44444444-4444-4444-4444-444444444444'::uuid $$,
  $$ values ('REJECTED', 'INSUFFICIENT_FUNDS') $$,
  '456.43 of collateral against 17.76 of cash and 120.00 of proceeds is still a rejection'
);

select is_empty(
  $$ select 1 from public.fund_ledger
      where user_id = '44444444-4444-4444-4444-444444444444'::uuid and type = 'SELL_CREDIT' $$,
  'and the SELL_CREDIT is rolled back with it — no proceeds for a sale that never happened'
);

select is_empty(
  $$ select 1 from public.trades
      where user_id = '44444444-4444-4444-4444-444444444444'::uuid $$,
  'no trade row either');

select results_eq(
  $$ select net_quantity, average_price, blocked_margin
       from public.positions where user_id = '44444444-4444-4444-4444-444444444444'::uuid $$,
  $$ values (1, 100.00::numeric, 0.00::numeric) $$,
  '§1: the fill is all-or-nothing, so the long it would have closed is untouched'
);

select is(pg_temp.cash('44444444-4444-4444-4444-444444444444'), 2300.00::numeric,
  'the whole reservation comes back');

select is(pg_temp.used('44444444-4444-4444-4444-444444444444'), 0.00::numeric,
  'and nothing is left blocked');

select finish();
rollback;
