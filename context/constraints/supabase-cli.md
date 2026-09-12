# Constraints — The Supabase CLI on this machine

> **Reference half of `context/constraints.md`.** Read before running a migration, regenerating
> types, or deploying an Edge Function — not at session start.
> None of it binds a session that never invokes the CLI, which is why it is on demand.

- **`src/types/database.ts` is in `.prettierignore` and must stay there.** `supabase gen types` emits double quotes where Prettier wants single, so formatting it makes `format:check` fail after every regeneration — on a file that is never hand-edited. (F10)
- **Dropping a function discards its ACL, and Supabase's defaults re-grant EXECUTE to `public`, `anon` and `authenticated`.** Widening a `returns table (...)` forces a drop, because `create or replace` cannot change an OUT-parameter row type — so repeat the revoke. `11-order-identities.sql` asserts which functions a browser can reach. (F29)
- **`supabase functions deploy` does not typecheck without Docker** — it warns and uploads anyway, so "Deno typechecks the entrypoint on deploy" is false on this machine. Invoke the deployed function to know it even loads. (Phase 4 checkpoint)
- **`supabase migration new` can hang past a 120s timeout having already written the file.** Check before assuming it failed and re-running. (F09)
- **There are two Supabase CLIs on this machine** — Homebrew 2.111.0 and the project's pinned 2.115.0 — and authenticating one does not authenticate the other. An absent `~/.supabase/` proves nothing; `supabase projects list` failing is the only reliable check. (1.00.03)
