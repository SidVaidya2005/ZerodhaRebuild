/**
 * Tier 3 gate.
 *
 * Tier 3 commits into the production database — it has to, because proving two
 * connections cannot both fill the same order requires the first one to commit.
 * There is only one Supabase project in this build, so this script is the thing
 * standing between a routine `pnpm test:all` and real rows.
 *
 * It deliberately decides *before* Vitest starts, so an un-permitted run never
 * opens a connection at all. Exits 0 when skipping, so it does not break the
 * `test:all` chain — but says so loudly enough that a skip is never mistaken
 * for a pass.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { exit } from 'node:process'

function readEnvFile(): Record<string, string> {
  let raw: string
  try {
    raw = readFileSync(join(process.cwd(), '.env.test.local'), 'utf8')
  } catch {
    console.error('[race] .env.test.local is missing — it holds TEST_DATABASE_URL.')
    exit(1)
  }
  const values: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
    if (match?.[1]) values[match[1]] = match[2] ?? ''
  }
  return values
}

const env = readEnvFile()

if (!env.ALLOW_RACE_TESTS) {
  console.log(
    '\n[race] SKIPPED — tier 3 commits to the real database, so it is opt-in.\n' +
      '       Set ALLOW_RACE_TESTS=1 in .env.test.local to run it.\n' +
      '       No connection was opened.\n'
  )
  exit(0)
}

if (!env.TEST_DATABASE_URL) {
  console.error('[race] TEST_DATABASE_URL is not set in .env.test.local.')
  exit(1)
}

const vitest = spawn('vitest', ['run', '--config', 'vitest.config.race.mts'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_DATABASE_URL: env.TEST_DATABASE_URL },
})

vitest.on('exit', (code) => exit(code ?? 1))
