-- The public contact form's table.
--
-- This is the only table in the project that accepts writes from an
-- unauthenticated visitor, which makes its policy the most security-sensitive
-- thing in the schema so far. Two rules define it:
--
--   1. `anon` may INSERT and nothing else.
--   2. There is NO select policy, for any role. The table is write-only from the
--      web. Reading it is an administrative act, done with the service role.
--
-- The publishable key is inlined into the browser bundle by design, so anyone
-- can call this insert. RLS is what stops them doing anything worse than adding
-- a row, and the CHECK constraints below are what stop a single row being
-- enormous. Volume abuse is deliberately unmitigated — see build-plan.md F07
-- Slice B; real rate limiting is out of scope for a portfolio contact form.

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  category text not null,
  message text not null,
  created_at timestamptz not null default now(),

  -- Bounds enforced in the database, not only in Zod. Zod runs in a Server
  -- Action a determined caller can bypass by using the publishable key
  -- directly; the database cannot be bypassed.
  constraint support_messages_name_length check (char_length(name) between 1 and 100),
  constraint support_messages_email_length check (char_length(email) between 3 and 254),
  constraint support_messages_message_length check (char_length(message) between 1 and 2000),
  constraint support_messages_category_allowed
    check (category in ('account', 'orders', 'funds', 'technical'))
);

alter table public.support_messages enable row level security;

-- Anonymous visitors may add a message. Authenticated users are also anon-role
-- for this purpose only in the sense that they inherit it; granting both keeps
-- the policy honest about who it covers.
create policy support_messages_public_insert
  on public.support_messages
  for insert
  to anon, authenticated
  with check (true);

-- Deliberately no select, update or delete policy. With RLS enabled and no
-- policy for a command, that command is denied to every role that is not the
-- table owner or the service role. Adding a select policy later would silently
-- expose every message ever submitted.

-- Defence in depth. Supabase grants anon and authenticated ALL privileges on new
-- public tables by default — verified: SELECT, UPDATE, DELETE and TRUNCATE were
-- all present here — which leaves RLS as the single layer between an anonymous
-- visitor and the whole table. Revoking everything and granting back only INSERT
-- means that if a permissive policy is ever added by mistake, the missing grant
-- still refuses the request.
--
-- It also changes the failure mode from "affects zero rows, silently" to a hard
-- 42501, which is a far easier thing to assert and to notice.
revoke all on public.support_messages from anon, authenticated;
grant insert on public.support_messages to anon, authenticated;

comment on table public.support_messages is
  'Public contact form submissions. Insert-only from the web: no select policy exists for any role.';
