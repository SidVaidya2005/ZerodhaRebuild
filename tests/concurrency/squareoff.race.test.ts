import type { Client } from 'pg'
import { afterEach, expect, test } from 'vitest'

import {
  SQUAREOFF_SYMBOL,
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
 * **Falsifiability (testing.md).** Confirmed 2026-09-05 against each earlier
 * body of the function, applied verbatim and then restored:
 *
 * | `square_off_mis` build | B returns | why |
 * | --- | --- | --- |
 * | `20260905190000` (current) | `(0, 0)` | re-reads the position under its lock, finds it closed, skips |
 * | `20260905150000` (no re-read) | **`(1, 0)`** | fills its exit against a closed position — the naked short |
 * | `20260905180000` (position before funds) | **`(0, 1)`** | deadlocks; see `squareoff-lockorder.race.test.ts` |
 *
 * Two earlier versions of this test were weaker, and both failures are worth
 * keeping in view. It staged the interleaving on the **position** row, which is
 * an acquisition order no caller performs since `20260905190000`, so the staging
 * itself deadlocked with the sweep. And it asserted only the **end state**,
 * which was identical on the broken build: the deadlock that build produced was
 * swallowed by `exception when others`, and swallowing it is what stopped the
 * naked short from ever being written.
 *
 * Blocking B on the funds row reaches the sweep through the lock it now takes
 * first, and the hazard finally reports as itself — `(1, 0)` and a short left
 * behind, rather than a fault counter standing in for it.
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

/** One sweep's return value: `select * from square_off_mis(...)`. */
type Sweep = { squared: number; faulted: number }

test('two simultaneous square-off runs exit a position exactly once', async () => {
  const [a, b] = await connectPair()
  clients = [a, b]

  await assertNoOpenMisPositions(a)

  await seedRaceInstrument(a, 100, SQUAREOFF_SYMBOL)
  const trader = await seedRaceTrader(a, 50000)

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

  // A holds the *funds* row, which is the first lock `square_off_mis` takes.
  //
  // It staged this on the position row until the lock order was corrected in
  // 20260905190000. That no longer works, and the reason is the point of the
  // other square-off race file: holding `positions` without `funds` is an
  // ordering no caller performs any more, so the staging itself deadlocked with
  // the sweep. Blocking B on the funds row reaches the same interleaving
  // through the door the sweep actually uses.
  await a.query('begin')
  const locked = await a.query('select 1 from public.funds where user_id = $1 for update', [trader])
  expect(locked.rowCount, 'A locked no funds row, so B has nothing to block on').toBe(1)

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

  // B has now selected the position — still open in its snapshot — and is parked
  // on the funds row. A's own sweep re-takes the funds row it already holds and
  // is free to proceed.
  const aRun = await a.query<Sweep>('select * from public.square_off_mis($1::timestamptz)', [
    AT_1520,
  ])
  await a.query('commit')
  const bRows = (await bRun).rows
  await b.query('commit')

  // What each run *returned* is checked before the end state, because it says
  // more: a build without the re-read leaves the same row counts here for the
  // wrong reason. See the falsifiability table at the top of this file.
  expect(aRun.rows[0], 'A did not square off the position it selected').toEqual({
    squared: 1,
    faulted: 0,
  })
  expect(
    bRows[0],
    'B did not skip cleanly. `squared: 1` means B exited a position A had already closed, which is the naked short the re-read exists to prevent; `faulted: 1` means B deadlocked with A instead, which is the lock-order defect squareoff-lockorder.race.test.ts covers'
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
