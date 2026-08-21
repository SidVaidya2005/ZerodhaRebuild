-- Close a hole in identity 6.
--
-- A CHECK constraint is satisfied when its expression evaluates to NULL, not
-- only when it evaluates to true. The sum check added in the previous migration
-- reads seven keys out of `charge_breakdown` with `->>`, and a missing key
-- yields NULL — so the whole sum became NULL, the comparison became NULL, and
-- the constraint passed.
--
-- Observed, not theorised: a trade with `charges = 999.99` and a breakdown of
-- `{"brokerage": 0}` was accepted by the schema as written. §12.6 was therefore
-- enforced only for rows that already had every component, which is precisely
-- the set of rows that were never going to violate it.
--
-- The fix is a shape constraint. `trading-contract.md` §3 already says absent
-- components are `0`, not missing keys — this makes the database say it too, and
-- guarantees the sum expression can never be NULL.

alter table public.trades
  drop constraint trades_breakdown_sums_to_charges;

-- Every component present AND numeric. `jsonb_typeof` rather than the `?&`
-- containment operator, because `?&` accepts a key whose value is JSON null,
-- which would reintroduce the same NULL through a different door.
alter table public.trades
  add constraint trades_breakdown_has_all_components check (
    jsonb_typeof(charge_breakdown -> 'brokerage') = 'number'
    and jsonb_typeof(charge_breakdown -> 'stt') = 'number'
    and jsonb_typeof(charge_breakdown -> 'exchange_txn') = 'number'
    and jsonb_typeof(charge_breakdown -> 'sebi_turnover') = 'number'
    and jsonb_typeof(charge_breakdown -> 'stamp_duty') = 'number'
    and jsonb_typeof(charge_breakdown -> 'dp_charge') = 'number'
    and jsonb_typeof(charge_breakdown -> 'gst') = 'number'
  );

-- Re-added unchanged. It is now unreachable with a NULL operand, because the
-- constraint above refuses any row that could produce one.
alter table public.trades
  add constraint trades_breakdown_sums_to_charges check (
    (charge_breakdown ->> 'brokerage')::numeric
      + (charge_breakdown ->> 'stt')::numeric
      + (charge_breakdown ->> 'exchange_txn')::numeric
      + (charge_breakdown ->> 'sebi_turnover')::numeric
      + (charge_breakdown ->> 'stamp_duty')::numeric
      + (charge_breakdown ->> 'dp_charge')::numeric
      + (charge_breakdown ->> 'gst')::numeric
    = charges
  );

comment on constraint trades_breakdown_has_all_components on public.trades is
  'trading-contract.md §3: absent components are 0, never missing keys. Without this, the sum check below passes on NULL.';
