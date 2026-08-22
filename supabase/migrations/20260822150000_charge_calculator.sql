-- The Postgres side of the charge model.
--
-- `src/lib/trading/charges.ts` has existed since F06 so the pricing page could
-- compute its worked example from real code. That one is **display-only**
-- (`trading-contract.md` §1): it may show a labelled estimate and may never
-- produce a stored value. This is the calculator whose output gets written, and
-- `pnpm test:parity` proves the two agree exactly.

-- ---------------------------------------------------------------------------
-- The rates, in one place.
-- ---------------------------------------------------------------------------
--
-- One IMMUTABLE function rather than literals sprinkled through the calculator,
-- for two reasons: Postgres inlines immutable SQL functions, so this costs
-- nothing when F24 calls the calculator inside `execute_order` under a row lock;
-- and the parity test can read the rates directly instead of only inferring
-- them from results.
--
-- **These must stay identical to `src/lib/constants.ts`.** Nothing enforces that
-- structurally — the parity test is what catches drift, which is why it compares
-- rates as well as totals.
create or replace function public.charge_rates()
returns table (
  brokerage_cnc_rate numeric,
  brokerage_mis_rate numeric,
  brokerage_mis_cap numeric,
  stt_cnc_rate numeric,
  stt_mis_sell_rate numeric,
  exchange_txn_rate numeric,
  sebi_turnover_rate numeric,
  stamp_duty_cnc_buy_rate numeric,
  stamp_duty_mis_buy_rate numeric,
  gst_rate numeric,
  dp_charge_base numeric
)
language sql
immutable
parallel safe
as $$
  select
    0::numeric,          -- brokerage_cnc_rate      delivery is free
    0.0003::numeric,     -- brokerage_mis_rate      0.03% of turnover
    20::numeric,         -- brokerage_mis_cap       ...or ₹20, whichever is lower
    0.001::numeric,      -- stt_cnc_rate            0.1%, both legs
    0.00025::numeric,    -- stt_mis_sell_rate       0.025%, sell side only
    0.0000307::numeric,  -- exchange_txn_rate       NSE, 0.00307%
    0.000001::numeric,   -- sebi_turnover_rate      ₹10 per crore
    0.00015::numeric,    -- stamp_duty_cnc_buy_rate 0.015%, buy side only
    0.00003::numeric,    -- stamp_duty_mis_buy_rate 0.003%, buy side only
    0.18::numeric,       -- gst_rate                18%
    13.00::numeric       -- dp_charge_base          ₹3.50 CDSL + ₹9.50 broker
$$;

comment on function public.charge_rates() is
  'Charge rates per trading-contract.md §3. Source: https://zerodha.com/charges/, confirmed 2026-08-21 and re-confirmed 2026-08-22 at the start of Phase 4 with every rate unchanged. Statutory components move by circular — re-check at the start of any phase that touches money, and after a Union Budget. Must stay identical to src/lib/constants.ts; pnpm test:parity is what catches drift. dp_charge_base is ₹13.00, NOT the familiar ₹15.34, which already includes its own ₹2.34 of GST.';

