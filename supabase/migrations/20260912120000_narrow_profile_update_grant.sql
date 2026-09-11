-- Narrow what a user may write on their own profile to the one field they own.
--
-- `20260821084937_identity_and_market_data.sql` granted `select, update` on the
-- whole table so the theme preference would have somewhere to live. Nothing has
-- written the table since — the bootstrap trigger is `security definer` and runs
-- as the owner — so until F35 the grant was unused and its width invisible.
--
-- What it actually permitted: a table-wide UPDATE grant is column-blind, and RLS
-- only decides *which rows* a user may touch, never which columns. Both policies
-- test `auth.uid() = id`, so a user updating their own row passes — which means
-- any authenticated user could rewrite their own `client_id`, `full_name` or
-- `avatar_url` with one direct PostgREST call, no application code involved.
-- `client_id` is this system's name for the account and is issued by
-- `generate_client_id()` under a uniqueness retry loop (F13); a user choosing
-- their own defeats the reason that function exists.
--
-- `constraints.md`: revoke, then grant back only what a role needs (F07B). F35
-- is the feature that first writes this table, so it is where the grant stops
-- exceeding it.
--
-- `theme` alone is safe to expose: `profiles_theme_allowed` is a CHECK, so the
-- column cannot hold anything but 'light' or 'dark' whatever the caller sends.
revoke update on public.profiles from authenticated;
grant update (theme) on public.profiles to authenticated;

-- `anon` is named explicitly rather than assumed absent. Supabase's default
-- privileges grant directly to all three roles, so a revoke naming only
-- `public` leaves `anon` and `authenticated` standing (F13).
revoke all on public.profiles from anon;
