import type { Client } from 'pg'
import { afterEach, expect, test } from 'vitest'

import {
  RACE_PREFIX,
  SCRATCH_TABLE,
  cleanupScratch,
  closePair,
  connectPair,
  countScratchRows,
  createScratchTable,
} from './helpers'

let clients: Client[] = []

afterEach(async () => {
  await closePair(clients)
  clients = []
  await cleanupScratch()
})

/**
 * The foundational tier-3 claim: two *distinct* backends, able to see each
 * other's committed work. Every later race test — double fill,
 * cancel-while-filling, margin contention — is meaningless if this is not true,
 * because a pool handing back one session would make every race pass.
 */
test('two connections are separate backends that see each other after commit', async () => {
  const [a, b] = await connectPair()
  clients = [a, b]

  const pidA = (await a.query('select pg_backend_pid() as pid')).rows[0]?.pid
  const pidB = (await b.query('select pg_backend_pid() as pid')).rows[0]?.pid
  expect(pidA).toBeTypeOf('number')
  expect(pidA).not.toBe(pidB)

  await createScratchTable(a)

  const id = `${RACE_PREFIX}${Date.now()}`
  await a.query('begin')
  await a.query(`insert into public.${SCRATCH_TABLE} (id, claimed_by) values ($1, $2)`, [id, 'a'])

  // Uncommitted work must be invisible to the other backend — this is what makes
  // a lock race expressible here and impossible in a single pgTAP session.
  const beforeCommit = await b.query(`select count(*)::int as n from public.${SCRATCH_TABLE}`)
  expect(beforeCommit.rows[0]?.n).toBe(0)

  await a.query('commit')

  const afterCommit = await b.query(`select count(*)::int as n from public.${SCRATCH_TABLE}`)
  expect(afterCommit.rows[0]?.n).toBe(1)
})

test('cleanup drops the table and the rows committed into it', async () => {
  // **Self-contained on purpose.** This used to assert only that
  // `countScratchRows()` was null after the test above, which is equally true
  // when the table was never created — run alone it passed without exercising
  // cleanup at all. Since tier 3's entire justification is that it writes to the
  // production database, the one assertion covering its cleanup cannot be the
  // vacuous kind.
  const [a, b] = await connectPair()
  clients = [a, b]

  await createScratchTable(a)
  await a.query(`insert into public.${SCRATCH_TABLE} (id, claimed_by) values ($1, $2)`, [
    `${RACE_PREFIX}${Date.now()}`,
    'cleanup-check',
  ])

  // The positive control: the row is genuinely there first, which is what makes
  // the null below evidence rather than a coincidence.
  expect(await countScratchRows()).toBe(1)

  await cleanupScratch()
  expect(await countScratchRows()).toBeNull()
})
