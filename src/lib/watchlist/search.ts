import type { UniverseEntry } from '@/lib/watchlist/schemas'

/**
 * Ranking for the add-instrument palette.
 *
 * `cmdk`'s own filter is a fuzzy subsequence match, which on a 200-row universe
 * answers "rel" with most of the list — `GROWW`, `BILLIONBRAINS` and every other
 * name whose letters happen to contain r, e and l in order. That is not a search
 * result, it is the universe in a surprising order.
 *
 * So the component turns `shouldFilter` off and uses this instead: a plain
 * case-insensitive substring match, ranked by how the match was found, capped at
 * the 20 the build plan always specified. Pure, so tier 1 can drive it — the
 * component around it cannot be tested without a DOM.
 */

/** The build plan's cap. Twenty is more than anyone scrolls in a sidebar. */
export const SEARCH_LIMIT = 20

/**
 * Lower sorts first. A symbol the visitor is part-way through typing must beat a
 * company whose description merely contains those letters.
 */
function rank(entry: UniverseEntry, needle: string): number {
  const symbol = entry.symbol.toLowerCase()
  const name = entry.name.toLowerCase()

  if (symbol === needle) return 0
  if (symbol.startsWith(needle)) return 1
  if (name.startsWith(needle)) return 2
  if (symbol.includes(needle)) return 3
  if (name.includes(needle)) return 4
  return -1
}

export function searchUniverse(universe: UniverseEntry[], query: string): UniverseEntry[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []

  return universe
    .map((entry) => ({ entry, score: rank(entry, needle) }))
    .filter((scored) => scored.score >= 0)
    .sort((a, b) => a.score - b.score || a.entry.symbol.localeCompare(b.entry.symbol))
    .slice(0, SEARCH_LIMIT)
    .map((scored) => scored.entry)
}
