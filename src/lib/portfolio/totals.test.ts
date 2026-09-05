import { describe, expect, it } from 'vitest'

import {
  DONUT_SLICE_LIMIT,
  recomputeHolding,
  recomputeSummary,
  sortHoldings,
  toDonutSlices,
  type LiveHolding,
} from '@/lib/portfolio/totals'
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

// ── F30: one holdings row, and the footer it has to agree with ──────────────
//
// The fixture is hand-computed in the comments so an assertion never restates
// the expression the function uses — the same discipline `10-orders.sql` keeps.
//
//   INFY      5 @ avg 1400, anchor 1500, prev close 1450
//     invested 7000   value 7500   unrealised +500   day +250   +3.45%
//   RELIANCE 10 @ avg 2400, anchor 2380, prev close 2400
//     invested 24000  value 23800  unrealised −200   day −200   −0.83%
//   NOQUOTE   7 @ avg  150, no quote at all
//     invested 1050   value —      unrealised —      day —      —
//
//   priced value 31300   priced invested 31000   overall +300   day +50

const F30_HOLDINGS: HoldingRow[] = [
  holding({
    symbol: 'INFY',
    quantity: 5,
    averagePrice: 1400,
    invested: 7000,
    ltp: null,
    prevClose: null,
  }),
  holding({
    symbol: 'RELIANCE',
    quantity: 10,
    averagePrice: 2400,
    invested: 24_000,
    ltp: null,
    prevClose: null,
  }),
  holding({
    symbol: 'NOQUOTE',
    quantity: 7,
    averagePrice: 150,
    invested: 1050,
    ltp: null,
    prevClose: null,
    provider: null,
    fetchedAt: null,
  }),
]

const F30_ANCHORS = { INFY: 1500, RELIANCE: 2380 }
const F30_PREV_CLOSES = { INFY: 1450, RELIANCE: 2400 }

function liveRows(): LiveHolding[] {
  return F30_HOLDINGS.map((row) => recomputeHolding(row, F30_ANCHORS, F30_PREV_CLOSES))
}

describe('restating one holdings row', () => {
  it('values at the live anchor', () => {
    const [infy] = liveRows()

    expect(infy?.ltp).toBe(1500)
    expect(infy?.marketValue).toBe(7500)
    expect(infy?.unrealisedPnl).toBe(500)
  })

  it('falls back to the server figure for a symbol that has not ticked', () => {
    const row = recomputeHolding(holding({ ltp: 100, prevClose: 80 }), {})

    expect(row.ltp).toBe(100)
    expect(row.marketValue).toBe(1000)
  })

  it('measures unrealised against the average and the day against the previous close', () => {
    const [, reliance] = liveRows()

    // Same figure by coincidence here (avg equals prev close), so the bases are
    // separated by a case where they differ.
    const row = recomputeHolding(
      holding({ quantity: 10, averagePrice: 90, ltp: null }),
      { RELIANCE: 100 },
      { RELIANCE: 95 }
    )

    expect(reliance?.unrealisedPnl).toBe(-200)
    expect(row.unrealisedPnl).toBe(100) // 10 × (100 − 90)
    expect(row.dayPnl).toBe(50) // 10 × (100 − 95)
  })

  it('reports the day change as the stock’s own move, not the holding’s', () => {
    const [infy] = liveRows()

    // 50 / 1450 — a per-share percentage, independent of the 5 shares held.
    expect(infy?.dayChangePct).toBeCloseTo(3.448_275_86, 6)
  })

  it('nulls every derived figure for an unpriced holding rather than zeroing it', () => {
    const noquote = liveRows()[2]

    expect(noquote?.ltp).toBeNull()
    expect(noquote?.marketValue).toBeNull()
    expect(noquote?.unrealisedPnl).toBeNull()
    expect(noquote?.dayPnl).toBeNull()
    expect(noquote?.dayChangePct).toBeNull()
    // Cost basis is known even when the price is not.
    expect(noquote?.invested).toBe(1050)
  })

  it('nulls the day figures when there is no previous close', () => {
    const row = recomputeHolding(holding({ ltp: null, prevClose: null }), { RELIANCE: 100 })

    expect(row.marketValue).toBe(1000)
    expect(row.dayPnl).toBeNull()
    expect(row.dayChangePct).toBeNull()
  })
})

