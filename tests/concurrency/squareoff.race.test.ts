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
 * genuinely overlap — and both will select the same open position, because
 * `square_off_mis`'s SELECT takes no locks. Each then writes its *own* exit
 * order, so the order rows do not collide; what stops the second from exiting
 * the position twice is that `execute_order` finds no position left to close.
 *
 * pgTAP cannot express this: one session, one transaction.
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

/**
 * `square_off_mis` sweeps every open MIS position and tier 3 **commits**, so
 * prove this test's fixture is the only one it can reach before invoking it.
 * Failing loudly beats a silent skip.
 */
async function assertNothingElseWouldSquareOff(client: Client): Promise<void> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n from public.positions
      where product = 'MIS' and net_quantity <> 0 and symbol <> $1`,
    [SQUAREOFF_SYMBOL]
  )
  expect(
    rows[0]!.n,
    'a real MIS position would be squared off by this test — it sweeps every symbol and tier 3 commits'
  ).toBe(0)
}

async function waitUntilBlocked(observer: Client): Promise<void> {
  // `pg_blocking_pids()` is the canonical "waiting on another backend" test.
  // `wait_event_type = 'Lock'` was the first attempt and proved flaky: a backend
  // passes through other wait states, so a poll can miss the window and time out
  // on a run where the block did happen.
  const deadline = Date.now() + 15000
  for (;;) {
    const { rows } = await observer.query<{ n: number }>(
      `select count(*)::int as n from pg_stat_activity
        where cardinality(pg_blocking_pids(pid)) > 0
          and query ilike '%square_off_mis%'
          and pid <> pg_backend_pid()`
    )
    if (rows[0]!.n > 0) return
    if (Date.now() > deadline) {
      const activity = await observer.query(
        `select pid, state, wait_event_type, wait_event, left(query, 60) as query
           from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()`
      )
      throw new Error('square_off_mis never blocked: ' + JSON.stringify(activity.rows))
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

test('two simultaneous square-off runs exit a position exactly once', async () => {
  const [a, b] = await connectPair()
  clients = [a, b]

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

  await assertNothingElseWouldSquareOff(a)

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
  const bRun = b.query('select * from public.square_off_mis($1::timestamptz)', [AT_1520])

  await waitUntilBlocked(a)

  await a.query('select * from public.square_off_mis($1::timestamptz)', [AT_1520])
  await a.query('commit')
  await bRun
  await b.query('commit')

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
