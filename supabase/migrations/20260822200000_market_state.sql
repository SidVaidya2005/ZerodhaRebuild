-- The session and staleness primitives, in Postgres.
--
-- Two rules in `trading-contract.md` §5 have had no implementation anywhere: a
-- market order placed outside the session is REJECTED with MARKET_CLOSED, and
-- one priced from a quote older than QUOTE_STALE_AFTER_MS is REJECTED with
-- NO_QUOTE. Both are money decisions, so both belong here rather than in a
-- Server Action — `place_order` is granted to `authenticated`, and a gate that
-- lives in the action is bypassed by anything calling the RPC directly.
--
-- **This is a second implementation of session logic, and `architecture.md`'s
-- invariant is amended to say so rather than quietly broken.** The other lives
-- in `supabase/functions/_shared/market-hours.ts` and is shared by the app and
-- the Edge Function. What keeps them honest is `tests/parity/market.parity.test.ts`,
-- which drives both over the same boundary instants — the same arrangement that
-- keeps the two charge calculators equal.

-- ---------------------------------------------------------------------------
-- The constants.
-- ---------------------------------------------------------------------------
--
-- One IMMUTABLE composite rather than literals in the function body, for the
-- reasons `charge_rates()` gives: Postgres inlines it, so it costs nothing
-- inside `execute_order`'s locked transaction, and the parity test can compare
-- the numbers directly instead of only inferring them from results.
--
-- **These must stay identical to `supabase/functions/_shared/market-constants.ts`.**
create or replace function public.market_constants()
returns table (
  ist_offset_minutes integer,
  pre_open_start_ist integer,
  market_open_ist integer,
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
    15 * 60 + 30,     -- market_close_ist     15:30
    5 * 60 * 1000     -- quote_stale_after_ms 5 minutes
$$;

comment on function public.market_constants() is
  'NSE session bounds and the quote staleness window, mirroring supabase/functions/_shared/market-constants.ts. Minutes are minute-of-day in IST. Must stay identical to that module; pnpm test:parity is what catches drift.';

-- ---------------------------------------------------------------------------
-- The session state.
-- ---------------------------------------------------------------------------

create type public.market_session_state as enum ('PRE_OPEN', 'OPEN', 'CLOSED');

comment on type public.market_session_state is
  'NSE session state. Mirrors MarketState in _shared/market-hours.ts. PRE_OPEN is NOT a session: no quote is written and no order fills during the call auction.';

-- Computed by adding the fixed IST offset to the UTC instant and reading the
-- wall-clock fields, which is exactly what the TypeScript does — rather than
-- `at time zone 'Asia/Kolkata'`, which would be a *different* method that
-- happens to agree. India has observed no daylight saving since 1945, so the
-- fixed offset is exact and not an approximation; `market-hours.test.ts` checks
-- that claim against `Intl` across the year.
--
-- STABLE, not IMMUTABLE: it reads `market_holidays`, and a calendar row can be
-- inserted between statements. That is also why it takes the instant as an
-- argument instead of calling `now()` internally — the parity test has to be
-- able to drive it to a boundary.
create or replace function public.market_state(p_at timestamptz default now())
returns public.market_session_state
language plpgsql
stable
as $$
declare
  c record;
  v_local timestamp;
  v_date date;
  v_minutes integer;
  v_dow integer;
begin
  select * into c from public.market_constants();

  v_local := (p_at at time zone 'UTC') + make_interval(mins => c.ist_offset_minutes);
  v_date := v_local::date;
  v_minutes := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  v_dow := extract(dow from v_local)::integer;

  -- Weekend, or a published closure. Sunday is 0 and Saturday is 6, matching
  -- the `getUTCDay()` the shared module tests.
  if v_dow = 0 or v_dow = 6 then
    return 'CLOSED';
  end if;

  if exists (select 1 from public.market_holidays h where h.trading_date = v_date) then
    return 'CLOSED';
  end if;

  if v_minutes < c.pre_open_start_ist then
    return 'CLOSED';
  elsif v_minutes < c.market_open_ist then
    return 'PRE_OPEN';
  elsif v_minutes < c.market_close_ist then
    return 'OPEN';
  end if;

  return 'CLOSED';
end;
$$;

comment on function public.market_state(timestamptz) is
  'NSE session state at an instant, per trading-contract.md §5. The Postgres half of a deliberately duplicated implementation — the other is supabase/functions/_shared/market-hours.ts, and tests/parity/market.parity.test.ts proves the two agree over the session boundaries. Takes the instant as an argument so the parity test can drive it; place_order passes now(). Internal-only.';

-- Internal-only, per the grant policy in code-standards.md. The app reads its
-- session state from the shared TypeScript module — F17's pill and F20's badge
-- already do — so nothing outside the engine has a reason to call these.
revoke execute on function public.market_constants() from public, anon, authenticated;
revoke execute on function public.market_state(timestamptz) from public, anon, authenticated;
