import type { Client } from 'pg'
import { afterEach, expect, test } from 'vitest'

import {
  RACE_PREFIX,
  SQUAREOFF_SYMBOL,
  cleanupRaceAccounts,
  cleanupRaceInstrument,
  closePair,
  connectPair,
  seedRaceInstrument,
} from './helpers'

/**
 * Feature 29's race: two `market-tick` runs overlapping at 15:20.
 *
 * The job runs every minute and an Edge Function can be slow, so two runs can
 * genuinely overlap — and both select the same open position, because the
 * sweep's SELECT takes no locks. What stops the second from acting on it is
 * `square_off_mis`'s re-read of the position row `for update`, which finds it
 * closed and skips. Without that re-read the second run writes its exit order
 * anyway and `execute_order`, finding no position to close, opens a naked short.
 *
 * pgTAP cannot express this: one session, one transaction.
 *
 * **Falsifiability (testing.md).** Confirmed 2026-09-05 against a build with the
 * re-read removed — three runs each way, deterministic:
 *
 * | build | locks B holds when it blocks | A returns | B returns | end state |
 * | --- | --- | --- | --- | --- |
 * | re-read present | `positions` only | `(1, 0)` | `(0, 0)` | 0 positions, 1 trade |
 * | re-read removed | **`funds`**, `orders`, `positions` | `(1, 0)` | **`(0, 1)`** | 0 positions, 1 trade |
 *
 * The end state is **identical**, which is why the first version of this test
 * passed against both and could not be cited. Without the re-read, B is already
 * inside `execute_order` holding the `funds` row lock when it blocks on the
 * position row; A then wants that same funds row, and the two deadlock.
 * `square_off_mis`'s `exception when others` swallows the 40P01, counts a fault
 * and continues, so the naked short is never written — a deadlock, not the
 * guard, is what kept the end state clean.
 *
 * The `faulted` counters are therefore what carries this test. To re-prove it,
 * apply `20260905150000_square_off_mis.sql` (the pre-fix body), re-run, and
 * confirm B returns `(0, 1)`; then re-apply
 * `20260905180000_square_off_locks_position.sql`.
 */

let clients: Client[] = []

afterEach(async () => {
  await closePair(clients)
  clients = []
  await cleanupRaceAccounts()
  await cleanupRaceInstrument(SQUAREOFF_SYMBOL)
})

/** 15:20 IST on Monday 2026-09-07, a real trading day. */
const AT_1520 = '2026-09-07T09:50:00Z'

async function seedTrader(client: Client, cash: number): Promise<string> {
  const email = `${RACE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const { rows } = await client.query<{ id: string }>(
    `insert into auth.users (id, email, raw_user_meta_data)
     values (gen_random_uuid(), $1, '{"full_name": "Race Trader"}'::jsonb)
     returning id`,
    [email]
  )
  const id = rows[0]!.id
  await client.query(`update public.funds set available_cash = $2 where user_id = $1`, [
    id,
    cash.toFixed(2),
  ])
  await client.query(
    `update public.fund_ledger set amount = $2, balance_after = $2 where user_id = $1`,
    [id, cash.toFixed(2)]
  )
  return id
}

/** One sweep's return value: `select * from square_off_mis(...)`. */
type Sweep = { squared: number; faulted: number }

/**
 * `square_off_mis` sweeps every open MIS position and tier 3 **commits**, so
 * prove nothing is open *before* the fixture is created. Failing loudly beats a
 * silent skip.
 *
 * Checked across every symbol including this file's own, which the earlier
 * `symbol <> $1` form could not do. A stray fixture position — left by a run
 * that died with a query in flight, before `afterEach` cascaded it away — is
 * invisible to a check that excludes its own symbol, and it makes the sweep
 * multi-row: the two runs then contend over two positions instead of one, and
 * the interleaving staged below is no longer the one being asserted about. That
 * is the reading of the intermittent timeout this test used to show.
 */
async function assertNoOpenMisPositions(client: Client): Promise<void> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n from public.positions
      where product = 'MIS' and net_quantity <> 0`
  )
  expect(
    rows[0]!.n,
    'an open MIS position exists before this test seeded anything — either a real one, which this test would square off since it sweeps every symbol and tier 3 commits, or a stray fixture from a run that failed to clean up'
  ).toBe(0)
}

/**
 * Waits until backend `pid` is blocked on another backend.
 *
 * Asks about **one known pid**, never "is there a backend whose `query` looks
 * like mine". Two earlier forms matched on `query ilike '%square_off_mis%'` and
 * both timed out roughly one run in three with the block plainly present — the
 * dump from a failing run showed a backend `idle in transaction` on
 * `Lock`/`transactionid` whose `query` still read `begin`. Tier 3 connects
 * through Supavisor in session mode, and `pg_stat_activity.query` is not a
 * dependable way to find your own statement through it; the pid is, because
 * session mode pins the client to one server backend.
 *
 * `pg_blocking_pids()` is otherwise the canonical test — `wait_event_type =
 * 'Lock'` was an even earlier attempt and is worse still, since a backend passes
 * through other wait states and a poll can miss the window entirely.
 */
