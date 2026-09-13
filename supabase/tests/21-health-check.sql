-- `health_check()` — the one function an unauthenticated caller may execute.
--
-- The point of this suite is not that the function returns a row; it is that
-- making it reachable from a browser did **not** widen anything else. `anon`
-- must still be unable to read `instruments` directly, because the publishable
-- key ships in the browser bundle and `constraints/security.md` forbids
-- publishing the universe that way (F10). The function is the exception, and
-- these assertions are what keep it a narrow one.
begin;
select plan(9);

-- ── It exists, and it is the shape the route handler expects ────────────────

select has_function('public', 'health_check', 'health_check() exists');

select is(
  (select p.prosecdef from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'health_check'),
  true,
  'it is security definer — that is what lets it read a table anon cannot'
);

select is(
  (select p.proconfig::text from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'health_check'),
  '{"search_path=\"\""}',
  'and it pins an empty search_path, like every other security definer here'
);

-- ── Reachable from a browser, deliberately ──────────────────────────────────

select ok(
  has_function_privilege('anon', 'public.health_check()', 'execute'),
  'anon may execute it — an unauthenticated pinger is the whole point'
);

select ok(
  has_function_privilege('authenticated', 'public.health_check()', 'execute'),
  'and so may a signed-in caller'
);

-- ── It reports the database honestly ────────────────────────────────────────

select ok(
  (select instruments_seeded from public.health_check()),
  'it reports the universe as seeded, which it is'
);

select ok(
  (select checked_at from public.health_check()) is not null,
  'and it returns the database clock, which is what proves Postgres answered'
);

-- ── It widened nothing ──────────────────────────────────────────────────────
--
-- The security assertion this suite exists for. If a future migration grants
-- `anon` select on a reference table "so the health check can read it", these
-- two go red — which is the whole reason the function was written instead.

select ok(
  not has_table_privilege('anon', 'public.instruments', 'select'),
  'anon still cannot read instruments directly'
);

select ok(
  not has_table_privilege('anon', 'public.quotes', 'select'),
  'and still cannot read quotes'
);

select finish();
rollback;
