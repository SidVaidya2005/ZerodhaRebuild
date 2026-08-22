-- The §6 collateral formula, written once.
--
-- `trading-contract.md` §6 says "one collateral formula, everywhere" and then
-- names four places that need it: the reservation on a short-opening sell, the
-- transfer at fill, the recompute on a partial cover, and the full release on
-- square-off. Four copies of an expression that has to agree to the paisa is how
-- a partial cover starts releasing the wrong amount, so there is one function
-- and the other three call it.

-- ---------------------------------------------------------------------------
-- The buffer.
-- ---------------------------------------------------------------------------
--
-- Separate from `charge_rates()` because it is not a charge: it is a risk
-- parameter, it moves for different reasons, and folding it into that composite
-- would mean every charge calculation carried it around. Same IMMUTABLE shape
-- though, and for the same reason — Postgres inlines it, so calling it inside a
-- locked transaction costs nothing.
--
-- **Must stay identical to SHORT_MARGIN_BUFFER in src/lib/constants.ts.**
-- Nothing enforces that structurally; `pnpm test:parity` is what catches drift.
create or replace function public.short_margin_buffer()
returns numeric
language sql
immutable
parallel safe
as $$
  select 0.20::numeric
$$;

comment on function public.short_margin_buffer() is
  'SHORT_MARGIN_BUFFER per trading-contract.md §6: 0.20. NSE circuit limits cap a single-session move at 5/10/20% by band, and an MIS position cannot survive the session, so 20% covers the worst same-day adverse move for a banded stock. Applies to a PRICE, so it is always applied to entry_reference_price and never to average_price (§12.11). Must stay identical to SHORT_MARGIN_BUFFER in src/lib/constants.ts; pnpm test:parity is what catches drift.';

-- ---------------------------------------------------------------------------
-- The formula.
-- ---------------------------------------------------------------------------
--
--   |quantity| × entry_reference_price × (1 + buffer)
--     + calculate_charges('BUY', 'MIS', |quantity|, entry_reference_price × (1 + buffer))
--
-- The closing-charge term is not decoration. Without it the collateral falls
-- short by exactly the cost of buying the shares back, even on a gross basis:
-- the buffer covers the price move and nothing else.
--
-- Charges are estimated at the **buffered** price rather than the entry price,
-- because the cover that the collateral has to fund happens at the worst price
-- the buffer contemplates. Estimating them at the entry price under-funds the
-- cover by the charge on a 20% larger turnover.
--
-- `p_quantity` is taken as an absolute value so a caller may pass either a
-- position's negative `net_quantity` or an order's positive quantity without
-- having to remember which. A short's quantity is negative in `positions` and
-- positive in `orders`, and that asymmetry has no business being a bug here.
create or replace function public.short_collateral_requirement(
  p_quantity integer,
  p_entry_reference_price numeric
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_quantity integer;
  v_buffered_price numeric;
  v_notional numeric;
  v_close_charges numeric;
begin
  v_quantity := abs(p_quantity);

  if p_quantity is null or v_quantity = 0 then
    raise exception 'short_collateral_requirement: quantity must be non-zero, got %', p_quantity
      using errcode = '22023';
  end if;

  if p_entry_reference_price is null or p_entry_reference_price <= 0 then
    raise exception 'short_collateral_requirement: entry reference price must be positive, got %',
      p_entry_reference_price
      using errcode = '22023';
  end if;

  v_buffered_price := p_entry_reference_price * (1 + public.short_margin_buffer());

  -- §2: money is rounded where it becomes money. Both terms below round to the
  -- paisa, and the sum of two rounded figures is what gets stored — never a
  -- rounding of the unrounded sum, which is the rule the charge calculator
  -- already follows and the reason `charges` reconciles to its breakdown.
  v_notional := round(v_quantity::numeric * v_buffered_price, 2);

  select total into v_close_charges
    from public.calculate_charges('BUY'::public.order_side, 'MIS'::public.product_type,
                                  v_quantity, v_buffered_price);

  return v_notional + v_close_charges;
end;
$$;

comment on function public.short_collateral_requirement(integer, numeric) is
  'Collateral against an open short per trading-contract.md §6: |quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated closing charges at the buffered price. The ONLY place this formula is written — reserve_margin, transfer_margin_to_position and recompute_position_collateral all call it. Takes entry_reference_price, never average_price (§12.11).';

-- Internal-only, per the grant policy in code-standards.md. Neither touches a
-- table, so neither is `security definer`, but nothing outside the engine has a
-- reason to call them and an unused grant is a hole waiting for a mistake.
revoke execute on function public.short_margin_buffer() from public, anon, authenticated;
revoke execute on function public.short_collateral_requirement(integer, numeric)
  from public, anon, authenticated;
