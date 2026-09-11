import { IST_OFFSET_MINUTES, MARKET_CLOSE_IST, MARKET_OPEN_IST } from '@/lib/constants'
import { isTradingDay, type HolidaySet } from '@shared/market-hours.ts'

import type { CandleInterval } from './types'

/**
 * Which candle open times a series should contain.
 *
 * Kept apart from the generator so both halves are testable on their own: this
 * module decides *when* a bar exists, the generator decides what it looks like.
 * A bar exists because NSE was trading, never because a provider happened to
 * return one — which is what stops a weekend or a published closure acquiring a
 * candle.
 *
 * All arithmetic is on IST date strings and minute offsets, matching
 * `_shared/market-hours.ts`. India has observed no daylight saving since 1945,
 * so the fixed offset is exact and `slots.test.ts` pins that claim.
 */

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

/** How many minutes each intraday bar spans. `ONE_DAY` is handled separately. */
const INTRADAY_STEP_MINUTES: Record<'FIVE_MIN' | 'THIRTY_MIN', number> = {
  FIVE_MIN: 5,
  THIRTY_MIN: 30,
}

/** How many *calendar* days back each interval is generated over. */
const LOOKBACK_DAYS: Record<CandleInterval, number> = {
  FIVE_MIN: 1,
  THIRTY_MIN: 7,
  ONE_DAY: 400,
}

/** `YYYY-MM-DD` for the IST day containing `at`. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE).toISOString().slice(0, 10)
}

/** The UTC instant of `minutes` past midnight IST on an IST date. */
export function fromIstDate(date: string, minutes: number): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(
    Date.UTC(year!, month! - 1, day!) + (minutes - IST_OFFSET_MINUTES) * MS_PER_MINUTE
  )
}

/** `date` shifted by whole days, staying on the IST calendar. */
export function addIstDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1, day!) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/**
 * The trading dates in the window ending at `at`, oldest first.
 *
 * Bounded by the lookback rather than by a count, so a stretch of closures
 * shortens the series instead of reaching further back than the retention
 * window keeps.
 */
export function tradingDatesFor(
  interval: CandleInterval,
  at: Date,
  holidays: HolidaySet
): string[] {
  const today = istDate(at)
  const dates: string[] = []
  for (let back = LOOKBACK_DAYS[interval] - 1; back >= 0; back -= 1) {
    const date = addIstDays(today, -back)
    if (isTradingDay(date, holidays)) dates.push(date)
  }
  return dates
}

/**
 * Every candle open time for an interval, oldest first, never later than `at`.
 *
 * The cutoff is what keeps a forming session honest: at 11:00 the 1D chart has
 * the bars up to 11:00 and no more. A bar whose open has not arrived is not a
 * bar we are withholding — it does not exist yet.
 */
export function candleSlots(interval: CandleInterval, at: Date, holidays: HolidaySet): number[] {
  const dates = tradingDatesFor(interval, at, holidays)
  const cutoff = at.getTime()

  if (interval === 'ONE_DAY') {
    // A daily bar is stamped at IST midnight and only exists once its session
    // has opened — otherwise every chart would carry a phantom bar overnight.
    return dates
      .filter((date) => fromIstDate(date, MARKET_OPEN_IST).getTime() <= cutoff)
      .map((date) => fromIstDate(date, 0).getTime())
  }

  const step = INTRADAY_STEP_MINUTES[interval]
  const slots: number[] = []
  for (const date of dates) {
    for (let minute = MARKET_OPEN_IST; minute < MARKET_CLOSE_IST; minute += step) {
      const ts = fromIstDate(date, minute).getTime()
      if (ts <= cutoff) slots.push(ts)
    }
  }
  return slots
}

/**
 * The most recent trading date at or before `at` — what "1D" means.
 *
 * The market is closed for most of the week, so 1D is the last day NSE traded
 * rather than strictly today; on a Sunday it is Friday's session, not an empty
 * chart.
 */
export function lastTradingDate(at: Date, holidays: HolidaySet): string | null {
  let date = istDate(at)
  for (let back = 0; back < 30; back += 1) {
    if (
      isTradingDay(date, holidays) &&
      fromIstDate(date, MARKET_OPEN_IST).getTime() <= at.getTime()
    )
      return date
    date = addIstDays(date, -1)
  }
  return null
}
