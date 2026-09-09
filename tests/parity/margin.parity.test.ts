import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SHORT_MARGIN_BUFFER } from '@/lib/constants'
import type { OrderProduct, OrderSide } from '@/lib/trading/charges'
import {
  estimateMargin,
  shortCollateralRequirement,
  type SymbolExposure,
} from '@/lib/trading/margin'

/**
 * The order ticket's margin figure is the margin the engine reserves.
 *
 * `trading-contract.md` §1 lets TypeScript show a labelled estimate and forbids
 * it producing a stored value — but an estimate that disagrees with the engine
 * is worse than none, because the user reads it and decides on it. So this
 * compares `estimateMargin` against the arithmetic `reserve_margin` performs:
 * `short_collateral_requirement` for a short, `calculate_charges` throughout.
 *
 * **Exact equality, not "within a paisa".** That bar is inherited rather than
 * chosen: F22 measured it across 600,000 random component comparisons before
 * committing to it, and a looser one here would hide exactly the drift this
 * test exists to catch — a buffer changed on one side, a rounding step in a
 * different order.
 *
 * Read-only, like the rest of tier 4: neither function it calls writes anything.
 */

let db: Client

beforeAll(async () => {
  db = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  await db.connect()
})

afterAll(async () => {
  await db.end()
})

/** Postgres's own collateral figure. */
async function postgresCollateral(quantity: number, price: number): Promise<number> {
  const { rows } = await db.query<{ required: string }>(
    'select public.short_collateral_requirement($1, $2) as required',
    [quantity, price.toFixed(2)]
  )
  return Number(rows[0]!.required)
}

/** Postgres's own charge total, for the order as a whole. */
async function postgresCharges(
  side: OrderSide,
  product: OrderProduct,
  quantity: number,
  price: number
): Promise<number> {
  const { rows } = await db.query<{ total: string }>(
    'select total from public.calculate_charges($1, $2, $3, $4)',
    [side, product, quantity, price.toFixed(2)]
  )
  return Number(rows[0]!.total)
}

/**
 * `reserve_margin`'s arithmetic, assembled from the two read-only functions it
 * calls. Deliberately **not** a call to `reserve_margin` itself: that one
 * writes, needs an order row and a funds row, and would drag tier 4 into the
 * commit gate tier 3 lives behind for exactly this reason.
 */
async function postgresMargin(
  side: OrderSide,
  product: OrderProduct,
  quantity: number,
  price: number,
  exposure: SymbolExposure
): Promise<number> {
  const charges = await postgresCharges(side, product, quantity, price)
  const netQuantity = product === 'MIS' ? exposure.netQuantity : 0

  if (side === 'BUY') {
    const reservable = quantity - Math.min(quantity, Math.max(-netQuantity, 0))
    const { rows } = await db.query<{ required: string }>(
      'select round($1::numeric * $2::numeric, 2) + $3::numeric as required',
      [reservable, price.toFixed(2), charges]
    )
    return Number(rows[0]!.required)
  }

  if (product === 'CNC') return 0

  const reservable = quantity - Math.max(netQuantity, 0)
  if (reservable <= 0) return 0

  const collateral = await postgresCollateral(reservable, price)
  const { rows } = await db.query<{ required: string }>(
    'select ($1::numeric + $2::numeric) as required',
    [collateral, charges]
  )
  return Number(rows[0]!.required)
}

const NONE: SymbolExposure = { holding: 0, netQuantity: 0 }

/**
 * Ten cases chosen to hit every branch of §6, not sampled. The branch that
 * matters most — a buy that covers a short — is one a random draw would almost
 * never produce, because it needs the exposure and the order to line up.
 */
