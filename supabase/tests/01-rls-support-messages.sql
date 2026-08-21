-- RLS on the only publicly writable table in the schema.
--
-- `code-standards.md` requires the two denial modes be distinguished, because
-- they are different failures: `is_empty()` is a policy filtering rows away,
-- while `throws_ok(..., '42501', ...)` is a missing grant stopping the request
-- before any policy runs. A test that accepts either cannot tell you which
-- protection is actually holding.
begin;
select plan(10);

-- ── as an anonymous visitor ──────────────────────────────────────────────────
set local role anon;

select lives_ok(
  $$insert into public.support_messages (name, email, category, message)
    values ('Ada', 'ada@example.com', 'orders', 'why was my order rejected?')$$,
  'anon can insert a support message'
);

-- The row just inserted is invisible even to the session that wrote it: there
-- is no select policy for any role.
-- A missing grant, not a policy filter. Verified the hard way: with Supabase's
-- default grants this returned zero rows *silently* instead of throwing, which
-- a weaker assertion would have accepted while the wrong layer was protecting.
select throws_ok(
  $$select id from public.support_messages$$,
  '42501',
  null,
  'anon cannot read back any support message, including its own'
);

select throws_ok(
  $$update public.support_messages set message = 'tampered'$$,
  '42501',
  null,
  'anon cannot update a support message'
);

select throws_ok(
  $$delete from public.support_messages$$,
  '42501',
  null,
  'anon cannot delete a support message'
);

-- ── as a signed-in visitor ───────────────────────────────────────────────────
-- F12 is what makes this role reachable on the contact form: the server client
-- carries the request cookies, so from sign-in onwards a submission arrives as
-- `authenticated`, not `anon`. The policy has always named both roles; only one
-- of them had ever been tested, which left the role most submissions will use
-- with no coverage at all.

set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select lives_ok(
  $$insert into public.support_messages (name, email, category, message)
    values ('Grace', 'grace@example.com', 'funds', 'where did my simulated cash go?')$$,
  'authenticated can insert a support message'
);

-- Identical to the anon arm, and deliberately so: signing in must not turn a
-- write-only table into a readable one.
select throws_ok(
  $$select id from public.support_messages$$,
  '42501',
  null,
  'authenticated cannot read back any support message, including its own'
);

select throws_ok(
  $$update public.support_messages set message = 'tampered'$$,
  '42501',
  null,
  'authenticated cannot update a support message'
);

select throws_ok(
  $$delete from public.support_messages$$,
  '42501',
  null,
  'authenticated cannot delete a support message'
);

-- ── the database bounds the damage, not just Zod ─────────────────────────────
-- Back to anon for the constraint assertions: the bounds are the table's, not a
-- role's, and the anon arm is the one a determined caller actually uses.
reset role;
set local role anon;
select throws_ok(
  $$insert into public.support_messages (name, email, category, message)
    values ('Ada', 'ada@example.com', 'orders', repeat('x', 2001))$$,
  '23514',
  null,
  'a message past the length bound is refused by a CHECK constraint'
);

select throws_ok(
  $$insert into public.support_messages (name, email, category, message)
    values ('Ada', 'ada@example.com', 'not-a-category', 'hello')$$,
  '23514',
  null,
  'a category outside the allowed set is refused by a CHECK constraint'
);

select * from finish();
rollback;
