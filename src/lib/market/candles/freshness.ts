import { CANDLE_TTL_MS } from '@/lib/constants'
import { isTradingSessionAt, type HolidaySet } from '@shared/market-hours.ts'

import { istDate, lastTradingDate } from './slots'
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
    // Once per trading day, and the test is **whether a newer daily bar can
    // exist yet** — not an age. `lastTradingDate` is the most recent session to
    // have opened, so a series fetched at or after it is holding every bar there
    // is: fetched 15:35 yesterday is still fresh at 09:00 today, and goes stale
    // the moment today's open arrives.
    //
    // An `age < CANDLE_TTL_MS.ONE_DAY` disjunct used to sit here and silently
    // reinstated the 24-hour rule this comment disclaims — it kept yesterday's
    // series "fresh" until 15:35 today, so today's bar was never generated and
    // `StockStats` rendered yesterday's OHLC beside a live header price. (Phase
    // 5 checkpoint)
    const last = lastTradingDate(at, holidays)
    if (last === null) return true
    return istDate(fetchedAt) >= last
  }

  // The two intraday intervals only go stale **during a session**. Outside one
  // the exchange has printed no new bars, so a TTL that expired overnight would
  // re-fetch an unchanged day on every visit for the whole weekend.
  if (!isTradingSessionAt(at, holidays)) return true

  return age < CANDLE_TTL_MS[interval]
}
