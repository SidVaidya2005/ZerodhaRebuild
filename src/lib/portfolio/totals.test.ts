import { describe, expect, it } from 'vitest'

import { DONUT_SLICE_LIMIT, recomputeSummary, toDonutSlices } from '@/lib/portfolio/totals'
import type { HoldingRow, PortfolioSummary } from '@/lib/portfolio/types'

function holding(overrides: Partial<HoldingRow> = {}): HoldingRow {
  return {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Limited',
    exchange: 'NSE',
    quantity: 10,
    averagePrice: 90,
    invested: 900,
    ltp: 100,
    prevClose: 80,
    marketValue: 1000,
    unrealisedPnl: 100,
    dayPnl: 200,
    provider: 'SIMULATOR',
    providerTs: null,
    fetchedAt: '2026-08-22T09:00:00.000Z',
    ...overrides,
  }
}

function summary(overrides: Partial<PortfolioSummary> = {}): PortfolioSummary {
  return {
    availableCash: 100_000,
    invested: 900,
    marketValue: 1000,
    portfolioValue: 101_000,
    overallPnl: 100,
    dayPnl: 200,
    holdingCount: 1,
    unpricedCount: 0,
    ...overrides,
  }
}

// The helpers now take flat maps of anchors, so an interpolated value cannot
// reach them even by mistake — there is no `ltp` field in scope to pass. The
// selector that builds these maps is what enforces it, and
// `use-holding-prices.ts` reads `anchor` there.

describe('restating the tiles against live anchors', () => {
  it('values against the live anchor when one has arrived', () => {
    const result = recomputeSummary(summary(), [holding()], { RELIANCE: 120 })

    expect(result.marketValue).toBe(1200)
    expect(result.portfolioValue).toBe(101_200)
    expect(result.overallPnl).toBe(300)
  })

  it('falls back to the server figure for a symbol that has not ticked', () => {
    const result = recomputeSummary(summary(), [holding()], {})
    expect(result.marketValue).toBe(1000)
    expect(result.portfolioValue).toBe(101_000)
  })

  it('counts an unpriced holding rather than valuing it at zero', () => {
    const rows = [
      holding(),
      holding({ symbol: 'NOQUOTE', quantity: 5, averagePrice: 30, ltp: null }),
    ]
    const result = recomputeSummary(summary({ holdingCount: 2 }), rows, {})

    expect(result.unpricedCount).toBe(1)
    expect(result.marketValue).toBe(1000)
    // 1000 market value against the 900 invested of the *priced* holding only.
    // Folding in the unpriced 150 would report it as a total loss.
    expect(result.overallPnl).toBe(100)
  })

  it('measures the day against the previous close, not the average price', () => {
    // anchor 120, prev_close 80, average 90. The day's move is 40 a share.
    const result = recomputeSummary(summary(), [holding()], { RELIANCE: 120 }, { RELIANCE: 80 })
    expect(result.dayPnl).toBe(400)
    // Against average_price it would be 300 — that is unrealised P&L, and it is
    // a different question (trading-contract.md §9).
    expect(result.overallPnl).toBe(300)
  })

  it('omits a holding with no previous close from the day figure without zeroing it', () => {
    const rows = [holding({ prevClose: null })]
    const result = recomputeSummary(summary(), rows, { RELIANCE: 120 }, { RELIANCE: null })

    expect(result.dayPnl).toBe(0)
    // It is still valued — only the day comparison is unavailable.
    expect(result.marketValue).toBe(1200)
  })

  it('keeps cash inside portfolio value', () => {
    const result = recomputeSummary(summary({ availableCash: 5_000 }), [holding()], {})
    expect(result.portfolioValue).toBe(6_000)
  })

  it('rounds to paise rather than accumulating float dust', () => {
    const rows = [holding({ quantity: 3, averagePrice: 10.1, ltp: 20.2 })]
    const result = recomputeSummary(summary({ availableCash: 0.1 }), rows, {})
    expect(result.marketValue).toBe(60.6)
    expect(result.portfolioValue).toBe(60.7)
  })
})

describe('the donut', () => {
  const many = (count: number, value: number) =>
    Array.from({ length: count }, (_, i) =>
      holding({ symbol: `SYM${i}`, quantity: 1, averagePrice: 1, ltp: value - i })
    )

  it('ranks by market value, not by quantity', () => {
    const rows = [
      holding({ symbol: 'PENNY', quantity: 1000, averagePrice: 1, ltp: 12 }),
      holding({ symbol: 'BLUECHIP', quantity: 10, averagePrice: 100, ltp: 4000 }),
    ]
    expect(toDonutSlices(rows).map((slice) => slice.name)).toEqual(['BLUECHIP', 'PENNY'])
  })

  it('draws every holding when there are ten or fewer, with no Others arc', () => {
    const slices = toDonutSlices(many(DONUT_SLICE_LIMIT, 100))
    expect(slices).toHaveLength(DONUT_SLICE_LIMIT)
    expect(slices.some((slice) => slice.isOthers)).toBe(false)
  })

  it('buckets the eleventh into Others, equal to what it left out', () => {
    // Values 100, 99 … 91 for the top ten, and 90 for the eleventh.
    const slices = toDonutSlices(many(11, 100))

    expect(slices).toHaveLength(DONUT_SLICE_LIMIT + 1)
    expect(slices.at(-1)).toEqual({ name: 'Others', value: 90, isOthers: true })
    expect(slices.slice(0, DONUT_SLICE_LIMIT).map((slice) => slice.name)).not.toContain('SYM10')
  })

  it('sums the whole tail into Others, not just the next one', () => {
    const slices = toDonutSlices(many(13, 100))
    // Thirteen values, 100 down to 88. The top ten take 100…91, so the tail is
    // 90 + 89 + 88.
    expect(slices.at(-1)?.value).toBe(267)
  })

  it('uses the live anchor for ranking once prices arrive', () => {
    const rows = [
      holding({ symbol: 'A', quantity: 1, averagePrice: 1, ltp: 100 }),
      holding({ symbol: 'B', quantity: 1, averagePrice: 1, ltp: 90 }),
    ]
    // B overtakes A on the tick. Ranking must follow the anchor, not the render.
    const slices = toDonutSlices(rows, { B: 500 })
    expect(slices.map((slice) => slice.name)).toEqual(['B', 'A'])
    expect(slices[0]?.value).toBe(500)
  })

  it('excludes an unpriced holding rather than drawing an invisible zero arc', () => {
    const rows = [holding(), holding({ symbol: 'NOQUOTE', ltp: null })]
    expect(toDonutSlices(rows).map((slice) => slice.name)).toEqual(['RELIANCE'])
  })

  it('is empty for a portfolio with nothing in it', () => {
    expect(toDonutSlices([])).toEqual([])
  })
})
