# Constraints — The Supabase CLI on this machine

> Read this part of `context/constraints.md` before running a migration, regenerating types,
> or deploying an Edge Function. These are local CLI traps; other sessions can skip it.

- Keep `src/types/database.ts` in `.prettierignore`. `supabase gen types` emits double quotes, while Prettier wants single quotes. Formatting generated output would make `format:check` fail after each regeneration, even though nobody should edit that file by hand. (F10)
- Dropping a function removes its ACL, and Supabase's defaults grant EXECUTE back to `public`, `anon` and `authenticated`. Changing a `returns table (...)` shape requires a drop because `create or replace` cannot change an OUT-parameter row type. Repeat the revoke afterward; `11-order-identities.sql` checks which functions a browser can call. (F29)
- Without Docker, `supabase functions deploy` warns and uploads without typechecking. On this machine, deployment does not prove the entrypoint passes Deno's checks. Invoke the deployed function to confirm that it loads. (Phase 4 checkpoint)
- `supabase migration new` can write its file and then hang beyond a 120s timeout. Check for the file before retrying the command. (F09)
- This machine has two Supabase CLIs: Homebrew 2.111.0 and the project's pinned 2.115.0. Signing in to one does not authenticate the other. A missing `~/.supabase/` directory tells you nothing; use `supabase projects list` to check authentication reliably. (1.00.03)