// The verify item this file exists for: the footer must be the rows. Both sides
// are driven from the same anchors — one `useHoldingPrices` call feeds both in
// the component — so this asserts the arithmetic agrees, and the browser check
// confirms they move on the same tick.
describe('the footer totals equal the sum of the rows', () => {
  const rows = liveRows()
  const footer = recomputeSummary(
    summary({ availableCash: 100_000, invested: 32_050, holdingCount: 3 }),
    F30_HOLDINGS,
    F30_ANCHORS,
    F30_PREV_CLOSES
  )

  function sum(pick: (row: LiveHolding) => number | null): number {
    return rows.reduce((total, row) => total + (pick(row) ?? 0), 0)
  }

  it('current value', () => {
    expect(footer.marketValue).toBe(31_300)
    expect(sum((row) => row.marketValue)).toBe(footer.marketValue)
  })

  it('overall P&L', () => {
    expect(footer.overallPnl).toBe(300)
    expect(sum((row) => row.unrealisedPnl)).toBe(footer.overallPnl)
  })

  it('day P&L', () => {
    expect(footer.dayPnl).toBe(50)
    expect(sum((row) => row.dayPnl)).toBe(footer.dayPnl)
  })

  it('counts the unpriced holding rather than valuing it', () => {
    expect(footer.unpricedCount).toBe(1)
    // Invested spans all three; the valuation spans two. The count is what
    // makes that difference visible instead of reading as a loss.
    expect(footer.invested).toBe(32_050)
  })
})

describe('ordering the holdings table', () => {
  it('sorts by symbol in both directions', () => {
    expect(sortHoldings(liveRows(), 'symbol', 'asc').map((row) => row.symbol)).toEqual([
      'INFY',
      'NOQUOTE',
      'RELIANCE',
    ])
    expect(sortHoldings(liveRows(), 'symbol', 'desc').map((row) => row.symbol)).toEqual([
      'RELIANCE',
      'NOQUOTE',
      'INFY',
    ])
  })

  it('sorts by a live column on the anchor', () => {
    expect(sortHoldings(liveRows(), 'marketValue', 'desc').map((row) => row.symbol)).toEqual([
      'RELIANCE',
      'INFY',
      'NOQUOTE',
    ])
  })

  it('puts the unpriced holding last in both directions, never first', () => {
    // Ascending P&L would otherwise lead with NOQUOTE, reading as the worst
    // performer in the portfolio when nothing at all is known about it.
    expect(sortHoldings(liveRows(), 'unrealisedPnl', 'asc').map((row) => row.symbol)).toEqual([
      'RELIANCE',
      'INFY',
      'NOQUOTE',
    ])
    expect(sortHoldings(liveRows(), 'unrealisedPnl', 'desc').map((row) => row.symbol)).toEqual([
      'INFY',
      'RELIANCE',
      'NOQUOTE',
    ])
  })

  it('breaks ties on symbol so the order is total', () => {
    const tied = [
      recomputeHolding(holding({ symbol: 'ZZZ', quantity: 1, averagePrice: 10 }), { ZZZ: 100 }),
      recomputeHolding(holding({ symbol: 'AAA', quantity: 1, averagePrice: 10 }), { AAA: 100 }),
    ]

    expect(sortHoldings(tied, 'marketValue', 'desc').map((row) => row.symbol)).toEqual([
      'AAA',
      'ZZZ',
    ])
  })

  it('does not mutate the array it was given', () => {
    const rows = liveRows()
    sortHoldings(rows, 'marketValue', 'desc')

    expect(rows.map((row) => row.symbol)).toEqual(['INFY', 'RELIANCE', 'NOQUOTE'])
  })
})
