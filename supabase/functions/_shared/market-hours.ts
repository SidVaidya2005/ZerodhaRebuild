import {
  IST_OFFSET_MINUTES,
  MARKET_CLOSE_IST,
  MARKET_OPEN_IST,
  PRE_OPEN_START_IST,
} from './market-constants.ts'

/**
 * NSE session state, computed in Asia/Kolkata regardless of where the code runs.
 *
 * **The single implementation**, imported by both runtimes: the Edge Function
 * loads it directly, and `src/lib/market/market-hours.ts` re-exports it with the
 * database-backed wrappers the app uses. `architecture.md` describes
 * `_shared/` as dependency-free logic shared with the app, and one copy cannot
 * drift from itself — which is worth more than any test comparing two.
 *
 * The database wrappers stay on the app side because the two runtimes import
 * different Supabase clients; only the pure core is shared.
 *
 * `architecture.md` → Invariants makes this the only place market time is
 * decided: no other module may call `new Date()` for market logic, and the
 * `pg_cron` window is never the check.
 */

export type MarketState = 'PRE_OPEN' | 'OPEN' | 'CLOSED'

export type MarketStatus = {
  state: MarketState
  /** The instant the state next changes — what F20's pill counts down to. */
  nextTransition: Date
  /** IST calendar date the status was computed for, as `YYYY-MM-DD`. */
  istDate: string
}

/** A set of `YYYY-MM-DD` IST dates NSE is closed, from `market_holidays`. */
export type HolidaySet = ReadonlySet<string>

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE

/**
 * The same instant expressed as IST wall-clock fields.
 *
 * India has observed no daylight saving since 1945, so Asia/Kolkata is a
 * permanent UTC+05:30 and a fixed offset is exact rather than an approximation.
 * `market-hours.test.ts` checks that claim against `Intl` across the year
 * instead of asking the reader to take it on trust.
 */
function toIst(at: Date): { date: string; minutes: number; weekday: number } {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * MS_PER_MINUTE)
  return {
    date: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  }
}

/** The instant at which a given IST date and minute-of-day occurs. */
function fromIst(date: string, minutes: number): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) + (minutes - IST_OFFSET_MINUTES) * MS_PER_MINUTE)
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

/** A day NSE trades: a weekday that is not in the published calendar. */
export function isTradingDay(date: string, holidays: HolidaySet): boolean {
  return !isWeekend(date) && !holidays.has(date)
}

/** The next date NSE trades, strictly after `date`. */
function nextTradingDay(date: string, holidays: HolidaySet): string {
  // Bounded rather than `while (true)`: a calendar seeded with a year of
  // consecutive closures would otherwise hang the request instead of failing.
  for (let offset = 1; offset <= 30; offset += 1) {
    const candidate = addDays(date, offset)
    if (isTradingDay(candidate, holidays)) return candidate
  }
  throw new Error('MARKET_CALENDAR_EXHAUSTED: no trading day within 30 days')
}

/**
 * The pure core. Everything else in this module is a wrapper around it.
 */
export function marketStatusAt(at: Date, holidays: HolidaySet): MarketStatus {
  const { date, minutes } = toIst(at)

  if (isTradingDay(date, holidays)) {
    if (minutes < PRE_OPEN_START_IST) {
      return { state: 'CLOSED', nextTransition: fromIst(date, PRE_OPEN_START_IST), istDate: date }
    }
    if (minutes < MARKET_OPEN_IST) {
      return { state: 'PRE_OPEN', nextTransition: fromIst(date, MARKET_OPEN_IST), istDate: date }
    }
    if (minutes < MARKET_CLOSE_IST) {
      return { state: 'OPEN', nextTransition: fromIst(date, MARKET_CLOSE_IST), istDate: date }
    }
  }

  // Closed for the rest of today: the next change is the next trading day's
  // pre-open, which skips weekends and holidays rather than assuming tomorrow.
  return {
    state: 'CLOSED',
    nextTransition: fromIst(nextTradingDay(date, holidays), PRE_OPEN_START_IST),
    istDate: date,
  }
}

/**
 * The gate the tick and `execute_order` ask. Pre-open is **not** a session: no
 * quote is written and no order fills during the call auction.
 */
export function isTradingSessionAt(at: Date, holidays: HolidaySet): boolean {
  return marketStatusAt(at, holidays).state === 'OPEN'
}
