-- Advance `quotes.prev_close` when a new trading session begins.
--
-- Without this the column is whatever `instruments.prev_close` was seeded with
-- from bhavcopy and never moves again, which breaks two things at once. A day
-- change would be measured against a close from the day the universe was
-- seeded, drifting further from meaning every session. And the simulator's
-- ±5% band is anchored to the same value, so every simulated price is trapped
-- within 5% of its seed *forever* — `library-docs.md` already specifies that
-- clamp as "±5% of previous close **per session**", which this is what makes
-- true.
--
-- **Derived from the data, not from a scheduled event.** The obvious design is a
-- job at 15:30 that copies `ltp` into `prev_close`, and on this stack it would
-- be wrong: Render sleeps, the free tier's cron window is coarse, and a missed
-- run would leave the roll undone with nothing to notice it. Here the condition
-- is a fact about the stored row — its `fetched_at` falls on an earlier IST
-- trading date than the session now running — so a missed tick costs nothing and
-- the next one repairs it. It is idempotent within a session by construction:
-- once a row is written today, its `fetched_at` no longer satisfies the test.
--
-- A symbol nobody has demanded for several sessions rolls to the last price
-- actually observed for it, which is the honest answer: no trading was seen in
-- between, so its day change is zero rather than invented.

create or replace function public.roll_previous_close(
  -- Defaulted rather than required, so the tick calls it with no argument and
  -- pgTAP can still drive it to a chosen date. Postgres carries the tz database,
  -- and Asia/Kolkata has been a fixed +05:30 since 1945 — the same assumption
  -- `_shared/market-hours.ts` makes and checks against `Intl`, so the two agree.
  p_session_date date default (now() at time zone 'Asia/Kolkata')::date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rolled integer;
begin
  -- `updated_at` is left to the `quotes_touch_updated_at` trigger; setting it
  -- here too would imply it needed saying.
  update public.quotes
     set prev_close = ltp
   where (fetched_at at time zone 'Asia/Kolkata')::date < p_session_date
     -- A row already carrying its own last price as the previous close has
     -- nothing to roll; skipping it keeps `updated_at` honest about what
     -- actually changed.
     and prev_close is distinct from ltp;

  get diagnostics v_rolled = row_count;
  return v_rolled;
end;
$$;

comment on function public.roll_previous_close(date) is
  'At the first tick of a session, carry each stale quote''s ltp into prev_close so the day change and the simulator band measure from the previous session. Idempotent within a session. Returns rows rolled.';

-- Internal only, exactly like `select_demanded_symbols`: it writes `quotes`,
-- which only the tick may do, and `security definer` would otherwise make a
-- callable copy a way for any signed-in user to rewrite every price's baseline.
revoke execute on function public.roll_previous_close(date) from public, anon, authenticated;
