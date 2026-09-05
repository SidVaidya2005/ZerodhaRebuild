import type { Client } from 'pg'
import { afterEach, expect, test } from 'vitest'

import {
  SQUAREOFF_LOCK_SYMBOL,
  assertNoOpenMisPositions,
  cleanupRaceAccounts,
  cleanupRaceInstrument,
  closePair,
  connectPair,
  seedRaceInstrument,
  seedRaceTrader,
  waitUntilBlocked,
} from './helpers'

/**
 * Feature 29's *other* race: the 15:20 sweep against a user's own order.
 *
 * `squareoff.race.test.ts` proves two sweeps cannot exit a position twice. This
 * one is about the lock order the fix for that introduced, which is a different
 * claim and cannot be reached from two sweeps — they take their locks in the
 * same sequence and so can only ever queue behind one another.
 *
 * The two functions acquire the same rows in opposite orders:
 *
 * ```
 * execute_order    orders → funds → positions
 * square_off_mis   positions → [execute_order] → funds
 * ```
 *
 * `square_off_mis` takes the position row `for update` and holds it across its
 * `execute_order` call, which then wants that user's `funds` row. Every other
 * caller of `execute_order` — the order ticket, the matcher, a user exit — takes
 * `funds` first and `positions` second. Two transactions touching the same
 * user's same MIS symbol therefore close an ABBA cycle.
 *
 * It is reachable in this build: the order ticket ships (F26) and can place an
 * MIS order at 15:20, and one tick's `match_open_orders` can overlap the next
 * tick's `square_off_mis` — the same overlap `squareoff.race.test.ts` stages.
 *
 * **What a deadlock costs here.** Postgres kills one of the two, and neither
 * outcome is acceptable:
 *
 * - The sweep loses — `exception when others` swallows the `40P01`, counts a
 *   fault, and the loop moves on. The position is **not** squared off, which
 *   `architecture.md` states without exception: "No MIS position survives the
 *   first `market-tick` run at or after 15:20 IST." The next minute's run
 *   usually repairs it, but a position losing every attempt through 15:29
 *   survives the session, because `market_state` closes the sweep at 15:30.
 * - The user's order loses — `execute_order` has no handler, so a raw `40P01`
 *   reaches the caller as a failed order the user did nothing to cause.
 *
 * Asserting **both** outcomes is what makes this test independent of which
 * backend Postgres picks as the victim, which is a timing decision this test
 * must not depend on.
 *
 * **Falsifiability (testing.md).** Apply `20260905180000_square_off_locks_position.sql`
 * — the build that takes the position row first — and this goes red: either B
 * carries a `40P01` or A returns `(0, 1)` with the position still open.
 * Re-apply `20260905190000_square_off_funds_before_position.sql` to restore it.
 */

let clients: Client[] = []

afterEach(async () => {
  await closePair(clients)
  clients = []
  await cleanupRaceAccounts()
  await cleanupRaceInstrument(SQUAREOFF_LOCK_SYMBOL)
})

/** 15:20 IST on Monday 2026-09-07, a real trading day. */
const AT_1520 = '2026-09-07T09:50:00Z'

/** One sweep's return value: `select * from square_off_mis(...)`. */
type Sweep = { squared: number; faulted: number }

type Settled<T> = { ok: true; value: T } | { ok: false; error: Error }

/**
 * Both contenders are in flight at once and either may be the one Postgres
 * aborts, so neither can be awaited with a bare `await` — the rejection would
 * end the test before the other side could be inspected, and the *pair* of
 * outcomes is the assertion.
 */
async function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await promise }
  } catch (error) {
    return { ok: false, error: error as Error }
  }
}

