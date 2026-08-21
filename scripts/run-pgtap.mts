/**
 * Tier 2: run the pgTAP suites in supabase/tests against the hosted database.
 *
 * This exists because `supabase test db --db-url` shells out to pg_prove inside
 * a Docker container even when the database is remote — it connects first, then
 * dies with LegacyDockerRunError — and this machine has no Docker. The build
 * plan pre-authorised exactly this fallback.
 *
 * There is no TAP library involved. pgTAP's functions *return text rows*:
 * `plan(n)` yields `1..n`, `ok()` yields `ok N - description` or
 * `not ok N - description`. Collecting those rows in order is the TAP stream.
 *
 * Node 26 strips TypeScript natively, so this runs as `node scripts/run-pgtap.ts`
 * with no transpiler in the way.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { exit } from 'node:process'

import { Client } from 'pg'

import { readEnvFile } from './env-file.mts'

const TESTS_DIR = join(process.cwd(), 'supabase', 'tests')

type FileResult = {
  file: string
  planned: number | null
  passed: number
  failures: string[]
  /** Problems with the run itself rather than with an assertion. */
  error: string | null
}

/** `.env.test.local` is gitignored and not loaded by anything else. */
function loadTestEnv(): string {
  const values = readEnvFile()
  if (!values) {
    fail('.env.test.local is missing. It holds TEST_DATABASE_URL and is gitignored.')
  }
  const url = values.TEST_DATABASE_URL
  if (!url) fail('TEST_DATABASE_URL is not set in .env.test.local.')
  return url
}

function fail(message: string): never {
  console.error(`[pgtap] ${message}`)
  exit(1)
}

/**
 * Parse the text rows a pgTAP file produced.
 *
 * A plan mismatch matters as much as a failed assertion: a file declaring
 * `plan(2)` that runs one test has a bug, and grepping only for `not ok` would
 * call that a pass.
 */
function parseTap(lines: readonly string[]): Omit<FileResult, 'file' | 'error'> {
  let planned: number | null = null
  let passed = 0
  const failures: string[] = []

  for (const line of lines) {
    const plan = line.match(/^1\.\.(\d+)/)
    if (plan?.[1]) {
      planned = Number(plan[1])
      continue
    }
    if (line.startsWith('not ok')) {
      failures.push(line)
      continue
    }
    if (line.startsWith('ok ')) passed += 1
  }

  return { planned, passed, failures }
}

async function runFile(connectionString: string, file: string): Promise<FileResult> {
  const client = new Client({ connectionString })
  const sql = readFileSync(join(TESTS_DIR, file), 'utf8')

  try {
    await client.connect()
    const results = await client.query(sql)
    // A multi-statement query returns one result per statement.
    const sets = Array.isArray(results) ? results : [results]
    const lines = sets
      .flatMap((set) => set?.rows ?? [])
      .map((row) => String(Object.values(row as Record<string, unknown>)[0] ?? '').trim())
      .filter(Boolean)

    return { file, ...parseTap(lines), error: null }
  } catch (error) {
    return {
      file,
      planned: null,
      passed: 0,
      failures: [],
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await client.end()
  }
}

async function main(): Promise<void> {
  const connectionString = loadTestEnv()

  const files = readdirSync(TESTS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  if (files.length === 0) fail(`no .sql suites found in ${TESTS_DIR}`)

  const results: FileResult[] = []
  for (const file of files) {
    results.push(await runFile(connectionString, file))
  }

  let broken = false
  for (const result of results) {
    const problems: string[] = []

    if (result.error) {
      problems.push(result.error)
    } else if (result.planned === null) {
      problems.push('no plan line — did the file call plan()?')
    } else {
      const ran = result.passed + result.failures.length
      // A plan mismatch is as much a failure as a failed assertion: a file
      // declaring plan(2) that ran one test has a bug, and grepping only for
      // `not ok` would call that a pass.
      if (ran !== result.planned) {
        problems.push(`planned ${result.planned} assertions, ran ${ran}`)
      }
      problems.push(...result.failures)
    }

    if (problems.length > 0) {
      broken = true
      console.error(`\u2717 ${result.file}`)
      for (const problem of problems) console.error(`    ${problem}`)
    } else {
      console.log(`\u2713 ${result.file} \u2014 ${result.passed}/${result.planned}`)
    }
  }

  if (broken) {
    console.error('\n[pgtap] FAILED')
    exit(1)
  }
  console.log(`\n[pgtap] ${results.length} file(s) passed`)
}

await main()
