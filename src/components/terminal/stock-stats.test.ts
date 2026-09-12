import { describe, expect, it } from 'vitest'

import type { ProviderCandle } from '@/lib/market/candles/types'

import { fiftyTwoWeekRange } from './StockStats'

const NOW = new Date('2026-09-11T10:00:00.000Z')
const DAY = 86_400_000

function bar(daysAgo: number, low: number, high: number): ProviderCandle {
  return {
    ts: NOW.getTime() - daysAgo * DAY,
    open: low,
    high,
    low,
    close: high,
    volume: 1000,
  }
}

describe('fiftyTwoWeekRange', () => {
  it('takes the extremes across the window', () => {
    expect(fiftyTwoWeekRange([bar(340, 90, 110), bar(10, 95, 130)], NOW)).toEqual({
      high: 130,
      low: 90,
    })
  })

  it('ignores a bar older than a year', () => {
    // `prune_candles` keeps 400 days, so the stored series reaches past the
    // window on purpose. A 52-week figure that quietly included month 13 would
    // overstate what it covers.
    const range = fiftyTwoWeekRange([bar(380, 10, 999), bar(340, 95, 130), bar(10, 95, 130)], NOW)
    expect(range).toEqual({ high: 130, low: 95 })
  })

  it('is null when nothing falls inside the window', () => {
    expect(fiftyTwoWeekRange([bar(380, 10, 999)], NOW)).toBeNull()
  })

  it('is null for an empty series', () => {
    expect(fiftyTwoWeekRange([], NOW)).toBeNull()
  })

  it('reads high and low independently, not from one bar', () => {
    // The year's high and the year's low are almost never the same session.
    expect(fiftyTwoWeekRange([bar(340, 50, 60), bar(20, 300, 400)], NOW)).toEqual({
      high: 400,
      low: 50,
    })
  })

  it('is null for a series that does not span a year', () => {
    // **The bug this guard exists for.** The stock page passed the *1M* window —
    // 22 daily bars — and every one of them sits inside 365 days, so a
    // length-based guard returned the one-month high and low under a "52-week"
    // label on the default view of every stock page. A short series is refused,
    // not relabelled.
    const month = Array.from({ length: 22 }, (_, i) => bar(i + 1, 95, 130))
    expect(fiftyTwoWeekRange(month, NOW)).toBeNull()
  })

  it('is null for a symbol listed part-way through the year', () => {
    expect(fiftyTwoWeekRange([bar(180, 50, 60), bar(20, 300, 400)], NOW)).toBeNull()
  })

  it('takes the span from the oldest bar whatever order they arrive in', () => {
    // The guard must not depend on the caller sorting ascending, even though
    // `getCandles` does.
    expect(fiftyTwoWeekRange([bar(10, 95, 130), bar(340, 90, 110)], NOW)).toEqual({
      high: 130,
      low: 90,
    })
  })
})
