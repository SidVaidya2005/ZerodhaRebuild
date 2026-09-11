import { describe, expect, it } from 'vitest'

import { IST_OFFSET_MINUTES } from '@/lib/constants'

import {
  addIstDays,
  candleSlots,
  fromIstDate,
  istDate,
  lastTradingDate,
  tradingDatesFor,
} from './slots'

/** 2026-01-26 is Republic Day — a published closure that falls on a Monday. */
const HOLIDAYS: ReadonlySet<string> = new Set(['2026-01-26'])
const NONE: ReadonlySet<string> = new Set()

/** An instant in IST on a given day, expressed the way the app would hold it. */
const ist = (date: string, minutes: number) => fromIstDate(date, minutes)

describe('IST arithmetic', () => {
  it('agrees with Intl on the offset, so the fixed 330 is exact not approximate', () => {
    const at = new Date('2026-06-15T18:45:00.000Z')
    const asIst = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
    expect(istDate(at)).toBe(asIst)
  })

  it('rolls the IST date at 18:30 UTC, not at midnight UTC', () => {
    expect(istDate(new Date('2026-03-10T18:29:00.000Z'))).toBe('2026-03-10')
    expect(istDate(new Date('2026-03-10T18:30:00.000Z'))).toBe('2026-03-11')
  })

  it('round-trips a date through fromIstDate', () => {
    expect(istDate(fromIstDate('2026-03-10', 0))).toBe('2026-03-10')
    const midnight = fromIstDate('2026-03-10', 0)
    expect(midnight.getUTCHours() * 60 + midnight.getUTCMinutes()).toBe(
      24 * 60 - IST_OFFSET_MINUTES
    )
  })

  it('crosses a month and a year boundary', () => {
    expect(addIstDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addIstDays('2026-01-01', -1)).toBe('2025-12-31')
  })
})

describe('trading dates', () => {
  it('skips weekends', () => {
    // 2026-01-10 is a Saturday, 2026-01-11 a Sunday.
    const dates = tradingDatesFor('THIRTY_MIN', ist('2026-01-13', 600), NONE)
    expect(dates).not.toContain('2026-01-10')
    expect(dates).not.toContain('2026-01-11')
    expect(dates).toContain('2026-01-12')
  })

  it('skips a published closure', () => {
    const dates = tradingDatesFor('THIRTY_MIN', ist('2026-01-28', 600), HOLIDAYS)
    expect(dates).not.toContain('2026-01-26')
    expect(dates).toContain('2026-01-27')
  })

  it('returns dates oldest first', () => {
    const dates = tradingDatesFor('THIRTY_MIN', ist('2026-01-16', 600), NONE)
    expect([...dates].sort()).toEqual(dates)
  })
})

describe('intraday slots', () => {
  it('gives 75 five-minute bars for a completed session', () => {
    const slots = candleSlots('FIVE_MIN', ist('2026-01-13', 23 * 60), NONE)
    expect(slots).toHaveLength(75)
    expect(istDate(new Date(slots[0]!))).toBe('2026-01-13')
  })

  it('gives 13 thirty-minute bars per completed session', () => {
    const slots = candleSlots('THIRTY_MIN', ist('2026-01-13', 23 * 60), NONE)
    const onThatDay = slots.filter((ts) => istDate(new Date(ts)) === '2026-01-13')
    expect(onThatDay).toHaveLength(13)
  })

  it('opens the first bar at 09:15, not at midnight or at pre-open', () => {
    const [first] = candleSlots('FIVE_MIN', ist('2026-01-13', 23 * 60), NONE)
    expect(new Date(first!).getTime()).toBe(ist('2026-01-13', 9 * 60 + 15).getTime())
  })

  it('stops at the current instant during a live session', () => {
    // At 11:00 the chart has the bars up to 11:00 and no more. A bar whose open
    // has not arrived is not one we are withholding — it does not exist yet.
    // 09:15 to 11:00 inclusive is 105 minutes, so 22 bars have opened.
    const slots = candleSlots('FIVE_MIN', ist('2026-01-13', 11 * 60), NONE)
    expect(slots).toHaveLength(22)
    expect(Math.max(...slots)).toBe(ist('2026-01-13', 11 * 60).getTime())
  })

  it('gives nothing for a weekend', () => {
    expect(candleSlots('FIVE_MIN', ist('2026-01-11', 12 * 60), NONE)).toEqual([])
  })

  it('gives nothing for a published closure', () => {
    expect(candleSlots('FIVE_MIN', ist('2026-01-26', 12 * 60), HOLIDAYS)).toEqual([])
  })
})

describe('daily slots', () => {
  it('stamps a daily bar at IST midnight', () => {
    const slots = candleSlots('ONE_DAY', ist('2026-01-13', 23 * 60), NONE)
    expect(Math.max(...slots)).toBe(ist('2026-01-13', 0).getTime())
  })

  it('carries no bar for a session that has not opened', () => {
    // Overnight, before 09:15: today's daily bar does not exist yet. Without
    // this every chart would carry a phantom bar until the open.
    const slots = candleSlots('ONE_DAY', ist('2026-01-13', 8 * 60), NONE)
    expect(slots.map((ts) => istDate(new Date(ts)))).not.toContain('2026-01-13')
  })

  it('holds no weekend or holiday bars anywhere in a year', () => {
    const slots = candleSlots('ONE_DAY', ist('2026-01-28', 23 * 60), HOLIDAYS)
    const dates = slots.map((ts) => istDate(new Date(ts)))
    expect(dates).not.toContain('2026-01-26')
    for (const date of dates) {
      const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
      expect(day).not.toBe(0)
      expect(day).not.toBe(6)
    }
  })
})

describe('lastTradingDate — what 1D means', () => {
  it('is Friday on a Sunday, not an empty chart', () => {
    expect(lastTradingDate(ist('2026-01-11', 12 * 60), NONE)).toBe('2026-01-09')
  })

  it('is today once the session has opened', () => {
    expect(lastTradingDate(ist('2026-01-13', 10 * 60), NONE)).toBe('2026-01-13')
  })

  it('is the previous session before today has opened', () => {
    expect(lastTradingDate(ist('2026-01-13', 8 * 60), NONE)).toBe('2026-01-12')
  })

  it('steps back over a published closure', () => {
    expect(lastTradingDate(ist('2026-01-26', 12 * 60), HOLIDAYS)).toBe('2026-01-23')
  })
})
