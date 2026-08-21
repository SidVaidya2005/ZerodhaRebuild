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
  // Keys may contain digits (a pooler port ends up in one), and an unquoted
  // value may carry a trailing `# comment` — .env.example encourages annotating
  // the connection string. A greedy match would fold the comment into the URL
  // and fail inside connect() with an opaque parse error instead of a named one.
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    const key = match?.[1]
    if (!key) continue
    let value = (match[2] ?? '').trim()
    const quoted = value.match(/^"([^"]*)"/) ?? value.match(/^'([^']*)'/)
    value = quoted ? (quoted[1] ?? '') : (value.split(/\s+#/)[0] ?? '').trim()
    values[key] = value
  }
  return values
}

// A real environment variable wins over the file. `ALLOW_RACE_TESTS=1 pnpm
// test:race` is the form CLAUDE.md documents and the only one available in CI;
// reading the file alone made that command print SKIPPED and exit 0, which is
// precisely the "a skip is never mistaken for a pass" failure this file exists
// to prevent.
const fileEnv = readEnvFile()
const env: Record<string, string | undefined> = { ...fileEnv, ...process.env }

// An explicit allowlist, never truthiness. `ALLOW_RACE_TESTS=0` is the natural
// way to write "off", and as a raw string it is truthy — which opened the gate
// and committed rows into the one production project. Anything not listed here
// means no.
const PERMITTED = new Set(['1', 'true', 'yes', 'on'])
const permission = (env.ALLOW_RACE_TESTS ?? '').trim().toLowerCase()

if (!PERMITTED.has(permission)) {
  const because =
    permission === ''
      ? 'ALLOW_RACE_TESTS is not set.'
      : `ALLOW_RACE_TESTS is "${permission}", which is not one of ${[...PERMITTED].join(', ')}.`
  console.log(
    '\n[race] SKIPPED — tier 3 commits to the real database, so it is opt-in.\n' +
      `       ${because}\n` +
      '       Set ALLOW_RACE_TESTS=1 in .env.test.local, or pass it on the command line.\n' +
      '       No connection was opened.\n'
  )
  exit(0)
}

const url = env.TEST_DATABASE_URL
if (!url) {
  console.error('[race] TEST_DATABASE_URL is not set in .env.test.local.')
  exit(1)
}

const vitest = spawn('vitest', ['run', '--config', 'vitest.config.race.mts'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_DATABASE_URL: url },
})

vitest.on('exit', (code) => exit(code ?? 1))
