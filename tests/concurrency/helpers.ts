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

/**
 * Feature 29's lock-order test gets its own symbol, per the rule above.
 */
export const SQUAREOFF_LOCK_SYMBOL = 'ZRRACEL'

/**
 * A funded tier-3 account, identified by the `zr-race-` email prefix so
 * `cleanupRaceAccounts` can find it however the test ended.
 *
 * The bootstrap trigger writes the `funds` row and its `SIGNUP_CREDIT` ledger
 * row, so both are updated rather than inserted — identity 1 (`available_cash =
 * Σ fund_ledger.amount`) must hold before the test starts, or every assertion
 * about money afterwards is measured from a broken baseline.
 */
export async function seedRaceTrader(client: Client, cash: number): Promise<string> {
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
 * prove nothing is open *before* the fixture is created. Failing loudly beats a
 * silent skip.
 *
 * Checked across every symbol including the caller's own, which a `symbol <> $1`
 * form could not do. A stray fixture position — left by a run that died with a
 * query in flight, before `afterEach` cascaded it away — is invisible to a check
 * that excludes its own symbol, and it makes the sweep multi-row: the two runs
 * then contend over two positions instead of one, and the staged interleaving is
 * no longer the one being asserted about.
 */
export async function assertNoOpenMisPositions(client: Client): Promise<void> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n from public.positions
      where product = 'MIS' and net_quantity <> 0`
  )
  if ((rows[0]?.n ?? 0) !== 0) {
    throw new Error(
      `an open MIS position exists before this test seeded anything (${rows[0]?.n}) — either a ` +
        'real one, which this test would square off since it sweeps every symbol and tier 3 ' +
        'commits, or a stray fixture from a run that failed to clean up'
    )
  }
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
export async function waitUntilBlocked(observer: Client, pid: number): Promise<void> {
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
      throw new Error(`backend ${pid} never blocked: ` + JSON.stringify(activity.rows))
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
