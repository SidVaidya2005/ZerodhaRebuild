import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  BROKERAGE_CNC_RATE,
  BROKERAGE_MIS_CAP,
  BROKERAGE_MIS_RATE,
  DP_CHARGE_BASE,
  EXCHANGE_TXN_RATE,
  GST_RATE,
  SEBI_TURNOVER_RATE,
  SHORT_MARGIN_BUFFER,
  STAMP_DUTY_CNC_BUY_RATE,
  STAMP_DUTY_MIS_BUY_RATE,
  STT_CNC_RATE,
  STT_MIS_SELL_RATE,
} from '@/lib/constants'
import {
  estimateCharges,
  type ChargeBreakdown,
  type OrderProduct,
  type OrderSide,
} from '@/lib/trading/charges'

/**
 * The two charge calculators are one calculator.
 *
 * `trading-contract.md` §1 lets TypeScript show a labelled *estimate* and
 * forbids it producing a stored value; every figure that reaches the database
 * comes from `calculate_charges`. That split is only honest if the estimate the
 * order ticket shows is the amount actually charged — so this compares them
 * directly, on every component, exactly.
 *
 * **Exact equality, not "within a paisa".** That bar was measured before it was
 * chosen: across 600,000 random component comparisons and 6,000 constructed
 * exact half-paisa midpoints, the epsilon-nudged `roundToPaise` never diverged
 * from exact decimal half-up. If this test ever fails on a rounding edge rather
 * than on a rate, the fix is to make the TypeScript side exact — not to loosen
 * the assertion.
 */

let db: Client

beforeAll(async () => {
  db = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  await db.connect()
})

afterAll(async () => {
  await db.end()
})

/** The database's own view of one order's charges, in the TypeScript shape. */
async function postgresCharges(
  side: OrderSide,
  product: OrderProduct,
  quantity: number,
  price: number
): Promise<{ total: number; breakdown: ChargeBreakdown }> {
  const { rows } = await db.query<{ total: string; breakdown: Record<string, number> }>(
    'select total, breakdown from public.calculate_charges($1, $2, $3, $4)',
    [side, product, quantity, price.toFixed(2)]
  )

  const row = rows[0]
  if (!row) throw new Error('calculate_charges returned no row')

  // numeric crosses the wire as a string, deliberately — `pg` refuses to parse
  // it as a float because that would be lossy. Parsing here is safe only
  // because these are 2dp money values well inside float64's exact range.
  return {
    total: Number(row.total),
    breakdown: {
      brokerage: Number(row.breakdown.brokerage),
      stt: Number(row.breakdown.stt),
      exchangeTxn: Number(row.breakdown.exchange_txn),
      sebiTurnover: Number(row.breakdown.sebi_turnover),
      stampDuty: Number(row.breakdown.stamp_duty),
      dpCharge: Number(row.breakdown.dp_charge),
      gst: Number(row.breakdown.gst),
    },
  }
}

describe('the rate tables are the same rate table', () => {
  // Compared directly rather than inferred from totals. Two rate sets can
  // produce identical results on the inputs a property test happens to draw and
  // still differ — and `charge_rates()` exists as a readable function precisely
  // so this comparison is possible.
  it('charge_rates() matches src/lib/constants.ts, rate for rate', async () => {
    const { rows } = await db.query('select * from public.charge_rates()')
    const r = rows[0]

    expect(Number(r.brokerage_cnc_rate)).toBe(BROKERAGE_CNC_RATE)
    expect(Number(r.brokerage_mis_rate)).toBe(BROKERAGE_MIS_RATE)
    expect(Number(r.brokerage_mis_cap)).toBe(BROKERAGE_MIS_CAP)
    expect(Number(r.stt_cnc_rate)).toBe(STT_CNC_RATE)
    expect(Number(r.stt_mis_sell_rate)).toBe(STT_MIS_SELL_RATE)
    expect(Number(r.exchange_txn_rate)).toBe(EXCHANGE_TXN_RATE)
    expect(Number(r.sebi_turnover_rate)).toBe(SEBI_TURNOVER_RATE)
    expect(Number(r.stamp_duty_cnc_buy_rate)).toBe(STAMP_DUTY_CNC_BUY_RATE)
    expect(Number(r.stamp_duty_mis_buy_rate)).toBe(STAMP_DUTY_MIS_BUY_RATE)
    expect(Number(r.gst_rate)).toBe(GST_RATE)
    expect(Number(r.dp_charge_base)).toBe(DP_CHARGE_BASE)
  })

  // The buffer is not a charge rate and so is not in that composite, but it
  // drifts the same way and with a worse consequence: F25's ticket quotes the
  // margin a short requires from the TypeScript copy, while the collateral
  // actually held comes from the Postgres one. A divergence there quotes the
  // user one figure and blocks another.
  it('short_margin_buffer() matches SHORT_MARGIN_BUFFER', async () => {
    const { rows } = await db.query('select public.short_margin_buffer() as buffer')

    expect(Number(rows[0].buffer)).toBe(SHORT_MARGIN_BUFFER)
  })
})

