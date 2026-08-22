/**
 * Tier 4 runner.
 *
 * Tier 4 is read-only — `calculate_charges` and `charge_rates` write nothing —
 * so unlike tier 3 there is no permission gate here. What it does need is
 * `TEST_DATABASE_URL`, exactly as tier 2 does, and the point of deciding that
 * up front is the same as tier 3's: fail by name here rather than opaquely
 * inside `connect()`.
 *
 * It exits **non-zero** when the connection string is missing. That is the
 * opposite of tier 3's skip-and-exit-0, and deliberately so: tier 3 skips
 * because running it is dangerous, while tier 4 not running means the one check
 * that compares the two charge calculators silently did not happen.
 */
import { spawn } from 'node:child_process'
import { exit } from 'node:process'

import { readEnvFile } from './env-file.mts'

const fileEnv = readEnvFile()
if (!fileEnv) {
  console.error('[parity] .env.test.local is missing — it holds TEST_DATABASE_URL.')
  exit(1)
}

const env: Record<string, string | undefined> = { ...fileEnv, ...process.env }

if (!env.TEST_DATABASE_URL) {
  console.error(
    '\n[parity] TEST_DATABASE_URL is not set.\n' +
      '         Tier 4 compares src/lib/trading/charges.ts against the Postgres\n' +
      '         calculator, so it needs the database. Refusing to pass by default.\n'
  )
  exit(1)
}

const child = spawn('pnpm', ['exec', 'vitest', 'run', '--config', 'vitest.config.parity.mts'], {
  stdio: 'inherit',
  env: { ...process.env, TEST_DATABASE_URL: env.TEST_DATABASE_URL },
})

child.on('exit', (code) => exit(code ?? 1))
