# Constraints — Security, grants, and RLS

> Read this part of `context/constraints.md` before writing a migration, a grant, an RLS
> policy, or a `security definer` function. It is an on-demand reference.
> `architecture.md` and `CLAUDE.md` state the main rule: RLS is the security boundary.
> This file explains the database permissions and checks that support it.

- Client roles get only `select` on the six money tables: `funds`, `fund_ledger`, `orders`, `trades`, `holdings` and `positions`. Grant no insert, update or delete permission, and add no write policy. Every write must go through a `security definer` function. (F11)
- Supabase grants `anon` and `authenticated` ALL privileges on new public tables by default. `support_messages` initially had SELECT, UPDATE, DELETE and TRUNCATE, leaving RLS as its only protection. Revoke these defaults, then grant back only what each role needs. (F07B)
- RLS restricts rows, not columns. A table-wide `grant update` lets a user rewrite every column of a row they own. When only one field is editable, grant that column explicitly, for example `grant update (theme)`. (F35)
- `revoke execute … from public` alone leaves direct grants to `anon` and `authenticated` intact. Supabase's defaults grant EXECUTE to all three roles. Name all three in the revoke and check that `has_function_privilege(...)` is false. (F13)
- On a table accepting public writes, remove unnecessary grants rather than relying only on a filtering policy. The missing grant still blocks access if someone later adds an overly permissive policy. (F07B)
- Give `anon` no grants on reference tables. The publishable key is in the browser bundle; an `anon` select grant would make the entire Nifty 200 universe available to anyone who reads that JavaScript. (F10)
- `anon` reads only through `health_check()`. This `security definer` function returns a boolean and a timestamp, never table rows, so an unauthenticated monitor can call `/api/health` without receiving table access. `21-health-check.sql` checks both that the function is callable and that `anon` cannot select `instruments` or `quotes`. (F39)
- Views use `security_invoker` to apply the caller's RLS rules. Do not replace that boundary with a hand-written user predicate. The watchlist view once had both; removing `security_invoker` still left its tests green because the predicate hid the defect. The predicate was removed so the tests exercise RLS itself. (F18)
- Supabase's `verify_jwt` accepts any valid project key, including the public browser key. This was measured against deployed `market-tick`. Every Edge Function that writes data therefore also checks a Vault-held secret in constant time before database access. Refuse access when the secret is missing. (F16)
- Add a table's write function with the feature that calls it. Do not ship a granted, callable function that remains unused and untested for eight features. (F10)
- Row-level CHECK constraints enforce identities 8 and 6 in `trading-contract.md` §12, plus identity 12's rule that longs hold no collateral. They also require a gross reference price exactly when a position is short. The full short-collateral formula needs the charge calculator and is checked by tests; the CHECKs enforce its row shape, not that complete calculation. (F11)
- A CHECK passes when its expression is NULL as well as when it is true. Handle nullable operands explicitly, for example `coalesce(jsonb_typeof(...), '')`, and test malformed inputs before relying on the constraint. (F11)
- Retire margin before an order leaves `OPEN`. The non-deferrable `orders_no_margin_unless_open` CHECK rejects a status change with error 23514 while `blocked_margin` is non-zero. Release first, or change both columns in one `UPDATE`. (F11)
- Foreign keys cascade from `orders` and `profiles` to protect future paths that might forget a dependent table. `reset_account` still deletes each table explicitly, as `trading-contract.md` §11 requires. (F11)
- Keep `generate_client_id()` separate from `handle_new_user()`. Tests need to stub generation to prove the 10-attempt limit. Exhaustion must fail signup visibly: admitting a user without a `funds` row would break later money functions. (F13)
- SQL uses the literal `100000.00` for `OPENING_BALANCE`, citing `trading-contract.md` §11. pgTAP checks the bootstrapped balance, and a tier-1 test pins the TypeScript constant. Each check refers to the contract rather than using the other implementation as its expected value. (F13)
- Seed the default watchlist with `INSERT…SELECT` from `instruments`. This only inserts symbols that satisfy the foreign key and remains idempotent regardless of the seed contents. (F13)
