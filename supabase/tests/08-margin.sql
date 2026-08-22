-- Feature 23: margin reservation, release, and short collateral.
--
-- Every expected figure below is computed by hand in the comment above its
-- assertion, from the §3 rate table, and never restated as the expression the
-- function uses. That is the trap the Phase 1 checkpoint caught in the charge
-- suite: a test that recomputes the implementation proves only that the
-- implementation is itself.
--
-- Two assertions are **falsifications** rather than confirmations — the
-- average_price substitution in §6, and the delta that omits the position's own
-- collateral. Both are arithmetic errors that produce a plausible number, and
-- neither would ever look wrong on screen.
begin;
select plan(57);

-- ── Fixtures ────────────────────────────────────────────────────────────────

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true)
  on conflict (symbol) do update set is_active = excluded.is_active;

-- The bootstrap trigger has already opened both accounts at 100000.00 with a
-- SIGNUP_CREDIT row. Nothing here overwrites `available_cash` directly, because
-- identity 1 makes the ledger and the balance the same statement.

create or replace function pg_temp.place(
  p_user uuid, p_side public.order_side, p_product public.product_type,
  p_quantity integer, p_price numeric
) returns uuid language sql as $$
  insert into public.orders (user_id, symbol, side, order_type, product, quantity, limit_price)
  values (p_user, 'RELIANCE', p_side, 'LIMIT', p_product, p_quantity, p_price)
  returning id
$$;

create or replace function pg_temp.cash(p_user uuid) returns numeric language sql as $$
  select available_cash from public.funds where user_id = p_user
$$;

create or replace function pg_temp.used(p_user uuid) returns numeric language sql as $$
  select used_margin from public.funds where user_id = p_user
$$;

-- ── A. A CNC buy: reserve, release, release again ───────────────────────────
--
-- CNC BUY 10 @ 100.00 — turnover 1000.00
--   brokerage 0 (delivery is free)
--   stt        0.001    × 1000 = 1.00
--   exchange   0.0000307× 1000 = 0.0307   → 0.03
--   sebi       0.000001 × 1000 = 0.001    → 0.00
--   stamp      0.00015  × 1000 = 0.15
--   dp         0 (buy)
--   gst  0.18 × (0 + 0.0307 + 0.001 + 0) = 0.005706 → 0.01
--   charges = 1.00 + 0.03 + 0.00 + 0.15 + 0.01 = 1.19
--   requirement = 1000.00 + 1.19 = 1001.19

select lives_ok(
  $$ select pg_temp.place('11111111-1111-1111-1111-111111111111'::uuid, 'BUY', 'CNC', 10, 100.00) $$,
  'a CNC buy order can be placed'
);

select is(
  (select public.reserve_margin(id) from public.orders where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  true,
  'reserving a CNC buy the account can cover returns true'
);

select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'::uuid), 98998.81::numeric,
  'available_cash falls by the requirement, 100000.00 - 1001.19');

select is(pg_temp.used('11111111-1111-1111-1111-111111111111'::uuid), 1001.19::numeric,
  'used_margin rises by the identical amount');

