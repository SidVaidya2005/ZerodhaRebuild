import type { Client } from 'pg'
import { afterEach, expect, test } from 'vitest'

import {
  RACE_PREFIX,
  cleanupRaceAccounts,
  closePair,
  connectPair,
  countRaceAccounts,
} from './helpers'

let clients: Client[] = []

afterEach(async () => {
  await closePair(clients)
  clients = []
  await cleanupRaceAccounts()
})

/**
 * `architecture.md` bounds client-ID generation at 10 retries against a
 * one-million-key space, which only means anything if two simultaneous signups
 * actually resolve. pgTAP cannot express this: it runs in one session inside one
 * transaction, so neither signup would ever see the other's row.
 *
 * This test **commits** — two real accounts exist for the duration of it — which
 * is the standing tier-3 trade-off in `code-standards.md` → Testing. Both are
 * seeded under the `zr-race-` prefix and removed in `afterEach`.
 */
test('two concurrent signups both complete, with different client ids', async () => {
  const [a, b] = await connectPair()
  clients = [a, b]

  const stamp = Date.now()
  const emailA = `${RACE_PREFIX}${stamp}-a@example.com`
  const emailB = `${RACE_PREFIX}${stamp}-b@example.com`

  const signUp = (client: Client, email: string) =>
    client.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), $1, '{"full_name": "Race Tester"}'::jsonb)
       returning id`,
      [email]
    )

  // Fired together rather than awaited in turn: sequential inserts would not
  // contend for the unique index at all, and the test would pass either way.
  const [resultA, resultB] = await Promise.all([signUp(a, emailA), signUp(b, emailB)])

  const idA = resultA.rows[0]?.id as string
  const idB = resultB.rows[0]?.id as string
  expect(idA).toBeTruthy()
  expect(idB).toBeTruthy()

  const { rows } = await a.query(
    `select p.id, p.client_id, f.available_cash, f.opening_balance,
            (select count(*)::int from public.fund_ledger l
              where l.user_id = p.id and l.type = 'SIGNUP_CREDIT') as credits
       from public.profiles p
       join public.funds f on f.user_id = p.id
      where p.id = any($1::uuid[])
      order by p.id`,
    [[idA, idB]]
  )

  expect(rows).toHaveLength(2)
  expect(rows[0].client_id).not.toBe(rows[1].client_id)
  for (const row of rows) {
    expect(row.client_id).toMatch(/^ZR\d{6}$/)
    expect(Number(row.available_cash)).toBe(100000)
    expect(Number(row.opening_balance)).toBe(100000)
    expect(row.credits).toBe(1)
  }
})

test('cleanup removed both accounts the previous test committed', async () => {
  expect(await countRaceAccounts()).toBe(0)
})
