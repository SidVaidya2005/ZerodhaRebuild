-- Close the hole the previous migration failed to close.
--
-- 20260821091113 added a shape constraint reading `jsonb_typeof(... -> 'stt') =
-- 'number'` for each component, to stop a missing key making the sum check NULL.
-- It reproduced the same defect one level up: `jsonb_typeof` returns NULL for a
-- key that is absent, so `NULL = 'number'` is NULL, `true and NULL` is NULL, and
-- the constraint passed exactly as before.
--
-- Verified rather than reasoned about this time. Evaluating both expressions
-- against four documents:
--
--   document                    naive              coalesce
--   {"brokerage":0}             NULL → PASSES      false → refused
--   {"stt":null, ...}           false → refused    false → refused
--   {"stt":"14", ...}           false → refused    false → refused
--   all seven, numeric          true  → passes     true  → passes
--
-- The lesson generalises: any CHECK whose expression can go NULL is not a
-- constraint, it is a suggestion. Every operand here is now NULL-proof.

alter table public.trades
  drop constraint trades_breakdown_has_all_components;

alter table public.trades
  add constraint trades_breakdown_has_all_components check (
    coalesce(jsonb_typeof(charge_breakdown -> 'brokerage'), '') = 'number'
    and coalesce(jsonb_typeof(charge_breakdown -> 'stt'), '') = 'number'
    and coalesce(jsonb_typeof(charge_breakdown -> 'exchange_txn'), '') = 'number'
    and coalesce(jsonb_typeof(charge_breakdown -> 'sebi_turnover'), '') = 'number'
    and coalesce(jsonb_typeof(charge_breakdown -> 'stamp_duty'), '') = 'number'
    and coalesce(jsonb_typeof(charge_breakdown -> 'dp_charge'), '') = 'number'
    and coalesce(jsonb_typeof(charge_breakdown -> 'gst'), '') = 'number'
  );

comment on constraint trades_breakdown_has_all_components on public.trades is
  'trading-contract.md §3: absent components are 0, never missing keys. coalesce is load-bearing — jsonb_typeof returns NULL for an absent key, and a CHECK passes on NULL.';
