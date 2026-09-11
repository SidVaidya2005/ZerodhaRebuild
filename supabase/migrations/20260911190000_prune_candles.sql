-- Candle retention (F33).
--
-- `code-standards/boundary-patterns.md` sketched this as
-- `pruneCandlesOncePerDay(supabase)` inside the `market-tick` handler. It lives
-- here instead, for two reasons:
--
--   1. Retention is pure data work with no HTTP dependency. As SQL it is
--      testable at tier 2 by `18-candles.sql`; inside the Edge Function it could
--      only be verified by deploying and waiting for a tick to fire.
--   2. `market-tick` is F16, which is deliberately parked until the very end of
--      the project. Hanging F33's retention off it would make this feature's
--      completion depend on one that is not going to land for months.
--
-- That document is corrected in the same change, per CLAUDE.md's rule that the
-- losing side of a contradiction is fixed rather than left standing.

-- ── prune_candles ───────────────────────────────────────────────────────────

-- Retention windows, in days, matching CANDLE_RETENTION_DAYS in
-- `src/lib/constants.ts`. A pg_cron job cannot import TypeScript, so the two
-- copies are pinned against each other by `18-candles.sql` rather than by hope.
--
-- 400 rather than 365 for the daily series: the 52-week high and low are derived
-- from exactly that series, so a window of precisely a year would let a prune
-- race the read and quietly shorten the range it is meant to cover.
--
-- `security definer` because nothing but the service role may write `candles`,
-- and a scheduled job runs as the database owner rather than as a grantee.
-- `search_path` is pinned per the same rule every other function here follows: a
-- definer function with a mutable one resolves against whatever the caller set.
create function public.prune_candles()
-- `interval` is reserved, so the output column is `bar_interval`. Naming it
-- `interval` fails to parse rather than shadowing something quietly.
returns table (bar_interval public.candle_interval, deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_windows constant jsonb := jsonb_build_object(
    'FIVE_MIN', 1,
    'THIRTY_MIN', 5,
    'ONE_DAY', 400
  );
  v_interval public.candle_interval;
  v_days integer;
  v_deleted bigint;
begin
  foreach v_interval in array enum_range(null::public.candle_interval)
  loop
    v_days := (v_windows ->> v_interval::text)::integer;

    -- Bounded by age, not by row count. A symbol nobody has visited simply has
    -- no rows to delete; one visited daily for a year has exactly its window.
    delete from public.candles c
     where c.interval = v_interval
       and c.ts < now() - make_interval(days => v_days);

    get diagnostics v_deleted = row_count;

    bar_interval := v_interval;
    deleted := v_deleted;
    return next;
  end loop;
end;
$$;

comment on function public.prune_candles() is
  'Deletes candles past their per-interval retention window. Scheduled daily; see 18-candles.sql.';

-- No client role calls this. Supabase's default privileges grant EXECUTE to
-- public, anon AND authenticated on a new function — `revoke ... from public`
-- alone does not reach the other two, so all three are named (F13).
revoke execute on function public.prune_candles() from public, anon, authenticated;

-- ── Schedule ────────────────────────────────────────────────────────────────

-- Re-running a migration must not fail on a job that already exists.
do $$
begin
  perform cron.unschedule('prune-candles');
exception
  when others then null; -- no such job yet
end;
$$;

-- 18:30 UTC daily — midnight IST, three hours after the close, so a day's final
-- candles are written well before the window that would drop them moves.
-- Unlike the tick this needs no session gate: deleting rows older than the
-- retention window is correct on a holiday, on a weekend, and on a day the
-- exchange never opened.
select cron.schedule(
  'prune-candles',
  '30 18 * * *',
  $$ select public.prune_candles() $$
);