async function waitUntilBlocked(observer: Client, pid: number): Promise<void> {
  const deadline = Date.now() + 15000
  for (;;) {
    const { rows } = await observer.query<{ n: number }>(
      'select cardinality(pg_blocking_pids($1)) as n',
      [pid]
    )
    if ((rows[0]?.n ?? 0) > 0) return
    if (Date.now() > deadline) {
      const activity = await observer.query(
        `select pid, state, wait_event_type, wait_event, left(query, 60) as query
           from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()`
      )
      throw new Error(
        `square_off_mis never blocked (watching pid ${pid}): ` + JSON.stringify(activity.rows)
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

test('two simultaneous square-off runs exit a position exactly once', async () => {
  const [a, b] = await connectPair()
  clients = [a, b]

  await assertNoOpenMisPositions(a)

  await seedRaceInstrument(a, 100, SQUAREOFF_SYMBOL)
  const trader = await seedTrader(a, 50000)

  // Open an MIS long by resting a crossing limit and filling it. `place_order`
  // gates MARKET orders on the current session, which would make this test
  // depend on the hour it runs; a LIMIT has no such gate.
  await a.query(`select set_config('request.jwt.claim.sub', $1, false)`, [trader])
  const { rows: placed } = await a.query<{ order_id: string }>(
    `select order_id from public.place_order($1, 'BUY', 'LIMIT', 'MIS', 10, 110.00)`,
    [SQUAREOFF_SYMBOL]
  )
  await a.query('select public.execute_order($1)', [placed[0]!.order_id])

  // A holds the position row first, so B is guaranteed to have selected it
  // while it was still open. Issuing B's run and committing A immediately is
  // not enough — if B's query has not reached the wire, its own SELECT finds no
  // position and the test passes whether or not the exit is idempotent.
  // The position must exist before anything below means anything — a `for
  // update` over zero rows locks nothing, B never blocks, and the failure
  // surfaces later as a confusing timeout rather than as the missing fixture.
  const { rows: opened } = await a.query<{ net_quantity: number }>(
    `select net_quantity from public.positions
      where user_id = $1 and symbol = $2 and product = 'MIS'`,
    [trader, SQUAREOFF_SYMBOL]
  )
  expect(opened, 'the MIS position was not opened by the fixture').toHaveLength(1)

  await a.query('begin')
  const locked = await a.query(
    `select 1 from public.positions where user_id = $1 and symbol = $2 and product = 'MIS' for update`,
    [trader, SQUAREOFF_SYMBOL]
  )
  expect(locked.rowCount, 'A locked no position row, so B has nothing to block on').toBe(1)

  await b.query('begin')
  // Read B's backend pid from *inside* its transaction: that is the connection
  // the sweep below will run on, and the one `waitUntilBlocked` must watch.
  const { rows: bBackend } = await b.query<{ pid: number }>('select pg_backend_pid() as pid')
  const bRun = b.query<Sweep>('select * from public.square_off_mis($1::timestamptz)', [AT_1520])
  // Awaited below. Handled here too, so that a throw while staging the
  // interleaving fails as itself rather than as an unhandled rejection once
  // `afterEach` closes the connection out from under it.
  bRun.catch(() => undefined)

  await waitUntilBlocked(a, bBackend[0]!.pid)

  const aRun = await a.query<Sweep>('select * from public.square_off_mis($1::timestamptz)', [
    AT_1520,
  ])
  await a.query('commit')
  const bRows = (await bRun).rows
  await b.query('commit')

  // What each run *returned* is the only thing that separates this build from
  // one without the position re-read — the end state below does not. See the
  // falsifiability table at the top of this file.
  expect(aRun.rows[0], 'A did not square off the position whose row it holds').toEqual({
    squared: 1,
    faulted: 0,
  })
  expect(
    bRows[0],
    'B did not skip cleanly. A fault here means B entered execute_order, took the funds row lock and deadlocked with A — which is exactly what the position re-read exists to prevent, and what makes the end-state assertions below pass on a build without it'
  ).toEqual({ squared: 0, faulted: 0 })

  const { rows: positions } = await a.query<{ n: number }>(
    `select count(*)::int as n from public.positions where user_id = $1`,
    [trader]
  )
  expect(positions[0]!.n).toBe(0)

  // One exit, not two. A second fill would debit the account again and write a
  // second realised-P&L row for a position that no longer exists.
  const { rows: exits } = await a.query<{ n: number }>(
    `select count(*)::int as n from public.trades
      where user_id = $1 and is_auto_squareoff`,
    [trader]
  )
  expect(exits[0]!.n).toBe(1)

  const { rows: identity } = await a.query<{ ok: boolean }>(
    `select (select available_cash from public.funds where user_id = $1)
          = (select coalesce(sum(amount), 0) from public.fund_ledger where user_id = $1) as ok`,
    [trader]
  )
  expect(identity[0]!.ok).toBe(true)
})
