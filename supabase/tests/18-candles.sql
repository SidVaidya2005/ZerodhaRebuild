-- Feature 33's retention job.
--
-- The windows are hand-written here as the literals `src/lib/constants.ts`
-- carries, not read back out of the function. A test that asks the function what
-- its own window is cannot detect the function having the wrong one — the same
-- trap the Phase 1 checkpoint caught in the charge suite.
--
-- The three intervals are asserted *together* in one run, because the failure
-- worth catching is a prune that deletes the right rows for one interval and the
-- wrong rows for another: `FIVE_MIN` keeps a day and `ONE_DAY` keeps 400, so a
-- single shared window would look correct on whichever interval was tested
-- alone.
begin;
select plan(14);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Written as the connecting role, which owns these tables and bypasses RLS.

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true),
  ('INFY', 'Infosys Limited', 'INFY.NS', true)
  on conflict (symbol) do update set is_active = excluded.is_active;

delete from public.candles where symbol in ('RELIANCE', 'INFY');

-- Two bars per interval per symbol: one comfortably inside the window and one
-- comfortably outside it. The offsets straddle each boundary by twelve hours, so
-- a prune that is off by a rounding error still lands on the right side.
insert into public.candles (symbol, interval, ts, open, high, low, close, volume)
select
  s.symbol,
  w.interval,
  now() - make_interval(days => w.days) * w.factor,
  100, 110, 90, 105, 1000
from (values ('RELIANCE'), ('INFY')) as s(symbol)
cross join (values
  ('FIVE_MIN'::public.candle_interval, 1, 0.5),
  ('FIVE_MIN'::public.candle_interval, 1, 2.0),
  ('THIRTY_MIN'::public.candle_interval, 5, 0.5),
  ('THIRTY_MIN'::public.candle_interval, 5, 2.0),
  ('ONE_DAY'::public.candle_interval, 400, 0.5),
  ('ONE_DAY'::public.candle_interval, 400, 2.0)
) as w(interval, days, factor);

select is(
  (select count(*) from public.candles where symbol in ('RELIANCE', 'INFY'))::integer,
  12,
  'fixture: twelve bars, two per interval per symbol'
);

-- ── The prune ───────────────────────────────────────────────────────────────

select lives_ok(
  $$ select public.prune_candles() $$,
  'prune_candles runs'
);

-- ── Exactly one bar per interval per symbol survives ─────────────────────────
--
-- Every assertion below is scoped to the two fixture symbols. Reading the whole
-- table instead made this suite pass only while nothing else was cached: one
-- visit to the stock detail page writes a year of real ONE_DAY bars, including
-- today's, and `max(ts)` then answers about those rather than about the prune.

select is(
  (select count(*) from public.candles
    where symbol = 'RELIANCE' and interval = 'FIVE_MIN')::integer,
  1,
  'FIVE_MIN keeps the current day and drops the one before it'
);

select is(
  (select count(*) from public.candles
    where symbol = 'RELIANCE' and interval = 'THIRTY_MIN')::integer,
  1,
  'THIRTY_MIN keeps five days'
);

select is(
  (select count(*) from public.candles
    where symbol = 'RELIANCE' and interval = 'ONE_DAY')::integer,
  1,
  'ONE_DAY keeps 400 days'
);

-- The window is per interval, not shared. A single retention constant would
-- pass every assertion above and fail these three.
select ok(
  (select min(ts) from public.candles where interval = 'FIVE_MIN' and symbol in ('RELIANCE', 'INFY'))
    > now() - interval '1 day',
  'no FIVE_MIN bar survives past one day'
);

select ok(
  (select min(ts) from public.candles where interval = 'THIRTY_MIN' and symbol in ('RELIANCE', 'INFY'))
    > now() - interval '5 days',
  'no THIRTY_MIN bar survives past five days'
);

select ok(
  (select min(ts) from public.candles where interval = 'ONE_DAY' and symbol in ('RELIANCE', 'INFY'))
    > now() - interval '400 days',
  'no ONE_DAY bar survives past 400 days'
);

-- A daily bar 2 days old must survive; it would not if the FIVE_MIN window were
-- applied to every interval.
select ok(
  (select max(ts) from public.candles where interval = 'ONE_DAY' and symbol in ('RELIANCE', 'INFY'))
    < now() - interval '1 day',
  'the surviving ONE_DAY bar is older than the FIVE_MIN window, so the windows are genuinely separate'
);

-- ── It prunes every symbol, not just the one that was read ───────────────────

select is(
  (select count(*) from public.candles where symbol = 'INFY')::integer,
  3,
  'a second symbol is pruned on the same terms'
);

-- ── What it reports ─────────────────────────────────────────────────────────

select is(
  (select count(*) from public.prune_candles())::integer,
  3,
  'it reports one row per interval'
);

select is(
  (select sum(deleted) from public.prune_candles())::integer,
  0,
  'a second run deletes nothing — the prune is idempotent'
);

-- ── Privileges ──────────────────────────────────────────────────────────────

-- Supabase grants EXECUTE to public, anon AND authenticated by default, and
-- `revoke ... from public` does not reach the other two (F13). Asserted rather
-- than assumed, for all three.
select ok(
  not has_function_privilege('anon', 'public.prune_candles()', 'execute'),
  'anon cannot execute prune_candles'
);

select ok(
  not has_function_privilege('authenticated', 'public.prune_candles()', 'execute'),
  'authenticated cannot execute prune_candles'
);

select * from finish();
rollback;
