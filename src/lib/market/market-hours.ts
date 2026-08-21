import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

import {
  isTradingSessionAt,
  marketStatusAt,
  type HolidaySet,
  type MarketStatus,
} from '@shared/market-hours.ts'

/**
 * The app's door onto the session logic.
 *
 * The pure core lives in `supabase/functions/_shared/` because the Edge Function
 * runs on Deno and cannot import from `src/`; it is imported here rather than
 * copied, so there is one implementation and nothing to keep in step. What stays
 * on this side are the database-backed wrappers, because the two runtimes build
 * their Supabase clients from different specifiers.
 */

export {
  isTradingDay,
  isTradingSessionAt,
  marketStatusAt,
  type HolidaySet,
  type MarketState,
  type MarketStatus,
} from '@shared/market-hours.ts'

/* ── The database-backed wrappers ───────────────────────────────────────────
 *
 * Everything above is pure and takes its calendar as an argument. These load
 * that calendar and delegate, which is the shape `code-standards.md` shows
 * callers using: `await isTradingSession(supabase, new Date())`.
 *
 * Deliberately not cached here. A module-level cache would outlive a request on
 * the server and go stale in January without anything to invalidate it; the
 * calendar is twenty rows behind an indexed primary key, and F16's tick reads it
 * once per minute.
 */

type HolidayClient = Pick<SupabaseClient<Database>, 'from'>

/**
 * The published closures as a set of IST `YYYY-MM-DD` dates.
 *
 * **Throws rather than degrading.** An empty calendar looks exactly like a
 * successful read on a year with no holidays, and the failure it would cause —
 * trading on Republic Day, or a square-off that never runs — is silent. F16
 * catches this and skips the tick.
 */
export async function loadHolidays(supabase: HolidayClient): Promise<HolidaySet> {
  const { data, error } = await supabase.from('market_holidays').select('trading_date')

  if (error) {
    console.error('[market-hours.loadHolidays]', error)
    throw new Error('MARKET_CALENDAR_UNAVAILABLE')
  }

  return new Set((data ?? []).map((row) => row.trading_date))
}

/** The gate the tick and the order functions ask before doing anything. */
export async function isTradingSession(supabase: HolidayClient, at: Date): Promise<boolean> {
  return isTradingSessionAt(at, await loadHolidays(supabase))
}

/** The state and next transition F20's market-status pill renders. */
export async function getMarketStatus(supabase: HolidayClient, at: Date): Promise<MarketStatus> {
  return marketStatusAt(at, await loadHolidays(supabase))
}
