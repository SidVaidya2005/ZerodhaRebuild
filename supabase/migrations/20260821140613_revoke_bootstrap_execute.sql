-- `revoke execute … from public` was not enough, and the test is what proved it.
--
-- Postgres grants EXECUTE on a new function to PUBLIC, so revoking from PUBLIC
-- looks like the whole job. Supabase additionally sets **default privileges**
-- that grant EXECUTE on functions in `public` to `anon`, `authenticated` and
-- `service_role` — grants held directly by those roles, which a revoke from
-- PUBLIC does not touch. `has_function_privilege('authenticated', …)` was still
-- true after the previous migration.
--
-- This is the same shape as the F07B finding on table grants (`support_messages`
-- arrived with SELECT, UPDATE, DELETE and TRUNCATE already granted): on this
-- platform, assume a role has a privilege until a test says otherwise.
--
-- It matters most for `handle_new_user`: it is `security definer`, so it runs as
-- the owner and bypasses RLS. A callable copy would let any authenticated user
-- invoke it, and `generate_client_id` is revoked alongside it because nothing
-- outside the bootstrap has any business calling it either.
--
-- The history keeps both steps rather than squashing them: the reason this
-- revoke exists is more useful than a migration that looks like it was right
-- first time.

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.generate_client_id() from anon, authenticated;