const CASES: ReadonlyArray<{
  label: string
  side: OrderSide
  product: OrderProduct
  quantity: number
  price: number
  exposure: SymbolExposure
}> = [
  { label: 'delivery buy', side: 'BUY', product: 'CNC', quantity: 10, price: 100, exposure: NONE },
  {
    label: 'delivery sell',
    side: 'SELL',
    product: 'CNC',
    quantity: 10,
    price: 100,
    exposure: { holding: 30, netQuantity: 0 },
  },
  {
    label: 'intraday long',
    side: 'BUY',
    product: 'MIS',
    quantity: 25,
    price: 2450.55,
    exposure: NONE,
  },
  { label: 'short entry', side: 'SELL', product: 'MIS', quantity: 100, price: 100, exposure: NONE },
  {
    label: 'short entry above the brokerage cap',
    side: 'SELL',
    product: 'MIS',
    quantity: 900,
    price: 1875.25,
    exposure: NONE,
  },
  {
    label: 'adding to a short',
    side: 'SELL',
    product: 'MIS',
    quantity: 50,
    price: 97.4,
    exposure: { holding: 0, netQuantity: -100 },
  },
  {
    label: 'full cover',
    side: 'BUY',
    product: 'MIS',
    quantity: 100,
    price: 90,
    exposure: { holding: 0, netQuantity: -100 },
  },
  {
    label: 'partial cover',
    side: 'BUY',
    product: 'MIS',
    quantity: 40,
    price: 90,
    exposure: { holding: 0, netQuantity: -100 },
  },
  {
    label: 'buy crossing zero',
    side: 'BUY',
    product: 'MIS',
    quantity: 10,
    price: 100,
    exposure: { holding: 0, netQuantity: -4 },
  },
  {
    label: 'sell crossing zero',
    side: 'SELL',
    product: 'MIS',
    quantity: 10,
    price: 100,
    exposure: { holding: 0, netQuantity: 4 },
  },
]

describe('the buffer is the same buffer', () => {
  it('short_margin_buffer() matches SHORT_MARGIN_BUFFER', async () => {
    const { rows } = await db.query('select public.short_margin_buffer() as buffer')
    expect(Number(rows[0].buffer)).toBe(SHORT_MARGIN_BUFFER)
  })
})

describe('the ticket estimates what the engine reserves', () => {
  it.each(CASES)('agrees on a $label', async ({ side, product, quantity, price, exposure }) => {
    const expected = await postgresMargin(side, product, quantity, price, exposure)
    expect(estimateMargin({ side, product, quantity, price, exposure }).required).toBe(expected)
  })

  it('agrees on the collateral formula itself across magnitudes', async () => {
    for (const [quantity, price] of [
      [1, 9.05],
      [7, 1234.56],
      [100, 100],
      [333, 87.65],
      [2500, 19.99],
    ] as const) {
      expect(shortCollateralRequirement(quantity, price)).toBe(
        await postgresCollateral(quantity, price)
      )
    }
  })

  // The hand-picked cases can only prove what they contain. A seeded sweep
  // across all four side/product combinations catches a rounding step applied in
  // a different order, which no single case would.
  it('agrees over 120 seeded-random orders', async () => {
    const SEED = 20260822
    let state = SEED
    const next = () => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state / 2147483648
    }

    const mismatches: string[] = []

    for (let i = 0; i < 120; i += 1) {
      const side: OrderSide = next() < 0.5 ? 'BUY' : 'SELL'
      const product: OrderProduct = next() < 0.5 ? 'CNC' : 'MIS'
      const quantity = 1 + Math.floor(next() * 500)
      const price = Math.round((5 + next() * 3000) * 100) / 100
      const exposure: SymbolExposure = {
        holding: Math.floor(next() * 200),
        netQuantity: Math.floor(next() * 400) - 200,
      }

      const expected = await postgresMargin(side, product, quantity, price, exposure)
      const actual = estimateMargin({ side, product, quantity, price, exposure }).required

      if (actual !== expected) {
        mismatches.push(
          `${side}/${product} ${quantity} @ ${price} net=${exposure.netQuantity}: ts=${actual} pg=${expected}`
        )
      }
    }

    expect(mismatches, `seed ${SEED}`).toEqual([])
    // 120 sequential round trips to a remote ap-south-1 database is ~30s of
    // pure latency, which is exactly Vitest's default budget — so this test
    // failed or passed on network jitter rather than on agreement, observed
    // both ways within three consecutive runs at the Phase 4 checkpoint. The
    // budget is what was wrong, not the test: a timeout here should mean
    // something is hung, never that the link was slow today.
  }, 120_000)
})
