/**
 * Reading `.env.test.local`, for the tier 2 and tier 3 runners.
 *
 * Both need `TEST_DATABASE_URL` out of a gitignored file nothing else loads, and
 * they had two different parsers for it: `run-race.mts` grew a careful one at
 * the Phase 1 checkpoint after its naive version dropped keys containing digits
 * and folded a trailing `# comment` into the connection string, while
 * `run-pgtap.mts` kept a regex that excluded `\n` but not `\r` — so a CRLF file
 * yielded a URL ending in a carriage return and every suite died inside
 * `connect()` with an opaque error instead of the named diagnostics that runner
 * exists to give.
 *
 * One parser, so a fix to it cannot reach one runner and miss the other. Kept
 * dependency-free deliberately: a runner that needs a package installed before
 * it can tell you your environment is wrong is no use on a fresh clone.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every assignment in `.env.test.local`, or `null` if the file is not there —
 * the caller words its own diagnostic, since the two runners prefix differently.
 *
 * Handles what this project's file actually contains: CRLF or LF, quoted and
 * unquoted values, keys containing digits (a pooler port ends up in one), and a
 * trailing `# comment`, which `.env.example` actively encourages on the
 * connection string.
 */
export function readEnvFile(): Record<string, string> | null {
  let raw: string
  try {
    raw = readFileSync(join(process.cwd(), '.env.test.local'), 'utf8')
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
