/**
 * Measures what a session pays to read `context/`, and fails when it grows past budget.
 *
 * The docs in `context/` are read at the start of every session, so a line added to an
 * always-read file is billed on every future session for the life of the project. That
 * cost is invisible while writing — nothing in the repo reported it until this script,
 * and the set had reached >100k tokens before anyone measured it.
 *
 * Two checks, both of which have already caught a real defect:
 *
 *   1. The always-read set stays under ALWAYS_BUDGET.
 *   2. `progress-tracker.md` → Key Decisions and `constraints.md` stay disjoint. That
 *      file's protocol says eviction between them is a *move*, never a copy; a decision
 *      sitting in both is billed twice on every session.
 *
 * Token figures are an estimate — bytes / BYTES_PER_TOKEN — not a real tokenizer. The
 * budget is a tripwire against drift, not an exact accounting, and a crude estimate
 * applied consistently detects growth just as well as an exact one.
 *
 * Node 26 strips TypeScript natively, so this runs as `node scripts/context-cost.mts`
 * with no transpiler in the way — the same reason `run-pgtap.mts` is a plain script.
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { exit } from 'node:process'

/** Rough bytes-per-token for English prose plus code fences. */
const BYTES_PER_TOKEN = 4

/**
 * The ceiling for everything read at the start of every session. Set with headroom
 * over the measured figure at the time of writing, so ordinary edits pass and a new
 * always-read document does not. Raising this is a deliberate decision, not a fix.
 */
const ALWAYS_BUDGET = 40_000

/** Read every session. Mirrors the "Always, in this order" list in CLAUDE.md. */
const ALWAYS = [
  'CLAUDE.md',
  'context/progress-tracker.md',
  'context/constraints.md',
  'context/project-overview.md',
  'context/architecture.md',
  'context/code-standards.md',
  'context/trading-contract.md',
]

/** Read only when the work triggers it. Reported, never budgeted. */
const ON_DEMAND = [
  'context/build-plan.md',
  'context/architecture/data-model.md',
  'context/architecture/patterns.md',
  'context/code-standards/boundary-patterns.md',
  'context/code-standards/testing.md',
  'context/library-docs.md',
  'context/DESIGN.md',
  'context/build-journal.md',
]

const tokens = (bytes: number): number => Math.round(bytes / BYTES_PER_TOKEN)

function bytesOf(relative: string): number {
  try {
    return statSync(join(process.cwd(), relative)).size
  } catch {
    // A missing always-read file is a broken protocol, not a zero-cost one.
    console.error(`  MISSING  ${relative} — CLAUDE.md points at a file that does not exist`)
    return -1
  }
}

function report(label: string, files: readonly string[]): number {
  console.log(`\n${label}`)
  let total = 0
  let missing = false
  for (const file of files) {
    const size = bytesOf(file)
    if (size < 0) {
      missing = true
      continue
    }
    total += size
    console.log(`  ${file.padEnd(46)} ~${String(tokens(size)).padStart(6)} tok`)
  }
  console.log(`  ${'—'.repeat(46)} ${'—'.repeat(11)}`)
  console.log(`  ${'TOTAL'.padEnd(46)} ~${String(tokens(total)).padStart(6)} tok`)
  return missing ? -1 : total
}

/**
 * A decision lives in `progress-tracker.md` → Key Decisions *or* in `constraints.md`,
 * never both. Matching on the opening clause is enough: bullets are rewritten when
 * they move, but the bolded first phrase is what carries the decision's identity.
 */
function findDuplicatedDecisions(): string[] {
  const tracker = readFileSync(join(process.cwd(), 'context/progress-tracker.md'), 'utf8')
  const constraints = readFileSync(join(process.cwd(), 'context/constraints.md'), 'utf8')

  const keyDecisions = tracker.slice(tracker.indexOf('## Key Decisions'))
  const duplicated: string[] = []

  for (const line of keyDecisions.split('\n')) {
    if (!line.startsWith('- **')) continue
    const claim = line.slice('- **'.length, '- **'.length + 40)
    if (claim.length === 40 && constraints.includes(claim)) duplicated.push(claim)
  }
  return duplicated
}

const alwaysTotal = report('ALWAYS READ — every session:', ALWAYS)
report('ON DEMAND — only when the work triggers it:', ON_DEMAND)

const failures: string[] = []

if (alwaysTotal < 0) {
  failures.push('an always-read file named in CLAUDE.md is missing')
} else if (tokens(alwaysTotal) > ALWAYS_BUDGET) {
  failures.push(
    `always-read set is ~${tokens(alwaysTotal)} tok, over the ${ALWAYS_BUDGET} budget by ` +
      `~${tokens(alwaysTotal) - ALWAYS_BUDGET}. Move detail to an on-demand file rather than ` +
      `raising the budget.`
  )
}

const duplicated = findDuplicatedDecisions()
if (duplicated.length > 0) {
  failures.push(
    `${duplicated.length} decision(s) are in BOTH progress-tracker.md → Key Decisions and ` +
      `constraints.md, so every session pays for them twice. Eviction is a move, not a copy:\n` +
      duplicated.map((d) => `      - ${d}…`).join('\n')
  )
}

if (failures.length > 0) {
  console.error('\nFAIL')
  for (const failure of failures) console.error(`  ${failure}`)
  exit(1)
}

console.log(
  `\nOK — always-read ~${tokens(alwaysTotal)} tok of ${ALWAYS_BUDGET} budget, no duplicated decisions.`
)