test('a square-off and a user order on the same position do not deadlock', async () => {
  const [a, b] = await connectPair()
  clients = [a, b]

  await assertNoOpenMisPositions(a)

  await seedRaceInstrument(a, 100, SQUAREOFF_LOCK_SYMBOL)
  const trader = await seedRaceTrader(a, 50000)
  await a.query(`select set_config('request.jwt.claim.sub', $1, false)`, [trader])

  // Open the MIS long the sweep will square off. A crossing LIMIT rather than a
  // MARKET order, because `place_order` gates MARKET on the current session and
  // that would make this test depend on the hour it runs.
  const { rows: entry } = await a.query<{ order_id: string }>(
    `select order_id from public.place_order($1, 'BUY', 'LIMIT', 'MIS', 10, 110.00)`,
    [SQUAREOFF_LOCK_SYMBOL]
  )
  await a.query('select public.execute_order($1)', [entry[0]!.order_id])

  // A second MIS order in the same symbol, left resting. This is the user's own
  // order — what the matcher, or the order ticket, would be filling while the
  // sweep runs. `place_order` never fills a LIMIT itself, so it stays OPEN.
  const { rows: resting } = await a.query<{ order_id: string; status: string }>(
    `select order_id, status::text as status
       from public.place_order($1, 'BUY', 'LIMIT', 'MIS', 5, 110.00)`,
    [SQUAREOFF_LOCK_SYMBOL]
  )
  expect(resting[0]!.status, 'the second order did not rest — the fixture is wrong').toBe('OPEN')
  const restingId = resting[0]!.order_id

  // Nothing below means anything without the position: a `for update` over zero
  // rows locks nothing, no one blocks, and the failure surfaces later as a
  // confusing timeout rather than as the missing fixture.
  const { rows: opened } = await a.query<{ net_quantity: number }>(
    `select net_quantity from public.positions
      where user_id = $1 and symbol = $2 and product = 'MIS'`,
    [trader, SQUAREOFF_LOCK_SYMBOL]
  )
  expect(opened, 'the MIS position was not opened by the fixture').toHaveLength(1)

  // ── Stage the cycle ───────────────────────────────────────────────────────
  //
  // B holds the funds row, which is exactly where `execute_order` sits between
  // its funds lock and its position lock. Taking it explicitly makes the window
  // deterministic rather than hoping two functions interleave inside it.
  await b.query('begin')
  await b.query('select 1 from public.funds where user_id = $1 for update', [trader])

  // A runs the sweep, which wants that same funds row. Not awaited: awaiting it
  // here serialises the two and the test passes with the inversion present.
  await a.query('begin')
  const { rows: aBackend } = await a.query<{ pid: number }>('select pg_backend_pid() as pid')
  const aRun = a.query<Sweep>('select * from public.square_off_mis($1::timestamptz)', [AT_1520])
  aRun.catch(() => undefined)

  // Observed from B, which holds a lock but is idle between statements.
  await waitUntilBlocked(b, aBackend[0]!.pid)

  // B now asks for the position row. Under the old lock order A is holding it,
  // and this is the edge that closes the cycle.
  const bRun = b.query('select public.execute_order($1)', [restingId])

  // B is resolved and committed *first*, on purpose. Under the corrected lock
  // order A is parked on the funds row until B lets go of it, so awaiting A
  // first would hang the test rather than fail it.
  const bOutcome = await settle(bRun)
  await b.query('commit').catch(() => undefined)
  const aOutcome = await settle(aRun)
  await a.query('commit').catch(() => undefined)

  expect(
    bOutcome.ok ? null : `${bOutcome.error.message}`,
    "the user's own order was aborted by the database. A 40P01 here is the deadlock: execute_order holds the funds row and wants the position row while square_off_mis holds them the other way round, and execute_order has no handler, so the user sees a failed order they did nothing to cause"
  ).toBeNull()

  expect(
    aOutcome.ok ? aOutcome.value.rows[0] : { threw: aOutcome.error.message },
    'the sweep did not square the position off. A fault here is the same deadlock seen from the other side, swallowed by `exception when others` and counted — leaving an MIS position open past 15:20, which architecture.md states cannot happen'
  ).toEqual({ squared: 1, faulted: 0 })

  // The invariant itself, independent of what either call returned.
  const { rows: left } = await a.query<{ n: number }>(
    `select count(*)::int as n from public.positions
      where user_id = $1 and product = 'MIS' and net_quantity <> 0`,
    [trader]
  )
  expect(left[0]!.n, 'an MIS position survived the 15:20 sweep').toBe(0)

  // One exit, covering both fills. B's order added 5 to the long of 10 before
  // the sweep re-read the row under its lock, so the exit is for 15 — which is
  // also what proves the sweep saw B's committed write rather than its own
  // stale snapshot.
  const { rows: exits } = await a.query<{ n: number; quantity: number }>(
    `select count(*)::int as n, coalesce(max(quantity), 0)::int as quantity
       from public.trades where user_id = $1 and is_auto_squareoff`,
    [trader]
  )
  expect(exits[0]!.n, 'expected exactly one auto square-off trade').toBe(1)
  expect(exits[0]!.quantity, 'the sweep exited a stale quantity').toBe(15)

  const { rows: identity } = await a.query<{ ok: boolean }>(
    `select (select available_cash from public.funds where user_id = $1)
          = (select coalesce(sum(amount), 0) from public.fund_ledger where user_id = $1) as ok`,
    [trader]
  )
  expect(identity[0]!.ok, 'identity 1 broke: available_cash <> Σ fund_ledger.amount').toBe(true)
})
