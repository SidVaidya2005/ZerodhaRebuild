import { describe, expect, it } from 'vitest'

import { BROKERAGE_MIS_CAP, BROKERAGE_MIS_RATE, DP_CHARGE_BASE, GST_RATE } from '@/lib/constants'

import { estimateCharges, roundToPaise } from './charges'

/** The turnover at which 0.03% of turnover equals the flat cap. */
const CAP_BOUNDARY = BROKERAGE_MIS_CAP / BROKERAGE_MIS_RATE

describe('roundToPaise', () => {
  it('rounds half-up at the midpoint despite binary floating point', () => {
    expect(roundToPaise(1.005)).toBe(1.01)
    expect(roundToPaise(2.675)).toBe(2.68)
    expect(roundToPaise(0.285)).toBe(0.29)
  })

  it('leaves exact paise alone', () => {
    expect(roundToPaise(13)).toBe(13)
    expect(roundToPaise(50.0)).toBe(50)
  })
})

describe('the worked example on /pricing — a 50,000 delivery round trip', () => {
  const buy = estimateCharges({ side: 'BUY', product: 'CNC', quantity: 500, price: 100 })
  const sell = estimateCharges({ side: 'SELL', product: 'CNC', quantity: 500, price: 100 })

  it('charges the buy leg exactly', () => {
    expect(buy.turnover).toBe(50000)
    expect(buy.breakdown).toEqual({
      brokerage: 0,
      stt: 50,
      exchangeTxn: 1.54,
      sebiTurnover: 0.05,
      stampDuty: 7.5,
      dpCharge: 0,
      gst: 0.29,
    })
    expect(buy.total).toBe(59.38)
  })

  it('charges the sell leg exactly, including the DP charge', () => {
    expect(sell.breakdown).toEqual({
      brokerage: 0,
      stt: 50,
      exchangeTxn: 1.54,
      sebiTurnover: 0.05,
      stampDuty: 0,
      dpCharge: 13,
      gst: 2.63,
    })
    expect(sell.total).toBe(67.22)
  })

  it('costs 126.60 for the round trip', () => {
    expect(roundToPaise(buy.total + sell.total)).toBe(126.6)
  })
})

describe('the DP charge', () => {
  it('is the base, not the figure people recognise', () => {
    const sell = estimateCharges({ side: 'SELL', product: 'CNC', quantity: 1, price: 1000 })
    expect(sell.breakdown.dpCharge).toBe(13)
  })

  it('carries its own GST inside the single gst key', () => {
    const withDp = estimateCharges({ side: 'SELL', product: 'CNC', quantity: 1, price: 1000 })
    const withoutDp = estimateCharges({ side: 'BUY', product: 'CNC', quantity: 1, price: 1000 })
    // The difference between the two gst figures is the DP base's own GST.
    expect(roundToPaise(withDp.breakdown.gst - withoutDp.breakdown.gst)).toBe(
      roundToPaise(DP_CHARGE_BASE * GST_RATE)
    )
    // …and the base plus that GST is the 15.34 on a real contract note.
    expect(roundToPaise(DP_CHARGE_BASE * (1 + GST_RATE))).toBe(15.34)
  })

  it('never applies to a buy, or to intraday at all', () => {
    expect(
      estimateCharges({ side: 'BUY', product: 'CNC', quantity: 10, price: 500 }).breakdown.dpCharge
    ).toBe(0)
    expect(
      estimateCharges({ side: 'SELL', product: 'MIS', quantity: 10, price: 500 }).breakdown.dpCharge
    ).toBe(0)
    expect(
      estimateCharges({ side: 'BUY', product: 'MIS', quantity: 10, price: 500 }).breakdown.dpCharge
    ).toBe(0)
  })
})

