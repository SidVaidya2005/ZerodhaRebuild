# Constraints — Security, grants, and RLS

> **Reference half of `context/constraints.md`.** Read **before writing a migration, a grant, an
> RLS policy, or a `security definer` function** — not at session start.
> RLS *is* the security boundary — that rule is an invariant in `architecture.md` and a standing
> rule in `CLAUDE.md`, both always-read. What follows is the operational detail behind it, which
> binds only work that touches the schema.


- **The money tables grant `select` and nothing else** — no insert, update or delete for any client role on `funds`, `fund_ledger`, `orders`, `trades`, `holdings` or `positions`, and no write policy for any command. Every write arrives through a `security definer` function, so a write grant would exist only to be unused. (F11)
- **Supabase grants `anon` and `authenticated` ALL privileges on new public tables by default** — verified on `support_messages`, where SELECT, UPDATE, DELETE and TRUNCATE were all present, leaving RLS as the single layer. Revoke, then grant back only what a role needs. (F07B)
- **A table-wide UPDATE grant is column-blind, and RLS cannot narrow it** — a policy decides which *rows* a user may touch, never which columns, so `grant update` on a table lets them rewrite every column of a row they own. Grant per column (`grant update (theme)`) wherever only one field is theirs to change. (F35)
- **`revoke execute … from public` does not revoke a function from `anon` or `authenticated`.** Supabase sets default privileges granting EXECUTE directly to all three roles, so name all three in the revoke and assert `has_function_privilege(...)` is false rather than assuming. (F13)
- **On a public-write table, prefer a missing grant to a filtering policy** — if a permissive policy is ever added by mistake, the absent grant still refuses. (F07B)
- **No `anon` grant on any reference table.** The publishable key ships in the browser bundle, so granting `anon` select would publish the whole Nifty 200 universe to anyone who reads the JavaScript. (F10)
- **`anon`'s only read path is `health_check()`**, a `security definer` function returning a boolean and a timestamp — never a row of table data. `/api/health` must be callable by an unauthenticated pinger, and the rule above is why it is a function rather than a grant. `21-health-check.sql` asserts the function is reachable **and** that `anon` still cannot select `instruments` or `quotes`, so "grant anon select so the health check can read it" fails a test rather than shipping. (F39)
- **`security_invoker` is the boundary on a view, not a hand-written predicate.** The watchlist view carried both; falsification showed the predicate was holding the line and the invoker setting was free to drop with every test still green. The predicate is application code doing RLS's job, so it was removed. (F18)
- **Supabase's `verify_jwt` accepts any valid project key, including the publishable one in the browser bundle** — measured against the deployed `market-tick`. Any Edge Function that writes data therefore needs a second layer: a Vault-held secret compared in constant time before it touches the database, refusing rather than falling open when unset. (F16)
- **A table's write path ships with the feature that uses it, not with the table.** A granted, callable, untested function with no caller for eight features is the thing being avoided. (F10)
- **Three of `trading-contract.md` §12's identities are CHECK constraints, not test assertions** — identities 8, 12 and 6 are all row-level, so a violating row is unstorable rather than merely detectable later. (F11)
- **A CHECK constraint passes when its expression evaluates to NULL**, not only when it is true, so any nullable operand turns it into a suggestion. Wrap anything nullable (`coalesce(jsonb_typeof(...), '')`) and test the expression against malformed input before trusting it. (F11)
- **Retire an order's margin before its status leaves `OPEN`.** `orders_no_margin_unless_open` is a non-deferrable CHECK, so a statement moving an order out of `OPEN` while `blocked_margin` is non-zero fails with 23514. Release first, or write both columns in one `UPDATE`. (F11)
- **Foreign keys cascade from `orders` and from `profiles`** as a backstop against a future path that forgets a table; `reset_account` still deletes each one explicitly per §11. (F11)
- **Client-ID generation is its own function so exhaustion is testable.** `generate_client_id()` is separate from `handle_new_user()` because proving the 10-attempt bound requires stubbing it, and exhaustion must fail the signup loudly — a user admitted without a `funds` row would break every money function after it. (F13)
- **`OPENING_BALANCE` is a literal in SQL, pinned from both sides.** The migration writes `100000.00` citing `trading-contract.md` §11, pgTAP asserts a bootstrapped account holds exactly that, and a tier-1 test pins the TypeScript constant — both anchored to the contract rather than to each other. (F13)
- **The default watchlist seeds by `INSERT…SELECT` against `instruments`**, which is FK-safe by construction and idempotent whatever the seed contains. (F13)

