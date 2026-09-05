-- `market_constants()` gains the square-off minute, for F29.
--
-- `SQUARE_OFF_TIME_IST` has existed in `_shared/market-constants.ts` since F15;
-- Postgres never needed it until `square_off_mis` had to decide whether 15:20
-- has passed. The two are a mirrored pair — `tests/parity/market.parity.test.ts`
-- asserts them field by field, which is what catches drift (F24).
--
-- Dropped and recreated rather than replaced: `create or replace` refuses to
-- change a function's OUT-parameter row type (42P13). Nothing blocks the drop —
-- plpgsql bodies are opaque to the dependency tracker — and the recreate is in
-- the same migration, so the two are atomic.
drop function if exists public.market_constants();

create function public.market_constants()
returns table (
  ist_offset_minutes integer,
  pre_open_start_ist integer,
  market_open_ist integer,
  square_off_ist integer,
  market_close_ist integer,
  quote_stale_after_ms integer
)
language sql
immutable
parallel safe
as $$
  select
    330,              -- ist_offset_minutes   UTC+05:30, no DST since 1945
    9 * 60,           -- pre_open_start_ist   09:00, the call auction
    9 * 60 + 15,      -- market_open_ist      09:15
    15 * 60 + 20,     -- square_off_ist       15:20, trading-contract.md §10
    15 * 60 + 30,     -- market_close_ist     15:30
    5 * 60 * 1000     -- quote_stale_after_ms 5 minutes
$$;

comment on function public.market_constants() is
  'NSE session bounds, the intraday square-off minute and the quote staleness window, mirroring supabase/functions/_shared/market-constants.ts. Minutes are minute-of-day in IST. Must stay identical to that module; pnpm test:parity is what catches drift.';