describe('brokerage', () => {
  it('is exactly zero on delivery, both sides', () => {
    expect(
      estimateCharges({ side: 'BUY', product: 'CNC', quantity: 1000, price: 900 }).breakdown
        .brokerage
    ).toBe(0)
    expect(
      estimateCharges({ side: 'SELL', product: 'CNC', quantity: 1000, price: 900 }).breakdown
        .brokerage
    ).toBe(0)
  })

  it('is the percentage below the cap boundary', () => {
    const below = estimateCharges({
      side: 'BUY',
      product: 'MIS',
      quantity: 1,
      price: CAP_BOUNDARY - 1000,
    })
    expect(below.breakdown.brokerage).toBe(roundToPaise(BROKERAGE_MIS_RATE * (CAP_BOUNDARY - 1000)))
    expect(below.breakdown.brokerage).toBeLessThan(BROKERAGE_MIS_CAP)
  })

  it('equals the cap exactly at the boundary', () => {
    const at = estimateCharges({ side: 'BUY', product: 'MIS', quantity: 1, price: CAP_BOUNDARY })
    expect(at.breakdown.brokerage).toBe(BROKERAGE_MIS_CAP)
  })

  it('is capped above the boundary, however large the trade', () => {
    for (const price of [CAP_BOUNDARY + 1000, 500000, 10000000]) {
      const above = estimateCharges({ side: 'SELL', product: 'MIS', quantity: 1, price })
      expect(above.breakdown.brokerage).toBe(BROKERAGE_MIS_CAP)
    }
  })
})

describe('side- and product-conditional components', () => {
  it('taxes delivery on both legs and intraday on the sell only', () => {
    expect(
      estimateCharges({ side: 'BUY', product: 'CNC', quantity: 10, price: 100 }).breakdown.stt
    ).toBeGreaterThan(0)
    expect(
      estimateCharges({ side: 'SELL', product: 'CNC', quantity: 10, price: 100 }).breakdown.stt
    ).toBeGreaterThan(0)
    expect(
      estimateCharges({ side: 'BUY', product: 'MIS', quantity: 10, price: 100 }).breakdown.stt
    ).toBe(0)
    expect(
      estimateCharges({ side: 'SELL', product: 'MIS', quantity: 10, price: 100 }).breakdown.stt
    ).toBeGreaterThan(0)
  })

  it('charges stamp duty on buys only, on both products', () => {
    expect(
      estimateCharges({ side: 'BUY', product: 'CNC', quantity: 10, price: 1000 }).breakdown
        .stampDuty
    ).toBeGreaterThan(0)
    expect(
      estimateCharges({ side: 'BUY', product: 'MIS', quantity: 10, price: 1000 }).breakdown
        .stampDuty
    ).toBeGreaterThan(0)
    expect(
      estimateCharges({ side: 'SELL', product: 'CNC', quantity: 10, price: 1000 }).breakdown
        .stampDuty
    ).toBe(0)
    expect(
      estimateCharges({ side: 'SELL', product: 'MIS', quantity: 10, price: 1000 }).breakdown
        .stampDuty
    ).toBe(0)
  })

  it('never applies GST to STT or stamp duty', () => {
    // A delivery buy has no brokerage and no DP, so GST is 18% of exchange + SEBI alone.
    const buy = estimateCharges({ side: 'BUY', product: 'CNC', quantity: 500, price: 100 })
    const base = buy.breakdown.exchangeTxn + buy.breakdown.sebiTurnover
    expect(buy.breakdown.gst).toBeLessThan(roundToPaise(GST_RATE * (base + buy.breakdown.stt)))
    expect(buy.breakdown.gst).toBe(0.29)
  })
})

describe('the breakdown always reconciles (trading-contract.md §2)', () => {
  const sides = ['BUY', 'SELL'] as const
  const products = ['CNC', 'MIS'] as const
  const quantities = [1, 3, 7, 13, 50, 137, 1000, 9999]
  const prices = [1.05, 9.95, 17.33, 100, 249.75, 1000.5, 8888.88, 76543.21]

  it('sums the rounded components to the total for every combination', () => {
    for (const side of sides) {
      for (const product of products) {
        for (const quantity of quantities) {
          for (const price of prices) {
            const { breakdown, total } = estimateCharges({ side, product, quantity, price })
            const summed = roundToPaise(
              Object.values(breakdown).reduce((sum, component) => sum + component, 0)
            )
            expect(summed, `${side} ${product} ${quantity} @ ${price}`).toBe(total)
          }
        }
      }
    }
  })

  it('produces only non-negative components rounded to at most two decimals', () => {
    for (const side of sides) {
      for (const product of products) {
        const { breakdown } = estimateCharges({ side, product, quantity: 137, price: 249.75 })
        for (const [name, value] of Object.entries(breakdown)) {
          expect(value, name).toBeGreaterThanOrEqual(0)
          // Not `Number.isInteger(value * 100)`: 34.22 * 100 is 3421.9999999999995
          // in binary float, so that check fails on correctly rounded figures.
          const paise = value * 100
          expect(Math.abs(paise - Math.round(paise)), name).toBeLessThan(1e-9)
        }
      }
    }
  })
})
