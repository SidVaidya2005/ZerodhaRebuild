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

/**
 * Removes every account tier 3 created, identified by the `zr-race-` email
 * prefix. Deleting the `auth.users` row cascades to profiles, funds, the ledger
 * and the watchlist, so this one statement is the whole cleanup.
 *
 * Runs in `afterEach` including after a failure — a signup test that throws
 * halfway is exactly the case that would otherwise leave real accounts behind.
 */
export async function cleanupRaceAccounts(): Promise<number> {
  const client = new Client({ connectionString: connectionString() })
  try {
    await client.connect()
    const { rowCount } = await client.query(`delete from auth.users where email like $1`, [
      `${RACE_PREFIX}%`,
    ])
    return rowCount ?? 0
  } finally {
    await client.end().catch(() => undefined)
  }
}

/** How many tier-3 accounts are currently in the database. */
export async function countRaceAccounts(): Promise<number> {
  const client = new Client({ connectionString: connectionString() })
  try {
    await client.connect()
    const { rows } = await client.query(
      `select count(*)::int as n from auth.users where email like $1`,
      [`${RACE_PREFIX}%`]
    )
    return rows[0]?.n ?? 0
  } finally {
    await client.end().catch(() => undefined)
  }
}

/** Symbol tier 3 trades against, so no test ever writes a real instrument's quote. */
export const RACE_SYMBOL = 'ZRRACE'

/**
 * Each race *file* gets its own symbol.
 *
 * Files run serially, but a failing test closes its clients while a query is
 * still in flight, so a lock or a half-finished cleanup can outlive the file
 * that created it. Sharing one fixture symbol turns that into the next file's
 * problem — which is how F28's matcher test started flaking the moment F29's
 * square-off test was added beside it. A symbol per file keeps a stranded row
 * in the file that stranded it.
 */
export const MATCHER_SYMBOL = 'ZRRACEM'
export const SQUAREOFF_SYMBOL = 'ZRRACES'

/**
 * A tradeable instrument and a fresh quote for it, created **inactive**.
 *
 * Tier 3 runs against the one real database, and `quotes` is the market tick's
 * table — writing a price for RELIANCE to test a fill would put a fabricated
 * figure on someone's screen. `is_active = false` also keeps the symbol out of
 * the tick's demand union and out of F21's index composite, so it is invisible
 * to everything except the order under test.
 */
export async function seedRaceInstrument(
  client: Client,
  ltp: number,
  symbol: string = RACE_SYMBOL
): Promise<void> {
  await client.query(
    `insert into public.instruments (symbol, name, yahoo_symbol, is_active)
     values ($1, 'Tier 3 Race Fixture', $1 || '.NS', false)
     on conflict (symbol) do update set is_active = false`,
    [symbol]
  )
  await client.query(
    `insert into public.quotes (symbol, ltp, prev_close, provider, fetched_at)
     values ($1, $2, $2, 'SIMULATOR', now())
     on conflict (symbol) do update
       set ltp = excluded.ltp, fetched_at = now(), provider_ts = null`,
    [symbol, ltp.toFixed(2)]
  )
}

/** Runs in `afterEach` including after a failure, like every other cleanup here. */
export async function cleanupRaceInstrument(symbol: string = RACE_SYMBOL): Promise<void> {
  const client = new Client({ connectionString: connectionString() })
  try {
    await client.connect()
    await client.query(`delete from public.quotes where symbol = $1`, [symbol])
    await client.query(`delete from public.instruments where symbol = $1`, [symbol])
  } finally {
    await client.end().catch(() => undefined)
  }
}
