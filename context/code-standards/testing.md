# Code Standards — Testing

> **Reference half of `context/code-standards.md`.** The always-binding rules live there.
> **`trading-contract.md` outranks every money rule stated here.**

## Testing

Four tiers, because no single runner can prove what this project claims. **Match the claim to the tier
that can actually falsify it** — a test in the wrong tier passes whether or not the bug exists.

| Tier | Runner | Proves | Command |
| ---- | ------ | ------ | ------- |
| 1 — logic | Vitest, no database | Charge estimates, `isTradingSession`, provider chain and circuit breaker, Zod parsers, tick interpolation | `pnpm test` |
| 2 — database | pgTAP via `scripts/run-pgtap.mts` | RLS, grants, CHECK constraints, function return values, reconciliation identities | `pnpm test:db` |
| 3 — concurrency | Vitest driving two `pg` connections | Row-lock contention, double-fill, cancel-while-filling, margin races | `pnpm test:race` |
| 4 — parity | Vitest with one read-only `pg` connection | That a TypeScript calculator and its Postgres counterpart are the same calculator | `pnpm test:parity` |

**Why four.** pgTAP runs inside a single session and a single transaction, so it structurally cannot
express two transactions racing for a lock — the exact scenario the status guard in `execute_order`
exists for. Vitest alone cannot reach RLS or a CHECK constraint. Tier 3 exists solely for claims the
other two cannot reach.

**Tier 4 exists because a claim about *two* languages needs both running at once.** `trading-contract.md`
§1 lets TypeScript show a labelled estimate and forbids it producing a stored value — which is only
honest if the estimate the order ticket shows equals the amount actually charged. Proving that needs
`estimateCharges` and `calculate_charges` in one process: tier 1 has no database, tier 2 cannot call
TypeScript, and tier 3 is opt-in because it commits. **Tier 4 is read-only** — the functions it calls
touch no table — so it needs no permission gate and runs inside a plain `pnpm test:all`. It does need
`TEST_DATABASE_URL`, exactly as tier 2 does, and **fails rather than skips without it**: a skipped
tier 3 is a deferred risk, but a skipped tier 4 means the only check comparing the two calculators
silently did not run (F22).

### Environment

There is **no Docker on this machine**, so `supabase start` and `supabase test db --local` are
unavailable. Both database tiers therefore run against the **hosted project**, addressed by
`TEST_DATABASE_URL`.

**There is exactly one Supabase project, and it is the real one.** An earlier version of this
document required a second, throwaway project for tests. That was reversed deliberately: one project
is simpler to operate and cannot silently pause while the other stays warm. The cost is that tier 3
writes into the real database, which is managed rather than avoided — see the tier 3 rules below.

```bash
# Apply the migration history
pnpm supabase db push

# Tier 2 — our own runner, NOT `supabase test db`
pnpm test:db
```

**`supabase test db` is unusable here, and `--db-url` does not save it.** It connects to the remote
database and *then* shells out to `pg_prove` in a container, failing with `LegacyDockerRunError`.
Tier 2 runs through `scripts/run-pgtap.mts` instead: pgTAP's functions return their TAP output as
text rows, so executing a suite through `pg` and reading the rows *is* the TAP stream. The runner
fails on a failed assertion, on a plan mismatch, and on a SQL error — all three observed failing
before it was trusted (F09).

- **Tier 3 commits into the real database.** It cannot do otherwise: proving two connections cannot both fill the same order requires the first one to actually commit. Three rules make that safe, and all three are mandatory:
  1. **`pnpm test:race` refuses to run unless `ALLOW_RACE_TESTS` is set.** A bare `pnpm test:all` must never write to the database by accident, and neither must CI.
  2. Every row a race test creates is seeded under a **recognisable prefix**, so anything it leaves behind is identifiable at a glance.
  3. Cleanup runs in `afterEach` **whether the test passed or failed**. A crashed process can still strand rows; that is the residual risk of a single project, and it is cleared by hand or by `reset_account`.
- Free projects **pause after a week of inactivity**. A run failing to connect usually means the project is paused, not that the code broke.
- `TEST_DATABASE_URL` is a secret and lives only in `.env.test.local`, which is gitignored.

### Tier 2 — pgTAP

One file per concern in `supabase/tests/`, numbered so they run in order. Every file wraps itself in
`begin; … rollback;` so runs leave nothing behind.

```sql
-- supabase/tests/01-rls.sql
begin;
select plan(3);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.local');
-- The bootstrap trigger creates profiles + funds + the signup ledger row for each.

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select is_empty(
  $$select * from public.funds where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'user A reads none of user B''s funds'
);

select is_empty(
  $$update public.funds set available_cash = 999999 returning user_id$$,
  'user A cannot inflate any funds row, including their own'
);

-- The grant policy, tested directly: internal functions are not callable by a user.
select throws_ok(
  $$select public.execute_order('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501',
  null,
  'execute_order is not callable by authenticated'
);

select * from finish();
rollback;
```

- Impersonate with `set local role authenticated;` followed by `set local request.jwt.claim.sub = '<uuid>';`. Use `set local role anon;` for the signed-out case.
- Assert denial with `is_empty()` when a policy filters rows away, and `throws_ok(..., '42501', ...)` when a missing grant stops the request before any policy runs. They are different failures and both must be covered.
- Every table with a `user_id` gets a read-denial and a write-denial case. Every internal function gets a not-callable case.

### Tier 3 — two-connection races

```ts
// tests/concurrency/execute-order.race.test.ts
import { Client } from 'pg'
import { expect, test } from 'vitest'

test('two matcher runs cannot fill the same order twice', async () => {
  const a = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  const b = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  await Promise.all([a.connect(), b.connect()])

  const orderId = await seedOpenLimitOrder(a) // committed, so both sessions see it

  await a.query('begin')
  await b.query('begin')

  // A takes the order row lock and fills.
  await a.query('select public.execute_order($1)', [orderId])

  // B blocks on that same lock — do not await yet.
  const bFill = b.query('select public.execute_order($1)', [orderId])

  await a.query('commit')
  await bFill // unblocks, re-reads status <> 'OPEN', returns without writing
  await b.query('commit')

  const { rows } = await a.query(
    'select count(*)::int as n from public.trades where order_id = $1',
    [orderId]
  )
  expect(rows[0].n).toBe(1)

  await Promise.all([a.end(), b.end()])
})
```

- Use `pg` directly. The Supabase JS client speaks PostgREST — one statement per request, no interactive transactions — so it cannot hold a lock open across statements and cannot express this test at all.
- **Never `await` the second session's call before committing the first.** Awaiting it serialises the two and the test passes with the bug present.
- Tier 3 **commits**, so every test seeds under a recognisable prefix and cleans up in `afterEach`, whether it passed or failed.
- Keep tier 3 small. It is slow and order-dependent; only genuine races belong here.

### The falsifiability rule

For every concurrency guard and every constraint, **run the suite once against a build with the guard
removed and confirm the test fails.** A test that passes in both states proves nothing. Record the
result in the build journal entry for that feature.

This is not hypothetical: an earlier draft of this project specified "run the matcher twice and expect
one fill" as a sequential re-run, which passes whether or not `execute_order` re-checks status, because
the second pass never selects the order.

---

