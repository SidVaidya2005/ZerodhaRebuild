-- `health_check()` — the one thing an unauthenticated caller may ask the
-- database, for `/api/health` (build-plan feature 39).
--
-- **Why a function rather than a read.** `anon` holds exactly one grant in this
-- schema — `insert on support_messages` — and `constraints/security.md` forbids
-- giving it more: the publishable key ships in the browser bundle, so
-- `grant select` on any reference table would publish the whole Nifty 200
-- universe to anyone who reads the JavaScript (F10). A `security definer`
-- function sidesteps that without weakening it, because it returns a **boolean
-- and a timestamp, never a row of table data**.
--
-- **Why it touches `instruments` at all.** `select now()` alone would prove only
-- that Postgres parsed a statement. Reading a real table proves the schema is
-- present and the reference data is seeded — the two ways a deployed instance is
-- broken while still answering. `exists` stops at the first row, so this stays a
-- cheap index-free probe regardless of universe size.
--
-- **This is also the keep-warm probe.** A Supabase free project pauses after a
-- week idle, and Render's free tier has no cron, so an external scheduler is
-- expected to call `/api/health`. That request must reach *Postgres* to count as
-- activity, which is the second reason this reads a table rather than returning
-- a constant.
create or replace function public.health_check()
returns table (checked_at timestamptz, instruments_seeded boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select now(), exists (select 1 from public.instruments);
$$;

comment on function public.health_check() is
  'Liveness probe for /api/health. Returns the database clock and whether the instrument universe is seeded — never table data. Callable by anon by design; see the header for why a grant on instruments is not.';

-- `revoke … from public` does not revoke from `anon` or `authenticated`:
-- Supabase's default privileges grant EXECUTE to all three directly, so all
-- three are named before granting back (F13). If a later migration ever drops
-- this function rather than replacing it, the ACL goes with it and this revoke
-- must be repeated — the trap that made `market_constants()` browser-callable.
revoke execute on function public.health_check() from public, anon, authenticated;
grant execute on function public.health_check() to anon, authenticated;
