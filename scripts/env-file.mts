/**
 * Reading a gitignored `.env*` file, for the scripts that need one.
 *
 * Three scripts read secrets out of a gitignored file nothing else loads — the
 * tier 2 and tier 3 runners want `TEST_DATABASE_URL` from `.env.test.local`, the
 * reference seed wants the service role key from `.env.local` — and each had
 * grown its own parser: `run-race.mts` got a careful one at
 * the Phase 1 checkpoint after its naive version dropped keys containing digits
 * and folded a trailing `# comment` into the connection string, while
 * `run-pgtap.mts` kept a regex that excluded `\n` but not `\r` — so a CRLF file
 * yielded a value ending in a carriage return, and the caller died deep inside
 * `connect()` or `createClient()` with an opaque error instead of the named
 * diagnostics these scripts exist to give.
 *
 * One parser, so a fix to it cannot reach one caller and miss another —
 * `seed-reference.mts` had a third copy of the same `[^"\n]+` hole, found at the
 * Phase 2 checkpoint *after* this module was extracted to eliminate exactly
 * that. Kept dependency-free deliberately: a script that needs a package
 * installed before it can tell you your environment is wrong is no use on a
 * fresh clone.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every assignment in the named file, or `null` if it is not there — the caller
 * words its own diagnostic, since each script prefixes its output differently.
 *
 * Handles what this project's file actually contains: CRLF or LF, quoted and
 * unquoted values, keys containing digits (a pooler port ends up in one), and a
 * trailing `# comment`, which `.env.example` actively encourages on the
 * connection string.
 */
export function readEnvFile(file = '.env.test.local'): Record<string, string> | null {
  let raw: string
  try {
    raw = readFileSync(join(process.cwd(), file), 'utf8')
  } catch {
    return null
  }

  const values: Record<string, string> = {}
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
