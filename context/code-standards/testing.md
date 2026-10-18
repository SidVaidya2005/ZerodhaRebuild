# Code Standards — Testing

> Read this part of `context/code-standards.md` when writing or debugging tests. The core
> standards still apply. `trading-contract.md` takes precedence on every money rule.
> Read `constraints/testing.md` too for known coverage gaps and test-running traps.

## Testing

Choose the tier that can expose the bug you are trying to prevent. The project has four because
one runner cannot check pure logic, database access rules, competing transactions and agreement
between two languages. A green test in the wrong tier can leave the claim entirely untested.

| Tier            | Runner                                    | Proves                                                                                                    | Command            |
| --------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------ |
| 1 — logic       | Vitest, no database                       | Charge estimates, `isTradingSession`, provider chain and circuit breaker, Zod parsers, tick interpolation | `pnpm test`        |
| 2 — database    | pgTAP via `scripts/run-pgtap.mts`         | RLS, grants, CHECK constraints, function return values, reconciliation identities                         | `pnpm test:db`     |
| 3 — concurrency | Vitest driving two `pg` connections       | Row-lock contention, double-fill, cancel-while-filling, margin races                                      | `pnpm test:race`   |
| 4 — parity      | Vitest with one read-only `pg` connection | Agreement between a TypeScript calculator and its Postgres counterpart                                    | `pnpm test:parity` |

pgTAP runs in one session and one transaction. It cannot create the competing transactions needed
to test `execute_order`'s status guard. Pure Vitest tests cannot reach RLS or CHECK constraints.
Tier 3 handles the races neither of those tiers can express.

Tier 4 compares both implementations in one process. `trading-contract.md` §1 allows a labelled
TypeScript estimate that is never stored, but reserves stored money calculations for Postgres. The order ticket's
estimate must therefore agree with the charge actually calculated. Running `estimateCharges`
and `calculate_charges` together checks this: tier 1 lacks a database, tier 2 cannot call
TypeScript, and tier 3 can be skipped because its commits require explicit opt-in.

Tier 4 is read-only; its functions touch no tables. It runs as part of `pnpm test:all` without
`ALLOW_RACE_TESTS`. It requires `TEST_DATABASE_URL`, like tier 2, and fails if it is missing.
Silently skipping the only comparison between calculators would make a green run misleading.
A skipped tier 3 is instead an explicit deferred risk. (F22)

### Environment

This machine has no Docker, so `supabase start` and `supabase test db --local` are unavailable.
Database tests use the hosted project through `TEST_DATABASE_URL`.

There is one Supabase project, and it is the real one. A separate throwaway test project was
removed deliberately: maintaining one is simpler, and neither project can silently pause while
the other stays active. Tier 3 consequently writes to the real database under the guards below.

```bash
# Apply the migration history
pnpm supabase db push

# Tier 2 — our own runner, NOT `supabase test db`
pnpm test:db
```

`supabase test db` cannot run here even with `--db-url`. It connects remotely, then tries to run
`pg_prove` inside Docker and fails with `LegacyDockerRunError`. Use `scripts/run-pgtap.mts` instead.
pgTAP returns TAP output as text rows, which this runner reads over `pg`. Before it was trusted,
the runner was observed failing for a failed assertion, a plan mismatch and a SQL error. (F09)

Tier 3 must commit: one transaction has to finish before the other can observe that the order
was already filled. Follow all three safeguards:

1. `pnpm test:race` refuses to run without `ALLOW_RACE_TESTS`. A plain `pnpm test:all` or CI run must never write to the database by accident.
2. Seed every race-test row with a recognisable prefix so leftovers are easy to identify.
3. Clean up in `afterEach` on both success and failure. A crashed process can still leave rows behind; clear those by hand or through `reset_account`. This is the accepted residual risk of using one project.

Free projects pause after a week of inactivity. Check whether the project is paused when a test
cannot connect before treating that failure as a code regression.

Keep the secret `TEST_DATABASE_URL` only in the gitignored `.env.test.local`.

### Tier 2 — pgTAP

Put one concern in each numbered file under `supabase/tests/`; numbering controls execution order.
Wrap every suite in `begin; … rollback;` so it leaves no changes behind. The example below shows
role impersonation and the distinction between row filtering and permission denial. Apply the
assertion rules below it when writing a suite for the actual grants.

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

select throws_ok(
  $$update public.funds set available_cash = 999999 returning user_id$$,
  '42501',
  null,
  'user A cannot inflate any funds row, including their own'
);

-- The execute grant, tested directly: internal functions are not callable by a user.
select throws_ok(
  $$select public.execute_order('00000000-0000-0000-0000-000000000000'::uuid)$$,
  '42501',
  null,
  'execute_order is not callable by authenticated'
);

select * from finish();
rollback;
```

- To impersonate a user, run `set local role authenticated;`, then `set local request.jwt.claim.sub = '<uuid>';`. Use `set local role anon;` for the signed-out case.
- Use `is_empty()` when RLS filters rows away. Use `throws_ok(..., '42501', ...)` when a missing grant refuses the statement before policies run. Test both forms of denial where applicable; they are different protections.
- For every table with `user_id`, test denied reads and writes. For every internal function, test that a client cannot call it.

### Tier 3 — two-connection races

The example stages two transactions on the same order lock. The first fills and commits; the
second must then see the updated status and do nothing. Real suites also need the fixture
prefix and `afterEach` cleanup required above.

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

  // These privileged test connections can call the internal helper.
  // Browser roles cannot. A takes the order row lock and fills.
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

- Use `pg` directly. Supabase JS sends one PostgREST statement per request and cannot keep an interactive transaction or row lock open across statements.
- Start the second session's call without `await`, then commit the first. Awaiting the second before that commit prevents the intended interleaving; a serial test can pass even with the guard missing.
- Every test commits, so seed identifiable rows and clean them up in `afterEach` whether assertions pass or fail.
- Reserve tier 3 for actual races. It is slow and order-dependent; other claims belong in cheaper tiers.

### The falsifiability rule

For every concurrency guard and constraint, remove the protection temporarily and run its suite.
Confirm that the test fails, then restore the protection. Record the result in that feature's
build journal entry. Passing with and without the guard means the test did not prove the claim.

An earlier test plan said to run the matcher twice in sequence and expect one fill. That test
passes even if `execute_order` does not recheck status, because the second matcher no longer
selects the completed order. It never creates the race the guard must stop.

---
