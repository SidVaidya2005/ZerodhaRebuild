-- `fund_ledger.created_at` becomes `clock_timestamp()`.
--
-- `trading-contract.md` §12.2 says the **newest** ledger row's `balance_after`
-- equals `funds.available_cash`. With `now()` that identity has no meaning where
-- it matters most: `now()` is the transaction start time, so every row a single
-- money function writes carries the identical timestamp — and a short entry
-- writes three. "Newest" is then a tie, and which row wins is whatever the
-- planner happens to return.
--
-- `clock_timestamp()` advances within the transaction, so the rows a fill writes
-- are totally ordered by the order they were written in, which is what the
-- identity has always assumed. Nothing else changes: the value is still the
-- instant the row was created, and the index on (user_id, created_at desc) is
-- unaffected.
--
-- Found while writing F23's tests, which could not assert §12.2 without it.
alter table public.fund_ledger alter column created_at set default clock_timestamp();

comment on column public.fund_ledger.created_at is
  'clock_timestamp(), not now(): a single money function writes several rows and trading-contract.md §12.2 orders by this column, so rows within one transaction must be distinguishable.';
