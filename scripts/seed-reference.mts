/**
 * Seed the reference tables from the committed JSON.
 *
 * The **seed** half of feature 14, and deliberately offline: it reads
 * `supabase/seed/*.json` and talks only to Supabase. Refreshing that JSON from
 * NSE and Yahoo is `fetch-reference-data.mts`, run separately and reviewed as a
 * diff. Separating them means seeding cannot fail because an undocumented
 * upstream changed shape or started throttling.
 *
 * Authenticates as the **service role**: `instruments` and `market_holidays`
 * grant `select` and nothing else to any client role, and loading reference data
 * is exactly the administrative act that key exists for. It reads `.env.local`
 * — never `TEST_DATABASE_URL`, which is named for tests and should not become
 * load-bearing for operations.
 *
 * Idempotent by construction: upsert on the primary key, and **nothing is ever
 * deleted**. A symbol dropped from the index keeps its row, because holdings and
 * trades reference it.
 *
 * Node 26 strips TypeScript natively: `node scripts/seed-reference.mts`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { exit } from 'node:process'

import { createClient } from '@supabase/supabase-js'

import { readEnvFile } from './env-file.mts'

const SEED_DIR = join(process.cwd(), 'supabase', 'seed')

type Instrument = {
  symbol: string
  name: string
  sector: string
  yahoo_symbol: string
}

type Holiday = {
  trading_date: string
  description: string
}

function fail(message: string): never {
  console.error(`[seed] ${message}`)
  exit(1)
}

/**
 * `.env.local` is gitignored and not loaded by anything outside Next.js, so the
 * two values this needs are read directly rather than through `src/lib/env`,
 * which is application code this script must not import.
 */
function loadEnv(): { url: string; serviceRoleKey: string } {
  // Shared with the tier 2 and tier 3 runners. This script used to carry its own
  // copy of the same `[^"\n]+` regex those two had, which silently appends a
  // carriage return on a CRLF file — here that means a service role key that
  // fails auth with no hint as to why.
  const values = readEnvFile('.env.local')
  if (!values) {
    fail('.env.local is missing. It holds the project URL and the service role key.')
  }

  const read = (key: string): string => {
    const value = values[key]
    if (!value) fail(`${key} is not set in .env.local.`)
    return value
  }

  return {
    url: read('NEXT_PUBLIC_SUPABASE_URL'),
    serviceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),
  }
}

function readSeed<T>(file: string, key: string): T[] {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(readFileSync(join(SEED_DIR, file), 'utf8')) as Record<string, unknown>
  } catch {
    fail(`supabase/seed/${file} is missing or unreadable. Run \`pnpm fetch:reference\` first.`)
  }
  const rows = parsed[key]
  if (!Array.isArray(rows) || rows.length === 0) fail(`supabase/seed/${file} carries no ${key}`)
  return rows as T[]
}

async function main(): Promise<void> {
  const { url, serviceRoleKey } = loadEnv()
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const instruments = readSeed<Instrument>('nifty200.json', 'instruments')
  const holidays = readSeed<Holiday>('nse-holidays.json', 'holidays')

  // onConflict names the primary key explicitly: the default would be the
  // table's inferred conflict target, and being wrong about it silently turns an
  // upsert into a failing insert on the second run.
  const { error: instrumentError } = await supabase
    .from('instruments')
    .upsert(instruments, { onConflict: 'symbol' })
  if (instrumentError) fail(`instruments: ${instrumentError.message}`)

  const { error: holidayError } = await supabase
    .from('market_holidays')
    .upsert(holidays, { onConflict: 'trading_date' })
  if (holidayError) fail(`market_holidays: ${holidayError.message}`)

  const [{ count: instrumentCount }, { count: holidayCount }] = await Promise.all([
    supabase.from('instruments').select('*', { count: 'exact', head: true }),
    supabase.from('market_holidays').select('*', { count: 'exact', head: true }),
  ])

  console.log(`[seed] instruments: ${instruments.length} upserted, ${instrumentCount} in table`)
  console.log(`[seed] market_holidays: ${holidays.length} upserted, ${holidayCount} in table`)
}

await main()
