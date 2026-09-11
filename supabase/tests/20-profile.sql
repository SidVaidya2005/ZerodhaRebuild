-- F35: the profile write path.
--
-- The whole feature opens exactly one column to exactly one role, so this suite
-- is about the *boundary*, not the value: which columns `authenticated` may
-- write, what the CHECK refuses whatever the caller sends, and whether RLS still
-- stops a user reaching another account's row now that an UPDATE grant exists.
--
-- Every assertion rolls back.
begin;
select plan(12);

-- ── fixtures ────────────────────────────────────────────────────────────────
-- Two users, because an isolation assertion needs someone to be isolated from.
-- Inserting into auth.users fires the F13 bootstrap trigger, which writes the
-- profile, funds and watchlist rows — so the client ids below are generated,
-- never chosen.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'f35-one@example.test', '{"full_name": "User One"}'::jsonb),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'f35-two@example.test', '{"full_name": "User Two"}'::jsonb);

-- ── column-level grants ─────────────────────────────────────────────────────
-- The point of the migration: UPDATE is column-blind unless it is granted per
-- column, and RLS cannot narrow it — both policies pass for a user editing
-- their own row, whichever column that row's update touches.
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'theme', 'UPDATE'),
  'authenticated may update its own theme'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'client_id', 'UPDATE'),
  'authenticated may NOT update client_id — it is issued by generate_client_id(), not chosen'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE'),
  'authenticated may NOT update full_name — the identity belongs to Google'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE'),
  'authenticated may NOT update avatar_url'
);

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE'),
  'authenticated may NOT update id'
);

select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'reading the row is untouched by the narrowing'
);

-- The publishable key ships in the browser bundle, so an anon grant here would
-- publish every user's client id and display name (F10).
select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon cannot read profiles at all'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'UPDATE'),
  'anon cannot write profiles at all'
);

-- ── the CHECK ───────────────────────────────────────────────────────────────
-- The grant is only safe because the column cannot hold anything but the two
-- values, whatever a crafted request sends. Asserted as the owner: this is a
-- constraint, not a policy, so it binds every role including this one.
select throws_ok(
  $$update public.profiles set theme = 'blue'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an unknown theme is unstorable, so the open column cannot hold junk'
);

select lives_ok(
  $$update public.profiles set theme = 'light'
     where id = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'light is storable'
);

-- ── RLS, now that a write grant exists ──────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to
  '{"sub": "aaaaaaaa-0000-4000-8000-000000000001", "role": "authenticated"}';

-- Not an error: RLS filters the row out, so the statement succeeds and updates
-- nothing. Asserting the *victim's* value is unchanged is what proves it, since
-- a passing "no error" assertion would also pass on a build with no policy.
update public.profiles set theme = 'light'
 where id = 'aaaaaaaa-0000-4000-8000-000000000002';

reset role;

select is(
  (select theme from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  'dark',
  'one user cannot write another user''s theme — the row stays at its default'
);

select is(
  (select theme from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'light',
  'and the same session did change its own, so the update statement itself works'
);

select * from finish();
rollback;
