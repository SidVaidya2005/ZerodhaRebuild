-- Feature 22's Postgres charge calculator.
--
-- Every expected figure below is computed by hand from `trading-contract.md` §3
-- in the comment above its assertion, never by re-running the calculator's own
-- expression. That distinction is the whole point: the Phase 1 checkpoint found
-- the TypeScript reconciliation test proving the implementation equals itself,
-- and this suite is what the TypeScript side is now measured against.
--
-- Rates re-verified against https://zerodha.com/charges/ on 2026-08-22, at the
-- start of Phase 4, as §3 requires. Every rate unchanged.
begin;
select plan(25);

-- ── The four worked examples ────────────────────────────────────────────────
--
-- Turnover is 500 × 100 = 50,000.00 in all four, so the only thing that moves
-- between them is which components apply.
--
--   exchange   0.00307%  × 50,000 = 1.535    → 1.54
--   SEBI       ₹10/crore × 50,000 = 0.05
--
-- Delivery buy: STT 0.1% = 50.00, stamp 0.015% = 7.50, no brokerage, no DP.
--   GST 18% × (0 + 1.535 + 0.05 + 0) = 0.2853 → 0.29
--   total 0 + 50.00 + 1.54 + 0.05 + 7.50 + 0 + 0.29 = 59.38
select results_eq(
  $$ select total, breakdown from public.calculate_charges('BUY', 'CNC', 500, 100.00) $$,
  $$ values (59.38::numeric, '{"brokerage":0.00,"stt":50.00,"exchange_txn":1.54,"sebi_turnover":0.05,"stamp_duty":7.50,"dp_charge":0.00,"gst":0.29}'::jsonb) $$,
  'a delivery buy of 500 at 100 costs 59.38'
);

-- Delivery sell: STT 0.1% = 50.00, no stamp duty, DP base 13.00.
--   GST 18% × (0 + 1.535 + 0.05 + 13.00) = 2.6253 → 2.63
--   total 0 + 50.00 + 1.54 + 0.05 + 0 + 13.00 + 2.63 = 67.22
select results_eq(
  $$ select total, breakdown from public.calculate_charges('SELL', 'CNC', 500, 100.00) $$,
  $$ values (67.22::numeric, '{"brokerage":0.00,"stt":50.00,"exchange_txn":1.54,"sebi_turnover":0.05,"stamp_duty":0.00,"dp_charge":13.00,"gst":2.63}'::jsonb) $$,
  'a delivery sell of 500 at 100 costs 67.22, including the DP charge'
);

-- Intraday buy: brokerage min(0.03% × 50,000, 20) = min(15, 20) = 15.00,
-- no STT on an intraday buy, stamp 0.003% = 1.50.
--   GST 18% × (15.00 + 1.535 + 0.05 + 0) = 2.9853 → 2.99
--   total 15.00 + 0 + 1.54 + 0.05 + 1.50 + 0 + 2.99 = 21.08
select results_eq(
  $$ select total, breakdown from public.calculate_charges('BUY', 'MIS', 500, 100.00) $$,
  $$ values (21.08::numeric, '{"brokerage":15.00,"stt":0.00,"exchange_txn":1.54,"sebi_turnover":0.05,"stamp_duty":1.50,"dp_charge":0.00,"gst":2.99}'::jsonb) $$,
  'an intraday buy of 500 at 100 costs 21.08'
);

-- Intraday sell: brokerage 15.00, STT 0.025% = 12.50, no stamp duty, no DP.
--   GST 18% × (15.00 + 1.535 + 0.05 + 0) = 2.9853 → 2.99
--   total 15.00 + 12.50 + 1.54 + 0.05 + 0 + 0 + 2.99 = 32.08
select results_eq(
  $$ select total, breakdown from public.calculate_charges('SELL', 'MIS', 500, 100.00) $$,
  $$ values (32.08::numeric, '{"brokerage":15.00,"stt":12.50,"exchange_txn":1.54,"sebi_turnover":0.05,"stamp_duty":0.00,"dp_charge":0.00,"gst":2.99}'::jsonb) $$,
  'an intraday sell of 500 at 100 costs 32.08, with no DP charge'
);

-- ── §2: GST on the unrounded sub-components ─────────────────────────────────
--
-- 2 shares at 41.67 is turnover 83.34, chosen because it is one of the inputs
-- where the two readings of §2 actually differ — most inputs agree, so an
-- arbitrary case would assert nothing.
--
--   brokerage 0.03%    × 83.34 = 0.025002   → 0.03
--   exchange  0.00307% × 83.34 = 0.00255854 → 0.00
--   SEBI      ₹10/cr   × 83.34 = 0.00008334 → 0.00
--
--   §2 (correct): 18% × (0.025002 + 0.00255854 + 0.00008334) = 0.0049759 → 0.00
--   wrong:        18% × (0.03 + 0.00 + 0.00)                 = 0.0054    → 0.01
select is(
  (select breakdown ->> 'gst' from public.calculate_charges('BUY', 'MIS', 2, 41.67)),
  '0.00',
  'GST is taken on the unrounded sub-components — rounding them first gives 0.01 here'
);

select is(
  (select total from public.calculate_charges('BUY', 'MIS', 2, 41.67)),
  0.03::numeric,
  'and the total follows the components, not a separate rounding'
);

