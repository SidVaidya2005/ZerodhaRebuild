import { describe, expect, it } from 'vitest'

import { fromIstDate } from './slots'
import type { ProviderCandle } from './types'
import { windowSeries } from './window'

function bar(date: string, minutes: number): ProviderCandle {
  const ts = fromIstDate(date, minutes).getTime()
  return { ts, open: 100, high: 101, low: 99, close: 100, volume: 1000 }
}

/** A session's worth of five-minute opens, thinned to keep the fixtures legible. */
function session(date: string): ProviderCandle[] {
  return [bar(date, 9 * 60 + 15), bar(date, 12 * 60), bar(date, 15 * 60 + 25)]
}

const istDayOf = (candle: ProviderCandle) =>
  new Date(candle.ts + 330 * 60_000).toISOString().slice(0, 10)

describe('daily', () => {
  it('takes the last `days` bars', () => {
    const daily = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08'].map((d) => bar(d, 0))
    expect(windowSeries(daily, 'ONE_DAY', 2).map(istDayOf)).toEqual(['2026-01-07', '2026-01-08'])
  })

  it('returns the whole series when it is shorter than the window', () => {
    const daily = [bar('2026-01-07', 0), bar('2026-01-08', 0)]
    expect(windowSeries(daily, 'ONE_DAY', 250)).toHaveLength(2)
  })
})

describe('intraday', () => {
  it('keeps only the last session for a 1D window', () => {
    // **The bug.** `readStored` has no date bound and `prune_candles` deletes
    // only the day before, so on day D+1 the table still holds day D's
    // five-minute bars — and the chart labelled "1D" drew both sessions.
    const stored = [...session('2026-01-12'), ...session('2026-01-13')]
    const windowed = windowSeries(stored, 'FIVE_MIN', 1)

    expect(new Set(windowed.map(istDayOf))).toEqual(new Set(['2026-01-13']))
    expect(windowed).toHaveLength(3)
  })

  it('keeps five sessions for a 1W window', () => {
    const stored = [
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-12',
    ].flatMap(session)

    const windowed = windowSeries(stored, 'THIRTY_MIN', 5)
    expect(new Set(windowed.map(istDayOf))).toEqual(
      new Set(['2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-12'])
    )
  })

  it('resolves 1D to the last session present, not to today', () => {
    // A date present in the series is a session, because `candleSlots` only
    // generates bars on trading days. So "1D on a Sunday" is Friday for free,
    // with no holiday set threaded through.
    const friday = session('2026-01-09')
    expect(new Set(windowSeries(friday, 'FIVE_MIN', 1).map(istDayOf))).toEqual(
      new Set(['2026-01-09'])
    )
  })

  it('returns the whole series when it holds fewer sessions than the window', () => {
    const stored = session('2026-01-13')
    expect(windowSeries(stored, 'FIVE_MIN', 5)).toHaveLength(3)
  })

  it('keeps a session that straddles no IST midnight intact', () => {
    // 09:15 IST is 03:45 UTC the same day and 15:25 IST is 09:55 UTC — both land
    // on one IST date, which is the whole reason the trim compares IST dates
    // rather than UTC ones.
    const stored = session('2026-01-13')
    expect(new Set(stored.map(istDayOf))).toEqual(new Set(['2026-01-13']))
    expect(windowSeries(stored, 'FIVE_MIN', 1)).toHaveLength(3)
  })

  it('does not mutate the series it was given', () => {
    const stored = [...session('2026-01-12'), ...session('2026-01-13')]
    windowSeries(stored, 'FIVE_MIN', 1)
    expect(stored).toHaveLength(6)
  })
})
