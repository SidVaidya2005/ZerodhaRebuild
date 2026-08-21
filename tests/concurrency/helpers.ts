import { Client } from 'pg'

/**
 * Tier 3 helpers.
 *
 * Everything here exists because tier 3 **commits**. It cannot use a
 * transaction-and-rollback the way tier 2 does: proving two connections cannot
 * both fill the same order requires the first one to actually commit, which is
 * the whole reason this tier exists at all.
 *
 * With a single Supabase project that means writing into the production
 * database, so every row is prefixed and every test cleans up even when it
 * fails. See `code-standards.md` → Testing.
 */

/** Everything tier 3 creates starts with this, so strays are identifiable. */
export const RACE_PREFIX = 'zr-race-'

/** Scratch table tier 3 owns outright. Dropped by cleanup. */
export const SCRATCH_TABLE = 'zr_race_scratch'

function connectionString(): string {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Tier 3 runs through `pnpm test:race`, which loads it.'
    )
  }
  return url
}

/**
 * Two independent connections.
 *
 * Not a pool: a pool may hand back the same backend, and a race between two
 * handles onto one session proves nothing. `connections.race.test.ts` asserts
 * the backend PIDs actually differ.
 */
export async function connectPair(): Promise<[Client, Client]> {
  const url = connectionString()
  const a = new Client({ connectionString: url })
  const b = new Client({ connectionString: url })
  await Promise.all([a.connect(), b.connect()])
  return [a, b]
}

export async function closePair(clients: readonly Client[]): Promise<void> {
  await Promise.all(clients.map((client) => client.end().catch(() => undefined)))
}

export async function createScratchTable(client: Client): Promise<void> {
  await client.query(
    `create table if not exists public.${SCRATCH_TABLE} (
       id text primary key,
       claimed_by text
     )`
  )
}

/**
 * Runs in `afterEach`, including after a failure — which is the case that
 * matters. A passing test that tidies up is not the risk; a throwing one that
 * leaves rows in production is.
 */
export async function cleanupScratch(): Promise<void> {
  const client = new Client({ connectionString: connectionString() })
  try {
    await client.connect()
    await client.query(`drop table if exists public.${SCRATCH_TABLE}`)
  } finally {
    await client.end().catch(() => undefined)
  }
}

/** Rows left behind by a crashed run, so a test can assert cleanup worked. */
export async function countScratchRows(): Promise<number | null> {
  const client = new Client({ connectionString: connectionString() })
  try {
    await client.connect()
    const exists = await client.query(
      `select to_regclass('public.${SCRATCH_TABLE}') is not null as present`
    )
    if (!exists.rows[0]?.present) return null
    const { rows } = await client.query(`select count(*)::int as n from public.${SCRATCH_TABLE}`)
    return rows[0]?.n ?? 0
  } finally {
    await client.end().catch(() => undefined)
  }
}
