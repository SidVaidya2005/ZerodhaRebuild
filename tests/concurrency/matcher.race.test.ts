import type { Client } from 'pg'
import { afterEach, expect, test } from 'vitest'

import {
  MATCHER_SYMBOL,
  cleanupRaceAccounts,
  cleanupRaceInstrument,
  closePair,
  connectPair,
  seedRaceInstrument,
  seedRaceTrader,
} from './helpers'

/**
 * Feature 28's race: two `market-tick` runs overlapping.
 *
 * `pg_cron` fires once a minute and an Edge Function can be slow, so two runs
 * genuinely can be in flight at once — and both will select the same crossing
 * order, because the matcher's SELECT takes no locks. What stops the second
 * from filling it again is `execute_order`'s status re-check *after* it takes
 * the order row lock, and nothing else. pgTAP cannot express this: one session,
 * one transaction, so neither contender would ever see the other's row.
 *
 * A sequential double-run proves nothing here — the second pass no longer
 * selects the order and passes whether or not the guard exists.
 */

let clients: Client[] = []

afterEach(async () => {
  await closePair(clients)
  clients = []
  await cleanupRaceAccounts()
  await cleanupRaceInstrument(MATCHER_SYMBOL)
})

/**
 * `match_open_orders` takes no user and no symbol — it sweeps every resting
 * order in the database — and tier 3 **commits**. So before invoking it for
 * real, prove that the only order it can reach is this test's own fixture.
 *
 * Ordinarily nothing else qualifies, because the tick stops writing quotes when
 * the session closes and every real quote goes stale within minutes. During
 * market hours it would not be true, and the test would fill a real user's
 * resting order into their real ledger. Failing loudly beats a silent skip:
 * a skipped guard here is indistinguishable from a passing one.
 */
async function assertNothingElseWouldFill(client: Client): Promise<void> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n
       from public.orders o
       join public.quotes q on q.symbol = o.symbol
      where o.status = 'OPEN'
        and o.order_type = 'LIMIT'
        and o.symbol <> $1
        and extract(epoch from (now() - q.fetched_at)) * 1000
            <= (select quote_stale_after_ms from public.market_constants())
        and (
          (o.side = 'BUY' and q.ltp <= o.limit_price)
          or (o.side = 'SELL' and q.ltp >= o.limit_price)
        )`,
    [MATCHER_SYMBOL]
  )
  expect(
    rows[0]!.n,
    'a real resting order would be filled by this test — it sweeps every symbol and tier 3 commits. Re-run outside market hours, or cancel the crossing order first.'
  ).toBe(0)
}

/**
 * Waits until some backend is blocked on a lock inside `match_open_orders`.
 *
 * Polled from the session that holds the lock, which is idle between statements
 * and so is free to observe. A timeout fails rather than proceeding: continuing
 * without the block is what produced a test that passed against a build with
 * the guard removed.
 */
async function waitUntilBlocked(observer: Client): Promise<void> {
  // Reverted to `wait_event_type = 'Lock'` after `pg_blocking_pids()` proved
  // *less* stable here, not more. This form ran clean three times and failed
  // correctly against a build with the status guard removed; that is the bar.
  const deadline = Date.now() + 5000
  for (;;) {
    const { rows } = await observer.query<{ n: number }>(
      `select count(*)::int as n from pg_stat_activity
        where wait_event_type = 'Lock'
          and query ilike '%match_open_orders%'
          and pid <> pg_backend_pid()`
    )
    if (rows[0]!.n > 0) return
    if (Date.now() > deadline) {
      const activity = await observer.query(
        `select pid, state, wait_event_type, wait_event, left(query, 60) as query
           from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()`
      )
      throw new Error('the second matcher run never blocked: ' + JSON.stringify(activity.rows))
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

test('two simultaneous matcher runs fill a crossing order exactly once', async () => {
  const [a, b] = await connectPair()
  clients = [a, b]

  // ltp 100.00, and a resting buy at 110.00 crosses it (§5).
  await seedRaceInstrument(a, 100, MATCHER_SYMBOL)
  const trader = await seedRaceTrader(a, 15000)

  await a.query(`select set_config('request.jwt.claim.sub', $1, false)`, [trader])
  const { rows: placed } = await a.query<{ order_id: string }>(
    `select order_id from public.place_order($1, 'BUY', 'LIMIT', 'CNC', 10, 110.00)`,
    [MATCHER_SYMBOL]
  )
  const orderId = placed[0]!.order_id

  await assertNothingElseWouldFill(a)

  // A takes the order's row lock *before* filling anything, so the interleaving
  // below is forced rather than hoped for.
  //
  // Issuing B's sweep and then immediately committing A is not enough: node-pg
  // may not have put B's query on the wire yet, and if A commits first, B's
  // SELECT never selects the order at all. The test then passes with the guard
  // removed, because the *selection* deduplicated rather than the guard. Making
  // B block while the order is still visibly OPEN is what isolates the guard as
  // the only thing that can prevent the second fill.
  await a.query('begin')
  await a.query('select 1 from public.orders where id = $1 for update', [orderId])

  await b.query('begin')
  const bRun = b.query('select * from public.match_open_orders()')

  // B has now selected the order (still OPEN in its snapshot) and is blocked
  // inside execute_order on A's lock. A is idle, so A can observe that.
  await waitUntilBlocked(a)

  await a.query('select * from public.match_open_orders()')
  await a.query('commit')
  await bRun
  await b.query('commit')

  const { rows: trades } = await a.query<{ n: number }>(
    'select count(*)::int as n from public.trades where order_id = $1',
    [orderId]
  )
  expect(trades[0]!.n).toBe(1)

  const { rows: order } = await a.query<{ status: string; filled_quantity: number }>(
    'select status::text, filled_quantity from public.orders where id = $1',
    [orderId]
  )
  expect(order[0]!.status).toBe('COMPLETE')
  expect(order[0]!.filled_quantity).toBe(10)

  // The cash moved once. A double fill would debit twice and, with 15000.00
  // against a ~1001.19 fill, would not even trip the CHECK — it would just be
  // silently wrong, which is why this is asserted rather than inferred.
  const { rows: debits } = await a.query<{ n: number }>(
    `select count(*)::int as n from public.fund_ledger
      where order_id = $1 and type = 'BUY_DEBIT'`,
    [orderId]
  )
  expect(debits[0]!.n).toBe(1)
})
