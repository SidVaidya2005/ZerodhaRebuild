import { describe, expect, it } from 'vitest'

import { NO_EXPOSURE, estimateMargin, shortCollateralRequirement } from './margin'

/**
 * Every figure here is hand-computed in the comment above it from the §3 rate
 * table, never restated as the expression the function uses — and every one is
 * a number `10-orders.sql` or `08-margin.sql` already asserts against the
 * engine, so the two sides are anchored to the same arithmetic rather than to
 * each other. `pnpm test:parity` is what proves they agree in general.
 */

describe('shortCollateralRequirement', () => {
  // 100 @ 100.00, buffered to 120.00
  //   notional 100 × 120.00 = 12000.00
  //   closing charges, MIS BUY 100 @ 120.00 — turnover 12000.00
  //     brokerage min(3.60, 20) = 3.60
  //     exchange  0.0000307 × 12000 = 0.3684 → 0.37
  //     sebi      0.000001  × 12000 = 0.012  → 0.01
  //     stamp     0.00003   × 12000 = 0.36
  //     gst 0.18 × (3.60 + 0.3684 + 0.012) = 0.716472 → 0.72
  //     = 5.06
  //   = 12005.06
  it('holds 120% of notional plus the closing charges at the buffered price', () => {
    expect(shortCollateralRequirement(100, 100)).toBe(12005.06)
  })

  // Exactly half of the above, which is what makes a partial cover release
  // exactly its share rather than drifting.
  it('halves for half the quantity', () => {
    expect(shortCollateralRequirement(50, 100)).toBe(6002.53)
  })

  it('takes the magnitude, so a negative net quantity works', () => {
    expect(shortCollateralRequirement(-50, 100)).toBe(shortCollateralRequirement(50, 100))
  })

  // The falsification §6 states: the net average under-collateralises. Covering
  // a genuine 20% move costs 12005.06, and the net basis funds only 11997.86.
  it('is short by 7.20 when computed from a charges-net average instead', () => {
    expect(shortCollateralRequirement(100, 99.94)).toBe(11997.86)
    expect(
      shortCollateralRequirement(100, 100) - shortCollateralRequirement(100, 99.94)
    ).toBeCloseTo(7.2, 2)
  })
})

describe('estimateMargin', () => {
  // CNC BUY 10 @ 100.00 — turnover 1000.00
  //   stt 1.00, exchange 0.03, sebi 0.00, stamp 0.15, gst 0.01 = 1.19
  it('reserves notional plus charges for a delivery buy', () => {
    const margin = estimateMargin({
      side: 'BUY',
      product: 'CNC',
      quantity: 10,
      price: 100,
      exposure: NO_EXPOSURE,
    })

    expect(margin).toMatchObject({
      required: 1001.19,
      openingQuantity: 10,
      closingQuantity: 0,
      charges: 1.19,
      collateral: 0,
    })
  })

  // MIS SELL 100 @ 100.00 — turnover 10000.00
  //   brokerage 3.00, stt 2.50, exchange 0.31, sebi 0.01, gst 0.60 = 6.42
  //   collateral 12005.06, so the reservation is 12011.48
  it('reserves collateral plus charges for a short entry, not notional', () => {
    const margin = estimateMargin({
      side: 'SELL',
      product: 'MIS',
      quantity: 100,
      price: 100,
      exposure: NO_EXPOSURE,
    })

    expect(margin.required).toBe(12011.48)
    expect(margin.collateral).toBe(12005.06)
    // The figure the naive version would have shown, for contrast.
    expect(margin.required).not.toBe(10006.42)
  })

  // The case the whole design exists for. MIS BUY 100 @ 100.00 — turnover
  // 10000.00: brokerage 3.00, exchange 0.31, sebi 0.01, stamp 0.30, gst 0.60
  //   = 4.22 ... covering, so no notional is reserved at all.
  it('reserves charges only when a buy fully covers an open short', () => {
    const margin = estimateMargin({
      side: 'BUY',
      product: 'MIS',
      quantity: 100,
      price: 100,
      exposure: { holding: 0, netQuantity: -100 },
    })

    expect(margin.openingQuantity).toBe(0)
    expect(margin.closingQuantity).toBe(100)
    expect(margin.required).toBe(margin.charges)
    expect(margin.required).toBeLessThan(10)
  })

  it('reserves only the opening half when a buy covers a short and goes long', () => {
    const margin = estimateMargin({
      side: 'BUY',
      product: 'MIS',
      quantity: 10,
      price: 100,
      exposure: { holding: 0, netQuantity: -4 },
    })

    expect(margin.closingQuantity).toBe(4)
    expect(margin.openingQuantity).toBe(6)
    expect(margin.required).toBe(600 + margin.charges)
  })

  it('reserves only the shorting excess when a sell crosses zero', () => {
    const margin = estimateMargin({
      side: 'SELL',
      product: 'MIS',
      quantity: 10,
      price: 100,
      exposure: { holding: 0, netQuantity: 4 },
    })

    expect(margin.closingQuantity).toBe(4)
    expect(margin.openingQuantity).toBe(6)
    expect(margin.collateral).toBe(shortCollateralRequirement(6, 100))
  })

  it('reserves nothing for an MIS sell fully covered by a long', () => {
    const margin = estimateMargin({
      side: 'SELL',
      product: 'MIS',
      quantity: 10,
      price: 100,
      exposure: { holding: 0, netQuantity: 10 },
    })

    expect(margin.required).toBe(0)
    expect(margin.openingQuantity).toBe(0)
  })

  it('reserves nothing for a delivery sell — that is a NO_HOLDING question', () => {
    const margin = estimateMargin({
      side: 'SELL',
      product: 'CNC',
      quantity: 10,
      price: 100,
      exposure: { holding: 30, netQuantity: 0 },
    })

    expect(margin.required).toBe(0)
    expect(margin.closingQuantity).toBe(10)
  })

  // A delivery order must never net against the MIS book, or a user holding an
  // intraday short would see a CNC buy quoted as if it covered it.
  it('ignores an MIS position when the order is CNC', () => {
    const margin = estimateMargin({
      side: 'BUY',
      product: 'CNC',
      quantity: 10,
      price: 100,
      exposure: { holding: 0, netQuantity: -100 },
    })

    expect(margin.openingQuantity).toBe(10)
    expect(margin.required).toBe(1001.19)
  })
})
