import { describe, expect, it } from 'vitest'

import { SIMULATOR_MAX_MOVE_PCT } from '@/lib/constants'

import { buildSeries, type BuildSeriesParams } from './simulator'

const DAY = 86_400_000

/** Slot times are only ever compared, never interpreted, so any spacing serves. */
function slots(count: number, step = DAY): number[] {
  return Array.from({ length: count }, (_, i) => Date.UTC(2026, 0, 5) + i * step)
}

function params(overrides: Partial<BuildSeriesParams> = {}): BuildSeriesParams {
  return {
    symbol: 'RELIANCE',
    interval: 'ONE_DAY',
    slots: slots(30),
    startClose: null,
    endClose: 1316,
    tickSize: 0.05,
    ...overrides,
  }
}

describe('determinism', () => {
  it('returns byte-identical bars for the same input', () => {
    expect(buildSeries(params())).toEqual(buildSeries(params()))
  })

  it('gives two symbols different series from the same anchor', () => {
    const reliance = buildSeries(params({ symbol: 'RELIANCE' }))
    const infy = buildSeries(params({ symbol: 'INFY' }))
    expect(reliance).not.toEqual(infy)
    // Both still end on the anchor — it is the shape that differs, not the level.
    expect(reliance.at(-1)!.close).toBe(infy.at(-1)!.close)
  })

  it('gives one symbol different series at different intervals', () => {
    const daily = buildSeries(params({ interval: 'ONE_DAY' }))
    const intraday = buildSeries(params({ interval: 'FIVE_MIN' }))
    expect(daily).not.toEqual(intraday)
  })

  it('leaves an earlier bar untouched when the window is extended', () => {
    // The slots a bar occupies are what identify it. Extending the window must
    // not disturb the bars already in it — this is the property the chart's
    // stability rests on, so it is asserted rather than assumed.
    const base = buildSeries(params({ slots: slots(30), endClose: null, startClose: 1000 }))
    const longer = buildSeries(params({ slots: slots(40), endClose: null, startClose: 1000 }))
    expect(longer.slice(0, 30)).toEqual(base)
  })
})

describe('anchoring', () => {
  it('ends exactly on the closing anchor', () => {
    expect(buildSeries(params({ endClose: 1316 })).at(-1)!.close).toBe(1316)
  })

  it('ends on the anchor from a forward walk too, not only a cold start', () => {
    const series = buildSeries(params({ startClose: 900, endClose: 1316 }))
    expect(series.at(-1)!.close).toBe(1316)
    expect(series[0]!.open).toBe(900)
  })

  it('absorbs the drift across the batch rather than gapping the last bar', () => {
    // A hard snap would leave the final bar jumping from wherever the free walk
    // drifted to. Spread as a bridge, the last step is the size of any other.
    const series = buildSeries({
      ...params({ startClose: 900, endClose: 1316, slots: slots(60) }),
    })
    const steps = series.map((bar) => Math.abs(bar.close / bar.open - 1))
    const last = steps.at(-1)!
    const median = [...steps].sort((a, b) => a - b)[Math.floor(steps.length / 2)]!
    expect(last).toBeLessThan(median * 12)
  })

  it('scales a penny stock and a four-figure stock to their own anchors', () => {
    const mrf = buildSeries(params({ symbol: 'MRF', endClose: 132665 }))
    const yesbank = buildSeries(params({ symbol: 'YESBANK', endClose: 22.8, tickSize: 0.05 }))
    expect(Math.min(...mrf.map((b) => b.low))).toBeGreaterThan(10_000)
    expect(Math.max(...yesbank.map((b) => b.high))).toBeLessThan(100)
  })
})

describe('a whole series or nothing', () => {
  it('returns nothing when there is no anchor at either end', () => {
    expect(buildSeries(params({ startClose: null, endClose: null }))).toEqual([])
  })

  it('returns nothing for an empty slot list', () => {
    expect(buildSeries(params({ slots: [] }))).toEqual([])
  })

  it('produces exactly one bar per slot and never invents one', () => {
    const given = slots(17)
    const series = buildSeries(params({ slots: given }))
    expect(series.map((bar) => bar.ts)).toEqual(given)
  })
})

describe('bar shape', () => {
  const cases: Array<BuildSeriesParams['interval']> = ['FIVE_MIN', 'THIRTY_MIN', 'ONE_DAY']

  it.each(cases)('keeps OHLC coherent at %s', (interval) => {
    for (const bar of buildSeries(params({ interval, slots: slots(120) }))) {
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close))
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close))
      expect(bar.low).toBeGreaterThan(0)
    }
  })

  it('puts every price on the tick grid', () => {
    for (const bar of buildSeries(params({ tickSize: 0.05 }))) {
      for (const price of [bar.open, bar.high, bar.low, bar.close]) {
        expect(Math.round((price / 0.05) * 1e6) / 1e6).toBeCloseTo(Math.round(price / 0.05), 6)
      }
    }
  })

  it('never gaps a single bar past the circuit band', () => {
    // NSE caps a session's move; a daily bar that leapt further would be a
    // price the exchange would not have printed.
    const series = buildSeries(
      params({ interval: 'ONE_DAY', slots: slots(250), endClose: null, startClose: 1000 })
    )
    for (let i = 1; i < series.length; i += 1) {
      const move = Math.abs(series[i]!.close / series[i - 1]!.close - 1)
      expect(move).toBeLessThanOrEqual(SIMULATOR_MAX_MOVE_PCT + 1e-9)
    }
  })

  it('moves a daily bar more than a five-minute one', () => {
    // A walk's dispersion grows with the square root of elapsed time. Reusing
    // the per-tick figure unscaled would draw a year of dailies as a flat line.
    const spread = (interval: BuildSeriesParams['interval']) => {
      const series = buildSeries(
        params({ interval, slots: slots(200), startClose: 1000, endClose: null })
      )
      const closes = series.map((b) => b.close)
      return Math.max(...closes) / Math.min(...closes)
    }
    expect(spread('ONE_DAY')).toBeGreaterThan(spread('FIVE_MIN'))
  })

  it('reports a volume on every bar', () => {
    for (const bar of buildSeries(params())) {
      expect(bar.volume).toBeGreaterThan(0)
    }
  })
})
