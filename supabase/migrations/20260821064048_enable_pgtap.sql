-- pgTAP, for the tier-2 database tests.
--
-- Tracked as a migration rather than created ad hoc by the test runner. There is
-- exactly one Supabase project in this build, so this does install a test-only
-- extension into the production database — which is the lesser problem. An
-- untracked extension the tests silently depend on means a fresh database looks
-- healthy right up until the suite runs, and the migration history stops
-- describing the database it is supposed to describe.
--
-- pgTAP adds functions to the `extensions` schema and no tables, so the cost to
-- the running application is close to nothing.
--
-- The assertions themselves live in supabase/tests/*.sql and are executed by
-- scripts/run-pgtap.ts: `supabase test db` shells out to pg_prove in a Docker
-- container even when the database is remote, and this machine has no Docker.

create extension if not exists pgtap with schema extensions;