-- ── §2: the total is the sum of the ROUNDED components ──────────────────────
--
-- Not a restatement of the implementation: this adds the seven published keys
-- back up independently and demands they equal the published total, which is
-- exactly identity §12.6 and the trades CHECK constraint.
select is(
  (select (breakdown ->> 'brokerage')::numeric + (breakdown ->> 'stt')::numeric
        + (breakdown ->> 'exchange_txn')::numeric + (breakdown ->> 'sebi_turnover')::numeric
        + (breakdown ->> 'stamp_duty')::numeric + (breakdown ->> 'dp_charge')::numeric
        + (breakdown ->> 'gst')::numeric
     from public.calculate_charges('SELL', 'CNC', 137, 249.75)),
  (select total from public.calculate_charges('SELL', 'CNC', 137, 249.75)),
  'the breakdown reconciles to the total exactly, so identity 6 can never fail by a paisa'
);

-- ── The DP charge ───────────────────────────────────────────────────────────

select is(
  (select breakdown ->> 'dp_charge' from public.calculate_charges('SELL', 'CNC', 1, 100.00)),
  '13.00',
  'dp_charge is the 13.00 base, not the 15.34 a contract note shows'
);

-- 15.34 = 13.00 × 1.18. Treating 15.34 as the base and applying GST again
-- over-charges every delivery sell by 2.34 — an earlier draft of §3 did exactly
-- that. Here the DP contribution to GST is 18% × 13.00 = 2.34.
select is(
  (select round((breakdown ->> 'gst')::numeric
              - (select (b2 ->> 'gst')::numeric
                   from public.calculate_charges('BUY', 'CNC', 1, 100.00) c2(t2, b2)), 2)
     from public.calculate_charges('SELL', 'CNC', 1, 100.00)),
  2.34::numeric,
  'the DP base carries its own 2.34 of GST, inside the single gst key'
);

select is(
  (select breakdown ->> 'dp_charge' from public.calculate_charges('BUY', 'CNC', 500, 100.00)),
  '0.00',
  'DP never applies to a delivery buy'
);

select is(
  (select breakdown ->> 'dp_charge' from public.calculate_charges('SELL', 'MIS', 500, 100.00)),
  '0.00',
  'nor to intraday at all'
);

-- ── Brokerage ───────────────────────────────────────────────────────────────

select is(
  (select breakdown ->> 'brokerage' from public.calculate_charges('BUY', 'CNC', 9999, 5000.00)),
  '0.00',
  'delivery brokerage is exactly zero however large the trade'
);
select is(
  (select breakdown ->> 'brokerage' from public.calculate_charges('SELL', 'CNC', 9999, 5000.00)),
  '0.00',
  'on the sell leg too'
);

-- 0.03% of 50,000 is 15.00, comfortably under the 20.00 cap.
select is(
  (select breakdown ->> 'brokerage' from public.calculate_charges('BUY', 'MIS', 500, 100.00)),
  '15.00',
  'intraday brokerage is the percentage while it is below the cap'
);

-- 0.03% of 1,000,000 is 300.00, so the cap is what is charged.
select is(
  (select breakdown ->> 'brokerage' from public.calculate_charges('BUY', 'MIS', 10000, 100.00)),
  '20.00',
  'and is capped at 20.00 once the percentage would exceed it'
);

-- A hundred times larger again, to show the cap is flat rather than tapering.
select is(
  (select breakdown ->> 'brokerage' from public.calculate_charges('SELL', 'MIS', 200000, 5000.00)),
  '20.00',
  'the cap is flat, however large the trade'
);

-- ── Side- and product-conditional components ────────────────────────────────

select is(
  (select breakdown ->> 'stt' from public.calculate_charges('BUY', 'MIS', 500, 100.00)),
  '0.00',
  'STT does not apply to an intraday buy'
);
select is(
  (select breakdown ->> 'stt' from public.calculate_charges('SELL', 'MIS', 500, 100.00)),
  '12.50',
  'but does to an intraday sell, at 0.025%'
);
select is(
  (select breakdown ->> 'stamp_duty' from public.calculate_charges('SELL', 'CNC', 500, 100.00)),
  '0.00',
  'stamp duty is buy-side only'
);
select is(
  (select breakdown ->> 'stamp_duty' from public.calculate_charges('BUY', 'MIS', 500, 100.00)),
  '1.50',
  'and applies to an intraday buy at the lower 0.003% rate'
);

-- ── Input guards ────────────────────────────────────────────────────────────

select throws_ok(
  $$ select public.calculate_charges('BUY', 'CNC', 0, 100.00) $$,
  '22023',
  null,
  'a non-positive quantity is refused rather than returning zero charges'
);
select throws_ok(
  $$ select public.calculate_charges('BUY', 'CNC', -5, 100.00) $$,
  '22023',
  null,
  'a negative quantity cannot produce negative money'
);
select throws_ok(
  $$ select public.calculate_charges('BUY', 'CNC', 10, -1.00) $$,
  '22023',
  null,
  'nor can a negative price'
);

-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- Internal-only per code-standards.md. A missing grant stops the request before
-- the body runs, which is 42501 — a different failure from a policy filtering
-- rows, and asserted as such.

set local role authenticated;
select throws_ok(
  $$ select public.calculate_charges('BUY', 'CNC', 1, 1.00) $$,
  '42501',
  null,
  'authenticated cannot call the calculator — it runs inside execute_order, never from a browser'
);

set local role anon;
select throws_ok(
  $$ select * from public.charge_rates() $$,
  '42501',
  null,
  'anon cannot read the rate table either'
);

select * from finish();
rollback;
