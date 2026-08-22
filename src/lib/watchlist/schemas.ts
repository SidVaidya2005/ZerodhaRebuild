import { z } from 'zod'

/**
 * Bounds for the three watchlist writes.
 *
 * These give a useful message; the database is what actually cannot be bypassed.
 * The publishable key ships in the browser bundle, so every one of these
 * functions is reachable directly — `add_watchlist_item` checks `is_active`,
 * `move_watchlist_item` rejects an unknown direction with `22023`, and all three
 * are scoped to `auth.uid()` by RLS. This layer is the courtesy, not the guard.
 */

/**
 * NSE symbols are upper-case alphanumerics with the occasional `&` or `-`
 * (`M&M`, `BAJAJ-AUTO`). Bounded at 32, comfortably above the longest in the
 * universe, so a crafted megabyte of text is refused before it reaches Postgres.
 */
const symbol = z
  .string()
  .trim()
  .min(1, 'Pick a symbol.')
  .max(32, 'That is not a symbol.')
  .regex(/^[A-Z0-9&-]+$/, 'That is not a symbol.')

export const addToWatchlistSchema = z.object({ symbol })
export const removeFromWatchlistSchema = z.object({ symbol })

export const reorderWatchlistSchema = z.object({
  symbol,
  direction: z.enum(['up', 'down'], { error: 'A row moves up or down.' }),
})

/** One row of `watchlist_rows`, as the panel renders it. */
export type WatchlistRow = {
  symbol: string
  name: string
  exchange: string
  sortOrder: number
  ltp: number | null
  change: number | null
  changePct: number | null
}

/** One instrument in the search palette. */
export type UniverseEntry = {
  symbol: string
  name: string
  exchange: string
}
