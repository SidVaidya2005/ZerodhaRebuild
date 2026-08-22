import type { Client } from 'pg'
import { afterEach, expect, test } from 'vitest'

import {
  RACE_PREFIX,
  RACE_SYMBOL,
  cleanupRaceAccounts,
  cleanupRaceInstrument,
  closePair,
  connectPair,
  seedRaceInstrument,
} from './helpers'

/**
 * The two races the order engine has to survive, neither of which pgTAP can
 * express: tier 2 runs in one session inside one transaction, so neither
 * contender would ever see the other's row.
 *
 * These tests **commit**, which is the standing tier-3 trade-off in
 * `code-standards.md` → Testing. Every account is seeded under the `zr-race-`
 * prefix and the instrument they trade is an inactive fixture symbol, so no real
 * instrument's quote is ever written. Both are removed in `afterEach`, including
 * after a failure.
 */

let clients: Client[] = []

afterEach(async () => {
  await closePair(clients)
  clients = []
  await cleanupRaceAccounts()
  await cleanupRaceInstrument()
})

/** A signed-up account with its balance pinned, so the arithmetic is stated. */
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
 * Two buys that each individually fit and together do not.
 *
 * `reserve_margin` locks the funds row before it reads the balance, and this is
 * the assertion that the lock is what makes that safe: without it both
 * transactions read 15000.00, both decide 10001.19 is affordable, and the
 * account ends 5002.38 overdrawn — or, more likely, the `available_cash >= 0`
 * CHECK fires and one of them dies with a 23514 the user sees as a crash rather
 * than as a rejection.
 *
 * CNC BUY 100 @ 100.00 — turnover 10000.00
 *   stt 10.00, exchange 0.307 → 0.31, sebi 0.01, stamp 1.50
 *   gst 0.18 × (0.307 + 0.01) = 0.05706 → 0.06
 *   charges = 11.88;  reservation = 10000.00 + 11.88 = 10011.88
 */
test('two concurrent buys that together exceed the balance produce one fill and one rejection', async () => {
  const [a, b] = await connectPair()
  clients = [a, b]

  await seedRaceInstrument(a, 100)
  const trader = await seedTrader(a, 15000)

  const place = async (client: Client) => {
    await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [trader])
    return client.query<{ status: string; rejection_reason: string | null }>(
      `select status::text, rejection_reason
         from public.place_order($1, 'BUY', 'LIMIT', 'CNC', 100, 100.00)`,
      [RACE_SYMBOL]
    )
  }

  // Issued without awaiting the first, so both are in flight at once.
  const [first, second] = await Promise.allSettled([place(a), place(b)])

  // Neither should error. One is rejected as a business outcome, which returns
  // normally with a REJECTED row — a raised 23514 here would mean the CHECK
  // caught what the lock should have.
  expect([first.status, second.status]).toEqual(['fulfilled', 'fulfilled'])

  const { rows } = await a.query<{ status: string; rejection_reason: string | null; n: string }>(
    `select status::text, rejection_reason, count(*)::text as n
       from public.orders where user_id = $1 and quantity = 100
      group by status, rejection_reason order by status`,
    [trader]
  )

  expect(rows).toHaveLength(2)
  expect(rows.map((r) => [r.status, r.rejection_reason, r.n])).toEqual([
    ['OPEN', null, '1'],
    ['REJECTED', 'INSUFFICIENT_FUNDS', '1'],
  ])

  const funds = await a.query<{ available_cash: string; used_margin: string }>(
    `select available_cash, used_margin from public.funds where user_id = $1`,
    [trader]
  )
  expect(funds.rows[0]).toEqual({ available_cash: '4988.12', used_margin: '10011.88' })
})

/**
 * Two sessions filling the same order.
 *
 * This is the one `code-standards.md` calls the golden pattern's reason for
 * existing: the row lock alone does not prevent it, because the second
 * transaction acquires the lock the moment the first commits and is then handed
 * the freshly committed row. Only re-reading `status` **after** the lock stops
 * it filling a second time.
 *
 * A sequential re-run cannot detect the bug — the second pass no longer selects
 * the order — so the two calls have to be genuinely simultaneous.
 */
test('two concurrent execute_order calls on one order produce exactly one fill', async () => {
  const [a, b] = await connectPair()
  clients = [a, b]

  await seedRaceInstrument(a, 100)
  const trader = await seedTrader(a, 50000)

  await a.query(`select set_config('request.jwt.claim.sub', $1, false)`, [trader])
  const placed = await a.query<{ order_id: string }>(
    `select order_id from public.place_order($1, 'BUY', 'LIMIT', 'CNC', 100, 120.00)`,
    [RACE_SYMBOL]
  )
  const orderId = placed.rows[0]!.order_id

  const fill = (client: Client) =>
    client.query(`select public.execute_order($1)`, [orderId]).then(
      () => 'ok' as const,
      (error: Error) => error.message
    )

  const [resultA, resultB] = await Promise.all([fill(a), fill(b)])

  // Neither call is expected to error: the loser returns quietly, because a
  // concurrent fill is an ordinary outcome and not a fault.
  expect([resultA, resultB]).toEqual(['ok', 'ok'])

  const counts = await a.query<{ trades: string; debits: string; charges: string }>(
    `select (select count(*)::text from public.trades where order_id = $1) as trades,
            (select count(*)::text from public.fund_ledger
              where order_id = $1 and type = 'BUY_DEBIT') as debits,
            (select count(*)::text from public.fund_ledger
              where order_id = $1 and type = 'CHARGES') as charges`,
    [orderId]
  )
  expect(counts.rows[0]).toEqual({ trades: '1', debits: '1', charges: '1' })

  const holding = await a.query<{ quantity: number }>(
    `select quantity from public.holdings where user_id = $1 and symbol = $2`,
    [trader, RACE_SYMBOL]
  )
  expect(holding.rows[0]?.quantity).toBe(100)

  // §12.1 survives the race: the balance is still the sum of the ledger.
  const identity = await a.query<{ matches: boolean }>(
    `select f.available_cash = (
              select coalesce(sum(l.amount), 0) from public.fund_ledger l where l.user_id = f.user_id
            ) as matches
       from public.funds f where f.user_id = $1`,
    [trader]
  )
  expect(identity.rows[0]?.matches).toBe(true)
})
