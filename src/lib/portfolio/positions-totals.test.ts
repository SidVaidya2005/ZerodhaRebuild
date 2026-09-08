import { describe, expect, it } from 'vitest'

import {
  comparePositions,
  recomputePosition,
  recomputePositionsSummary,
  sortPositions,
} from '@/lib/portfolio/positions-totals'
import type { PositionRow, PositionsSummary } from '@/lib/portfolio/types'

/** A long: 50 INFY at ₹1,420, last traded ₹1,455. */
function long(overrides: Partial<PositionRow> = {}): PositionRow {
  return {
    symbol: 'INFY',
    name: 'Infosys Limited',
    exchange: 'NSE',
    netQuantity: 50,
    averagePrice: 1420,
    realisedPnl: 0,
    blockedMargin: 0,
    ltp: 1455,
    unrealisedPnl: 1750,
    provider: 'SIMULATOR',
    providerTs: null,
    fetchedAt: '2026-09-08T09:00:00.000Z',
    ...overrides,
  }
}

/**
 * A short: 100 TCS at a net ₹99.70, last traded ₹90.
 *
 * The figures are §6's worked example — a short at ₹100 with ₹30 of entry
 * charges averages ₹99.70 — so the P&L asserted below is the contract's own
 * arithmetic rather than a number invented for the test.
 */
function short(overrides: Partial<PositionRow> = {}): PositionRow {
  return {
    symbol: 'TCS',
    name: 'Tata Consultancy Services Limited',
    exchange: 'NSE',
    netQuantity: -100,
    averagePrice: 99.7,
    realisedPnl: 0,
    blockedMargin: 12_240,
    ltp: 90,
    unrealisedPnl: 970,
    provider: 'SIMULATOR',
    providerTs: null,
    fetchedAt: '2026-09-08T09:00:00.000Z',
    ...overrides,
  }
}

function summary(overrides: Partial<PositionsSummary> = {}): PositionsSummary {
  return {
    unrealisedPnl: 0,
    realisedPnl: 0,
    blockedMargin: 0,
    positionCount: 0,
    unpricedCount: 0,
    ...overrides,
  }
}

describe('unrealised P&L, one signed expression for both directions', () => {
  it('values a long against the live anchor', () => {
    // 50 × (1500 − 1420) = 4000, by hand.
    expect(recomputePosition(long(), { INFY: 1500 }).unrealisedPnl).toBe(4000)
  })

  it('values a short as profit when the price falls', () => {
    // −100 × (90 − 99.70) = +970, which is §9's (average − exit) × quantity.
    expect(recomputePosition(short(), { TCS: 90 }).unrealisedPnl).toBe(970)
  })

  it('moves a short opposite to price', () => {
    const falling = recomputePosition(short(), { TCS: 90 }).unrealisedPnl
    const rising = recomputePosition(short(), { TCS: 110 }).unrealisedPnl

    // −100 × (110 − 99.70) = −1030: the same move that profits a long loses here.
    expect(rising).toBe(-1030)
    expect(falling).toBeGreaterThan(0)
    expect(rising).toBeLessThan(0)
  })

  it('moves a long the same way as price, from the identical formula', () => {
    const up = recomputePosition(long(), { INFY: 1500 }).unrealisedPnl
    const down = recomputePosition(long(), { INFY: 1400 }).unrealisedPnl

    expect(up).toBeGreaterThan(0)
    expect(down).toBe(-1000)
  })

  it('falls back to the server figure when no anchor has arrived', () => {
    // The row keeps what Postgres computed rather than dropping to null the
    // moment the page renders ahead of the first tick.
    expect(recomputePosition(long(), {}).ltp).toBe(1455)
  })
})

describe('an unpriced position', () => {
  it('renders no valuation rather than a zero one', () => {
    const result = recomputePosition(long({ ltp: null, unrealisedPnl: null }), {})

    // Null, never 0: a zero is a claim that the position is exactly flat.
    expect(result.ltp).toBeNull()
    expect(result.unrealisedPnl).toBeNull()
  })

  it('is counted in the footer instead of valued', () => {
    const rows = [long(), long({ symbol: 'WIPRO', ltp: null, unrealisedPnl: null })]
    const footer = recomputePositionsSummary(summary(), rows, { INFY: 1455 })

    expect(footer.unpricedCount).toBe(1)
    expect(footer.positionCount).toBe(2)
    // Only the priced row contributes: 50 × (1455 − 1420) = 1750.
    expect(footer.unrealisedPnl).toBe(1750)
  })

  it('sorts last in both directions', () => {
    const priced = long()
    const unpriced = long({ symbol: 'WIPRO', ltp: null, unrealisedPnl: null })

    // Ranked as worst-performing in an ascending sort would be a claim about a
    // position nothing is known about.
    expect(comparePositions(unpriced, priced, 'unrealisedPnl', 'asc')).toBeGreaterThan(0)
    expect(comparePositions(unpriced, priced, 'unrealisedPnl', 'desc')).toBeGreaterThan(0)
  })
})

describe('the footer is arithmetically the rows above it', () => {
  it('totals equal the sum of the restated rows', () => {
    const rows = [long(), short()]
    const anchors = { INFY: 1500, TCS: 110 }

    const restated = rows.map((row) => recomputePosition(row, anchors))
    const footer = recomputePositionsSummary(summary(), rows, anchors)

    // Both sides are also pinned to hand figures, so the two agreeing on a
    // shared bug cannot pass: 4000 + (−1030) = 2970.
    const summed = restated.reduce((total, row) => total + (row.unrealisedPnl ?? 0), 0)
    expect(summed).toBe(2970)
    expect(footer.unrealisedPnl).toBe(2970)
  })

  it('sums realised P&L and collateral, which do not move with price', () => {
    const rows = [long({ realisedPnl: 120.5 }), short({ realisedPnl: -40.25 })]
    const footer = recomputePositionsSummary(summary(), rows, { INFY: 1455, TCS: 90 })

    expect(footer.realisedPnl).toBe(80.25)
    expect(footer.blockedMargin).toBe(12_240)
  })

  it('reports a long as holding no collateral', () => {
    // §6: collateral is held against a short obligation only.
    expect(recomputePositionsSummary(summary(), [long()], {}).blockedMargin).toBe(0)
  })
})

describe('sorting', () => {
  it('breaks ties on symbol so the order is total', () => {
    const a = long({ symbol: 'AAA', unrealisedPnl: 100 })
    const b = long({ symbol: 'BBB', unrealisedPnl: 100 })

    const sorted = sortPositions([b, a], 'unrealisedPnl', 'desc')
    expect(sorted.map((row) => row.symbol)).toEqual(['AAA', 'BBB'])
  })

  it('orders shorts below longs by quantity, sign included', () => {
    const sorted = sortPositions([short(), long()], 'netQuantity', 'asc')
    expect(sorted.map((row) => row.symbol)).toEqual(['TCS', 'INFY'])
  })
})