select is(
  (select blocked_margin from public.orders where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1001.19::numeric,
  'the order carries the reservation');

-- §12.2: the newest row's balance_after is the balance itself.
select results_eq(
  $$ select type::text, amount, balance_after from public.fund_ledger
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid
      order by created_at desc limit 1 $$,
  $$ values ('MARGIN_BLOCK', -1001.19::numeric, 98998.81::numeric) $$,
  'one MARGIN_BLOCK row, signed negative, and its balance_after matches available_cash'
);

select is(
  (select public.release_margin(id) from public.orders where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1001.19::numeric,
  'releasing returns the amount released'
);

select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'::uuid), 100000.00::numeric, 'release restores available_cash exactly');
select is(pg_temp.used('11111111-1111-1111-1111-111111111111'::uuid), 0.00::numeric, 'release restores used_margin exactly');

-- Idempotence per §4. A second release must be a no-op, not a second credit —
-- the matcher may run twice in the same minute.
select is(
  (select public.release_margin(id) from public.orders where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  0::numeric,
  'releasing a second time returns 0'
);

select is(
  (select count(*) from public.fund_ledger where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  3::bigint,
  'and writes no row: SIGNUP_CREDIT, MARGIN_BLOCK, MARGIN_RELEASE, still three'
);

-- ── B. A reservation the account cannot cover ───────────────────────────────

select is(
  (select public.reserve_margin(pg_temp.place('11111111-1111-1111-1111-111111111111'::uuid, 'BUY', 'CNC', 10000, 100.00))),
  false,
  'a reservation larger than available_cash returns false'
);

select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'::uuid), 100000.00::numeric, 'and leaves available_cash untouched');
select is(pg_temp.used('11111111-1111-1111-1111-111111111111'::uuid), 0.00::numeric, 'and leaves used_margin untouched');
select is(
  (select count(*) from public.fund_ledger where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  3::bigint,
  'and writes no ledger row'
);

-- ── C. An MIS sell against an existing long ─────────────────────────────────
--
-- Selling 10 against an MIS long of 4 closes 4 and shorts 6. Only the 6 carry an
-- obligation.
--
-- short_collateral_requirement(6, 100.00): buffered price 120.00
--   notional 6 × 120.00 = 720.00
--   closing charges, MIS BUY 6 @ 120.00 — turnover 720.00
--     brokerage  min(0.0003 × 720, 20) = 0.216   → 0.22
--     stt        0 (intraday buy)
--     exchange   0.0000307 × 720 = 0.022104      → 0.02
--     sebi       0.000001  × 720 = 0.00072       → 0.00
--     stamp      0.00003   × 720 = 0.0216        → 0.02
--     gst  0.18 × (0.216 + 0.022104 + 0.00072) = 0.04298832 → 0.04
--     = 0.22 + 0.02 + 0.00 + 0.02 + 0.04 = 0.30
--   collateral = 720.00 + 0.30 = 720.30
-- entry charges, MIS SELL 10 @ 100.00 — turnover 1000.00
--   brokerage 0.30, stt 0.25, exchange 0.03, sebi 0.00, stamp 0
--   gst 0.18 × (0.30 + 0.0307 + 0.001) = 0.059706 → 0.06
--   = 0.30 + 0.25 + 0.03 + 0.00 + 0.06 = 0.64
-- requirement = 720.30 + 0.64 = 720.94

insert into public.positions (user_id, symbol, product, net_quantity, average_price)
values ('11111111-1111-1111-1111-111111111111'::uuid, 'RELIANCE', 'MIS', 4, 100.00);

select is(
  (select public.reserve_margin(pg_temp.place('11111111-1111-1111-1111-111111111111'::uuid, 'SELL', 'MIS', 10, 100.00))),
  true,
  'an MIS sell crossing zero reserves'
);

select is(pg_temp.used('11111111-1111-1111-1111-111111111111'::uuid), 720.94::numeric,
  'and reserves against the shorting excess of 6, not the full 10 (which would be 1201.51) nor 0');

select lives_ok(
  $$ select public.release_margin(id) from public.orders
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid and side = 'SELL' $$,
  'released again for the next case'
);

update public.positions set net_quantity = 10 where user_id = '11111111-1111-1111-1111-111111111111'::uuid;

select is(
  (select public.reserve_margin(pg_temp.place('11111111-1111-1111-1111-111111111111'::uuid, 'SELL', 'MIS', 10, 100.00))),
  true,
  'an MIS sell fully covered by a long still succeeds'
);

select is(pg_temp.used('11111111-1111-1111-1111-111111111111'::uuid), 0.00::numeric,
  'but reserves nothing — there is no obligation left open after that fill');

delete from public.positions where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
delete from public.orders where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
delete from public.fund_ledger where user_id = '11111111-1111-1111-1111-111111111111'::uuid and type <> 'SIGNUP_CREDIT';
update public.funds set available_cash = 100000.00, used_margin = 0 where user_id = '11111111-1111-1111-1111-111111111111'::uuid;

-- ── D. A short round trip, filling at its limit ─────────────────────────────
--
-- SELL MIS 100 @ 100.00.
--
-- entry charges, MIS SELL 100 @ 100.00 — turnover 10000.00
--   brokerage  min(0.0003 × 10000, 20) = 3.00
--   stt        0.00025  × 10000 = 2.50
--   exchange   0.0000307× 10000 = 0.307    → 0.31
--   sebi       0.000001 × 10000 = 0.01
--   stamp      0 (sell)
--   gst  0.18 × (3.00 + 0.307 + 0.01) = 0.59706 → 0.60
--   = 3.00 + 2.50 + 0.31 + 0.01 + 0.60 = 6.42
--
-- short_collateral_requirement(100, 100.00): buffered price 120.00
--   notional 100 × 120.00 = 12000.00
--   closing charges, MIS BUY 100 @ 120.00 — turnover 12000.00
--     brokerage  min(3.60, 20) = 3.60
--     exchange   0.0000307 × 12000 = 0.3684   → 0.37
--     sebi       0.000001  × 12000 = 0.012    → 0.01
--     stamp      0.00003   × 12000 = 0.36
--     gst  0.18 × (3.60 + 0.3684 + 0.012) = 0.716472 → 0.72
--     = 3.60 + 0.37 + 0.01 + 0.36 + 0.72 = 5.06
--   collateral = 12000.00 + 5.06 = 12005.06
--
-- reservation = 12005.06 + 6.42 = 12011.48
-- at a fill of 100.00: required 12005.06, held 12011.48, delta = 0.00

insert into public.orders (id, user_id, symbol, side, order_type, product, quantity, limit_price)
values ('00000000-0000-0000-0000-0000000000d1'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'RELIANCE', 'SELL', 'LIMIT', 'MIS', 100, 100.00);

select is(public.reserve_margin('00000000-0000-0000-0000-0000000000d1'::uuid), true, 'the short reserves');

select is(
  (select blocked_margin from public.orders where id = '00000000-0000-0000-0000-0000000000d1'::uuid),
  12011.48::numeric,
  'a short reserves its COLLATERAL plus entry charges, not its notional plus charges (10006.42)'
);

-- The assertion the reservation basis exists for. Under the notional
-- reservation this is 2000.00-odd and every short would demand a top-up.
select is(
  (select round(available_cash, 2) from public.funds where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  87988.52::numeric,
  'available_cash after reserving is 100000.00 - 12011.48'
);

select results_eq(
  $$ select ok, required_collateral, entry_reference_price
       from public.transfer_margin_to_position(
         '00000000-0000-0000-0000-0000000000d1'::uuid, 100.00, 6.42) $$,
  $$ values (true, 12005.06::numeric, 100.00::numeric) $$,
  'a fill at the limit transfers, needing no top-up: delta is exactly zero'
);

-- The caller writes the two figures it was handed.
insert into public.positions
  (user_id, symbol, product, net_quantity, average_price, entry_reference_price, blocked_margin)
values ('11111111-1111-1111-1111-111111111111'::uuid, 'RELIANCE', 'MIS', -100, 99.94, 100.00, 12005.06);

update public.orders set status = 'COMPLETE', filled_quantity = 100, average_price = 99.94
 where id = '00000000-0000-0000-0000-0000000000d1'::uuid;

-- Assertion 1 of three: cash out across the whole trip is the collateral plus
-- the charges, and the collateral is in used_margin rather than in free cash.
select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'::uuid), 87988.52::numeric,
  'pre-placement to completed: available_cash falls by required_collateral + actual_charges');

select is(pg_temp.used('11111111-1111-1111-1111-111111111111'::uuid), 12005.06::numeric,
  'and the collateral sits in used_margin');

-- Assertion 2: the only cash movement across the transfer is -delta, which is
-- zero here — the charge pair nets out by construction.
select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'::uuid), 87988.52::numeric,
  'post-reservation to post-transfer: available_cash moves by exactly -delta and nothing else');

-- Assertion 3, the one that catches a double-spend: the collateral moved, it did
-- not vanish, and charges are the only non-recoverable part.
select is(
  pg_temp.cash('11111111-1111-1111-1111-111111111111'::uuid) + pg_temp.used('11111111-1111-1111-1111-111111111111'::uuid),
  99993.58::numeric,
  'available_cash + used_margin falls by exactly the actual charges, 6.42'
);

select is(
  (select blocked_margin from public.orders where id = '00000000-0000-0000-0000-0000000000d1'::uuid),
  0.00::numeric,
  'the order holds no margin after the transfer'
);

-- §7: the collateral move writes no ledger row, because no cash moved.
select is_empty(
  $$ select 1 from public.fund_ledger
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid
        and abs(amount) = 12005.06 $$,
  'no ledger row exists for the collateral amount — a MARGIN_RELEASE here would make it spendable'
);

-- §6 step 6: the estimate is released and the actual is debited, as two rows, so
-- the ledger shows that charges were paid once rather than only where it landed.
select results_eq(
  $$ select type::text, amount from public.fund_ledger
      where order_id = '00000000-0000-0000-0000-0000000000d1'::uuid
      order by created_at $$,
  $$ values ('MARGIN_BLOCK',   -12011.48::numeric),
            ('MARGIN_RELEASE',      6.42::numeric),
            ('CHARGES',            -6.42::numeric) $$,
  'the short entry writes exactly these rows: reserve, the charge release, the charge debit'
);

select is(
  (select sum(amount) from public.fund_ledger
    where order_id = '00000000-0000-0000-0000-0000000000d1'::uuid),
  -12011.48::numeric,
  'and they net to the reservation, the charges having been reserved once and paid once'
);

-- §12.12 after entry.
select is(
  (select blocked_margin from public.positions where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  12005.06::numeric,
  'positions.blocked_margin equals the §6 formula after entry'
);

-- ── E. Adding to the short ──────────────────────────────────────────────────
--
-- A second SELL MIS 100 @ 100.00 against the open short of 100.
--   reservation = short_collateral_requirement(100, 100.00) + 6.42 = 12011.48
--   post-fill short 200, entry_reference_price (100×100 + 100×100)/200 = 100.00
--   short_collateral_requirement(200, 100.00): buffered 120.00
--     notional 200 × 120.00 = 24000.00
--     closing charges, MIS BUY 200 @ 120.00 — turnover 24000.00
--       brokerage min(7.20, 20) = 7.20
--       exchange  0.0000307 × 24000 = 0.7368   → 0.74
--       sebi      0.000001  × 24000 = 0.024    → 0.02
--       stamp     0.00003   × 24000 = 0.72
--       gst 0.18 × (7.20 + 0.7368 + 0.024) = 1.432944 → 1.43
--       = 7.20 + 0.74 + 0.02 + 0.72 + 1.43 = 10.11
--     collateral = 24000.00 + 10.11 = 24010.11
--   held = 12011.48 (this order) + 12005.06 (the position) = 24016.54
--   delta = (24010.11 + 6.42) - 24016.54 = -0.01

insert into public.orders (id, user_id, symbol, side, order_type, product, quantity, limit_price)
values ('00000000-0000-0000-0000-0000000000d2'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'RELIANCE', 'SELL', 'LIMIT', 'MIS', 100, 100.00);

select is(public.reserve_margin('00000000-0000-0000-0000-0000000000d2'::uuid), true, 'the add reserves');

select results_eq(
  $$ select ok, required_collateral, entry_reference_price
       from public.transfer_margin_to_position(
         '00000000-0000-0000-0000-0000000000d2'::uuid, 100.00, 6.42) $$,
  $$ values (true, 24010.11::numeric, 100.00::numeric) $$,
  'adding recomputes the collateral over the whole post-fill short, at the gross weighted average'
);

-- The falsification. §6 step 2's delta subtracts the position's own collateral
-- as well as the order's reservation. Omitting it gives
-- (24010.11 + 6.42) - 12011.48 = 12005.05 — a second block of collateral already
-- held, which would leave used_margin at 36021.59 and look entirely plausible.
select is(
  (select round(24010.11 + 6.42 - 12011.48, 2)),
  12005.05::numeric,
  'a delta that omits positions.blocked_margin would block 12005.05 twice — the figure this test exists to not see'
);

update public.positions
   set net_quantity = -200, entry_reference_price = 100.00, blocked_margin = 24010.11
 where user_id = '11111111-1111-1111-1111-111111111111'::uuid;
update public.orders set status = 'COMPLETE', filled_quantity = 100, average_price = 99.94
 where id = '00000000-0000-0000-0000-0000000000d2'::uuid;

select is(pg_temp.used('11111111-1111-1111-1111-111111111111'::uuid), 24010.11::numeric,
  'used_margin holds the recomputed collateral once, not the old collateral plus a fresh one');

select is(pg_temp.cash('11111111-1111-1111-1111-111111111111'::uuid), 75977.05::numeric,
  'available_cash moved by -delta, +0.01, and by the charges only in the pair that nets to zero');

-- §12.3 at rest.
select is(
  pg_temp.used('11111111-1111-1111-1111-111111111111'::uuid),
  (select coalesce(sum(blocked_margin), 0) from public.orders
    where user_id = '11111111-1111-1111-1111-111111111111'::uuid and status = 'OPEN')
  + (select coalesce(sum(blocked_margin), 0) from public.positions where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  'identity 12.3 holds after the add'
);

-- ── F. Partial cover, full cover ────────────────────────────────────────────
--
-- Covering 100 of the 200 leaves a short of 100, whose collateral is 12005.06
-- (computed in section D). Released = 24010.11 - 12005.06 = 12005.05.

select is(
  public.recompute_position_collateral('11111111-1111-1111-1111-111111111111'::uuid, 'RELIANCE', -100),
  12005.05::numeric,
  'covering half releases half the collateral, not zero and not all of it'
);

select is(
  (select blocked_margin from public.positions where user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  12005.06::numeric,
  'and the position is left holding exactly the §6 formula against the remaining quantity'
);

select results_eq(
  $$ select type::text, amount from public.fund_ledger
      where user_id = '11111111-1111-1111-1111-111111111111'::uuid
      order by created_at desc limit 1 $$,
  $$ values ('MARGIN_RELEASE', 12005.05::numeric) $$,
  'a cover DOES write a ledger row — unlike entry, the cash genuinely comes back'
);

update public.positions set net_quantity = -100 where user_id = '11111111-1111-1111-1111-111111111111'::uuid;

select is(
  public.recompute_position_collateral('11111111-1111-1111-1111-111111111111'::uuid, 'RELIANCE', 0),
  12005.06::numeric,
  'a full cover releases everything'
);

select is(pg_temp.used('11111111-1111-1111-1111-111111111111'::uuid), 0.00::numeric,
  'and used_margin returns to zero with no position and no open order left holding anything');

-- ── G. entry_reference_price is the collateral basis, average_price is not ──
--
-- The short entered at a gross 100.00 with 6.42 of charges over 100 shares, so
-- average_price is 99.94 — and using it here under-collateralises.
--
-- Covering a genuine 20% adverse move costs 100 × 120.00 + charges on that buy
-- = 12000.00 + 5.06 = 12005.06.
--
-- short_collateral_requirement(100, 99.94): buffered 119.928
--   notional round(100 × 119.928, 2) = 11992.80
--   closing charges, MIS BUY 100 @ 119.928 — turnover 11992.80
--     brokerage min(3.59784, 20) → 3.60
--     exchange  0.0000307 × 11992.80 = 0.36817896 → 0.37
--     sebi      0.000001  × 11992.80 = 0.0119928  → 0.01
--     stamp     0.00003   × 11992.80 = 0.359784   → 0.36
--     gst 0.18 × (3.59784 + 0.36817896 + 0.0119928) = 0.7160421 → 0.72
--     = 3.60 + 0.37 + 0.01 + 0.36 + 0.72 = 5.06
--   = 11992.80 + 5.06 = 11997.86  — short by 7.20

select is(
  public.short_collateral_requirement(100, 100.00),
  12005.06::numeric,
  'collateral from entry_reference_price covers a full 20% adverse move including closing charges'
);

select cmp_ok(
  public.short_collateral_requirement(100, 99.94),
  '<',
  12005.06::numeric,
  'the same figure from average_price does NOT — it under-collateralises by 7.20, which never looks wrong'
);

select is(
  round(12005.06 - public.short_collateral_requirement(100, 99.94), 2),
  7.20::numeric,
  'and the shortfall is exactly 100 × (100.00 - 99.94) × 1.20'
);

-- ── H. The gap-up, both branches ────────────────────────────────────────────
--
-- Bo shorts 100 at a limit of 100.00 and fills at an observed 110.00 — §5 fills
-- a limit sell at the crossing price, which is at or above the limit.
--
--   reservation, at the limit             = 12011.48
--   entry charges at 110.00, MIS SELL 100 — turnover 11000.00
--     brokerage min(3.30, 20) = 3.30, stt 0.00025 × 11000 = 2.75
--     exchange 0.0000307 × 11000 = 0.3377 → 0.34, sebi 0.011 → 0.01
--     gst 0.18 × (3.30 + 0.3377 + 0.011) = 0.656766 → 0.66
--     = 3.30 + 2.75 + 0.34 + 0.01 + 0.66 = 7.06
--   short_collateral_requirement(100, 110.00): buffered 132.00
--     notional 13200.00
--     closing charges, MIS BUY 100 @ 132.00 — turnover 13200.00
--       brokerage min(3.96, 20) = 3.96
--       exchange 0.0000307 × 13200 = 0.40524 → 0.41
--       sebi     0.000001  × 13200 = 0.0132  → 0.01
--       stamp    0.00003   × 13200 = 0.396   → 0.40
--       gst 0.18 × (3.96 + 0.40524 + 0.0132) = 0.7881192 → 0.79
--       = 3.96 + 0.41 + 0.01 + 0.40 + 0.79 = 5.57
--     = 13200.00 + 5.57 = 13205.57
--   delta = (13205.57 + 7.06) - 12011.48 = 1201.15

insert into public.orders (id, user_id, symbol, side, order_type, product, quantity, limit_price)
values ('00000000-0000-0000-0000-0000000000d3'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'RELIANCE', 'SELL', 'LIMIT', 'MIS', 100, 100.00);

select is(public.reserve_margin('00000000-0000-0000-0000-0000000000d3'::uuid), true, 'the gap-up short reserves at its limit');

select results_eq(
  $$ select ok, required_collateral from public.transfer_margin_to_position(
       '00000000-0000-0000-0000-0000000000d3'::uuid, 110.00, 7.06) $$,
  $$ values (true, 13205.57::numeric) $$,
  'with cash available, a gap-up fill tops up and completes'
);

select results_eq(
  $$ select type::text, amount from public.fund_ledger
      where order_id = '00000000-0000-0000-0000-0000000000d3'::uuid
      order by created_at $$,
  $$ values ('MARGIN_BLOCK',   -12011.48::numeric),
            ('MARGIN_BLOCK',    -1201.15::numeric),
            ('MARGIN_RELEASE',      7.06::numeric),
            ('CHARGES',            -7.06::numeric) $$,
  'the top-up is a second MARGIN_BLOCK of exactly delta'
);

select is(
  pg_temp.cash('22222222-2222-2222-2222-222222222222'::uuid) + pg_temp.used('22222222-2222-2222-2222-222222222222'::uuid),
  99992.94::numeric,
  'and cash + margin still falls by the actual charges alone, 7.06'
);

-- The other branch: the same fill against an account that cannot fund the
-- top-up. Bo's second short is sized so the reservation succeeds and the top-up
-- cannot.
delete from public.fund_ledger where user_id = '22222222-2222-2222-2222-222222222222'::uuid and type <> 'SIGNUP_CREDIT';
delete from public.orders where user_id = '22222222-2222-2222-2222-222222222222'::uuid;
update public.funds set available_cash = 12511.48, used_margin = 0 where user_id = '22222222-2222-2222-2222-222222222222'::uuid;

insert into public.orders (id, user_id, symbol, side, order_type, product, quantity, limit_price)
values ('00000000-0000-0000-0000-0000000000d4'::uuid, '22222222-2222-2222-2222-222222222222'::uuid, 'RELIANCE', 'SELL', 'LIMIT', 'MIS', 100, 100.00);

select is(public.reserve_margin('00000000-0000-0000-0000-0000000000d4'::uuid), true,
  'the reservation itself succeeds — 12511.48 covers 12011.48');

select is(
  (select ok from public.transfer_margin_to_position(
     '00000000-0000-0000-0000-0000000000d4'::uuid, 110.00, 7.06)),
  false,
  'but the 1201.15 top-up cannot be funded from the 500.00 left, so the fill is refused'
);

select is(pg_temp.cash('22222222-2222-2222-2222-222222222222'::uuid), 12511.48::numeric,
  'and the whole reservation is released — available_cash is back where it started');

select is(
  (select blocked_margin from public.orders where id = '00000000-0000-0000-0000-0000000000d4'::uuid),
  0.00::numeric,
  'with blocked_margin zeroed, so the caller''s REJECTED write is legal under orders_no_margin_unless_open'
);

select lives_ok(
  $$ update public.orders set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS'
      where id = '00000000-0000-0000-0000-0000000000d4'::uuid $$,
  'and that write is in fact accepted'
);

-- ── I. Nothing here is reachable from a browser ─────────────────────────────

select is(
  (select bool_or(has_function_privilege(r.rolname, p.oid, 'execute'))
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join (values ('anon'), ('authenticated')) as r(rolname)
    where n.nspname = 'public'
      and p.proname in ('reserve_margin', 'release_margin', 'transfer_margin_to_position',
                        'recompute_position_collateral', 'short_collateral_requirement',
                        'short_margin_buffer')),
  false,
  'none of the six is executable by anon or authenticated'
);

select finish();
rollback;