describe('the estimate equals what is charged', () => {
  const SIDES: OrderSide[] = ['BUY', 'SELL']
  const PRODUCTS: OrderProduct[] = ['CNC', 'MIS']

  /**
   * Seeded so a failure is reproducible. A property test that draws from
   * `Math.random()` reports a mismatch you cannot then re-run, which is the
   * worst possible moment to lose the input.
   */
  function makeRandom(seed: number): () => number {
    let state = seed >>> 0
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0
      return state / 0x100000000
    }
  }

  const SEED = 20260822
  const rand = makeRandom(SEED)

  /** The turnover at which 0.03% equals the flat cap, so cases straddle it. */
  const CAP_BOUNDARY = BROKERAGE_MIS_CAP / BROKERAGE_MIS_RATE

  const cases: { side: OrderSide; product: OrderProduct; quantity: number; price: number }[] = []

  // Every side/product combination, at a turnover well under the cap, exactly
  // around it, and far above it — the cap is the one discontinuity in the model.
  for (const side of SIDES) {
    for (const product of PRODUCTS) {
      for (const target of [CAP_BOUNDARY / 10, CAP_BOUNDARY, CAP_BOUNDARY * 50]) {
        const quantity = Math.max(1, Math.round(target / 100))
        cases.push({ side, product, quantity, price: Number((target / quantity).toFixed(2)) })
      }
    }
  }

  // …and 120 random ones on top, so the fixed cases cannot be the only coverage.
  for (let i = 0; i < 120; i++) {
    cases.push({
      side: SIDES[Math.floor(rand() * SIDES.length)]!,
      product: PRODUCTS[Math.floor(rand() * PRODUCTS.length)]!,
      quantity: 1 + Math.floor(rand() * 5000),
      price: Number((0.05 + rand() * 20000).toFixed(2)),
    })
  }

  it(`agrees on all seven components and the total for ${cases.length} inputs (seed ${SEED})`, async () => {
    const mismatches: string[] = []

    for (const input of cases) {
      const ts = estimateCharges(input)
      const pg = await postgresCharges(input.side, input.product, input.quantity, input.price)
      const label = `${input.side} ${input.product} ${input.quantity} @ ${input.price}`

      if (pg.total !== ts.total) {
        mismatches.push(`${label}: total ts=${ts.total} pg=${pg.total}`)
      }

      for (const key of Object.keys(ts.breakdown) as (keyof ChargeBreakdown)[]) {
        if (pg.breakdown[key] !== ts.breakdown[key]) {
          mismatches.push(`${label}: ${key} ts=${ts.breakdown[key]} pg=${pg.breakdown[key]}`)
        }
      }
    }

    expect(
      mismatches,
      `seed ${SEED} — the two calculators disagree:\n  ${mismatches.join('\n  ')}`
    ).toEqual([])
  })

  // The general case above would catch this, but only if it happened to draw an
  // input where the two readings of §2 differ — and most inputs do not. Pinned
  // so the rule is covered whatever the seed produces.
  it('agrees on the case where GST-on-rounded would differ by a paisa', async () => {
    const input = { side: 'BUY' as const, product: 'MIS' as const, quantity: 2, price: 41.67 }
    const ts = estimateCharges(input)
    const pg = await postgresCharges(input.side, input.product, input.quantity, input.price)

    expect(ts.breakdown.gst).toBe(0)
    expect(pg.breakdown.gst).toBe(0)
    expect(pg.total).toBe(ts.total)
  })

  it('agrees on a delivery sell, where the DP base joins the GST base', async () => {
    const ts = estimateCharges({ side: 'SELL', product: 'CNC', quantity: 500, price: 100 })
    const pg = await postgresCharges('SELL', 'CNC', 500, 100)

    expect(pg.breakdown).toEqual(ts.breakdown)
    expect(pg.total).toBe(ts.total)
    expect(pg.breakdown.dpCharge).toBe(DP_CHARGE_BASE)
  })
})
