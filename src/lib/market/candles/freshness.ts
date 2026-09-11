import { CANDLE_TTL_MS } from '@/lib/constants'
import { isTradingSessionAt, type HolidaySet } from '@shared/market-hours.ts'

import { istDate } from './slots'
import type { CandleInterval } from './types'

/**
 * Whether a stored series still stands, per interval.
 *
 * Pure and clock-injected so every boundary is testable at tier 1 — the same
 * seam `market_state(p_at)` and `square_off_mis(p_at)` were given, for the same
 * reason: a rule that can only be exercised during a weekday session is a rule
 * that gets verified once a day at best.
 */
export function isFresh(
  interval: CandleInterval,
  fetchedAt: Date | null,
  at: Date,
  holidays: HolidaySet
): boolean {
  if (fetchedAt === null) return false
  const age = at.getTime() - fetchedAt.getTime()
  if (age < 0) return true

  if (interval === 'ONE_DAY') {
    // Once per trading day. The comparison is on the IST date rather than on a
    // 24-hour age, so a series fetched at 15:35 is still fresh at 09:00 the next
    // morning — before the open there is no new daily bar to have.
    return istDate(fetchedAt) === istDate(at) || age < CANDLE_TTL_MS.ONE_DAY
  }

  // The two intraday intervals only go stale **during a session**. Outside one
  // the exchange has printed no new bars, so a TTL that expired overnight would
  // re-fetch an unchanged day on every visit for the whole weekend.
  if (!isTradingSessionAt(at, holidays)) return true

  return age < CANDLE_TTL_MS[interval]
}