-- ---------------------------------------------------------------------------
-- The calculator.
-- ---------------------------------------------------------------------------
--
-- plpgsql rather than SQL so the inputs can be guarded. `execute_order` already
-- validates, and the orders table carries `CHECK (quantity > 0)`, but a charge
-- calculator that quietly returns negative money for negative input is a bad
-- thing to have sitting in the schema. The inlining argument applies to
-- `charge_rates()` above, which is called per row; this is called once per fill.
--
-- Returns the total and the breakdown together because that is exactly what F24
-- writes: `select … into` and insert both columns, with `total` already numeric
-- so nothing casts on the money path.
create or replace function public.calculate_charges(
  p_side public.order_side,
  p_product public.product_type,
  p_quantity integer,
  p_price numeric
)
returns table (total numeric, breakdown jsonb)
language plpgsql
immutable
as $$
declare
  r record;
  v_turnover numeric;
  v_is_buy boolean;
  v_is_delivery boolean;
  -- Unrounded. §2: each component is computed at full precision and rounded
  -- once, where it becomes money.
  v_brokerage_raw numeric;
  v_stt_raw numeric;
  v_exchange_raw numeric;
  v_sebi_raw numeric;
  v_stamp_raw numeric;
  v_dp_raw numeric;
  v_gst_raw numeric;
  -- Rounded.
  v_brokerage numeric;
  v_stt numeric;
  v_exchange numeric;
  v_sebi numeric;
  v_stamp numeric;
  v_dp numeric;
  v_gst numeric;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'calculate_charges: quantity must be positive, got %', p_quantity
      using errcode = '22023';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'calculate_charges: price must be non-negative, got %', p_price
      using errcode = '22023';
  end if;

  select * into r from public.charge_rates();

  -- §2: trade value is quantity × price, exact. Both operands are exact in
  -- numeric, so nothing is rounded here.
  v_turnover := p_quantity::numeric * p_price;
  v_is_buy := p_side = 'BUY';
  v_is_delivery := p_product = 'CNC';

  v_brokerage_raw := case
    when v_is_delivery then r.brokerage_cnc_rate * v_turnover
    else least(r.brokerage_mis_rate * v_turnover, r.brokerage_mis_cap)
  end;

  -- Delivery is taxed on both legs; intraday only when you sell.
  v_stt_raw := case
    when v_is_delivery then r.stt_cnc_rate * v_turnover
    when v_is_buy then 0
    else r.stt_mis_sell_rate * v_turnover
  end;

  v_exchange_raw := r.exchange_txn_rate * v_turnover;
  v_sebi_raw := r.sebi_turnover_rate * v_turnover;

  -- Stamp duty is buy-side only, on both products.
  v_stamp_raw := case
    when not v_is_buy then 0
    when v_is_delivery then r.stamp_duty_cnc_buy_rate * v_turnover
    else r.stamp_duty_mis_buy_rate * v_turnover
  end;

  -- DP applies to a delivery sell only, flat regardless of quantity, and — as a
  -- documented divergence from a real broker — once per order rather than once
  -- per scrip per day. See trading-contract.md §3 and /legal.
  v_dp_raw := case when v_is_delivery and not v_is_buy then r.dp_charge_base else 0 end;

  -- §2: GST is computed on the UNROUNDED sub-components and rounded once. Its
  -- base includes the DP base, and all GST on the trade lands in the single
  -- `gst` key, so that key never changes meaning depending on whether a DP
  -- charge was involved. GST never applies to STT or stamp duty.
  v_gst_raw := r.gst_rate * (v_brokerage_raw + v_exchange_raw + v_sebi_raw + v_dp_raw);

  -- numeric `round` is half-away-from-zero, which is half-up for these
  -- non-negative figures — the rule §2 states.
  v_brokerage := round(v_brokerage_raw, 2);
  v_stt := round(v_stt_raw, 2);
  v_exchange := round(v_exchange_raw, 2);
  v_sebi := round(v_sebi_raw, 2);
  v_stamp := round(v_stamp_raw, 2);
  v_dp := round(v_dp_raw, 2);
  v_gst := round(v_gst_raw, 2);

  return query
  select
    -- §2: the sum of the already-rounded components, never a rounding of the
    -- unrounded sum. That is what makes charge_breakdown reconcile to charges
    -- exactly, which identity §12.6 and the trades CHECK constraint both demand.
    (v_brokerage + v_stt + v_exchange + v_sebi + v_stamp + v_dp + v_gst)::numeric,
    -- Keys are snake_case and fixed: `trades_breakdown_has_all_components`
    -- already pins this exact set, and absent components are 0, never missing.
    jsonb_build_object(
      'brokerage', v_brokerage,
      'stt', v_stt,
      'exchange_txn', v_exchange,
      'sebi_turnover', v_sebi,
      'stamp_duty', v_stamp,
      'dp_charge', v_dp,
      'gst', v_gst
    );
end;
$$;

comment on function public.calculate_charges(public.order_side, public.product_type, integer, numeric) is
  'Charges for one executed order per trading-contract.md §2 and §3. Returns the total and the seven-key breakdown. Internal-only: it runs inside execute_order, never from a browser. The TypeScript estimator in src/lib/trading/charges.ts is display-only and proven equal by pnpm test:parity.';

-- Internal-only, per code-standards.md's grant policy. `security definer` is not
-- used here — the function touches no table and needs no elevated rights — but
-- the grant is still withheld: nothing outside the engine has a reason to call
-- it, and F25's order ticket shows the TypeScript estimate instead.
revoke execute on function public.charge_rates() from public, anon, authenticated;
revoke execute on function public.calculate_charges(public.order_side, public.product_type, integer, numeric)
  from public, anon, authenticated;
