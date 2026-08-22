import { describe, expect, it } from 'vitest'

import { placeOrderSchema } from './schemas'

/**
 * The schema is the client's half of a rule Postgres also enforces, so these
 * cases are chosen to match the CHECK constraints they mirror rather than to
 * exercise Zod.
 */

const base = {
  symbol: 'RELIANCE',
  side: 'BUY' as const,
  orderType: 'MARKET' as const,
  product: 'CNC' as const,
  quantity: 10,
  limitPrice: null,
}

function errorFor(input: unknown, path: string): string | undefined {
  const result = placeOrderSchema.safeParse(input)
  if (result.success) return undefined
  return result.error.issues.find((issue) => issue.path.join('.') === path)?.message
}

describe('placeOrderSchema', () => {
  it('accepts a market order with no limit price', () => {
    expect(placeOrderSchema.safeParse(base).success).toBe(true)
  })

  it('accepts a limit order carrying its price', () => {
    const result = placeOrderSchema.safeParse({
      ...base,
      orderType: 'LIMIT',
      limitPrice: 2450.55,
    })
    expect(result.success).toBe(true)
  })

  // `orders_limit_price_iff_limit` is an equivalence, not an implication, so
  // both directions have to fail.
  it('rejects a limit order without a price', () => {
    expect(errorFor({ ...base, orderType: 'LIMIT' }, 'limitPrice')).toBe(
      'A limit order needs a limit price.'
    )
  })

  it('rejects a market order carrying a price', () => {
    expect(errorFor({ ...base, limitPrice: 100 }, 'limitPrice')).toBe(
      'A limit order needs a limit price.'
    )
  })

  it.each([
    [0, 'Quantity must be at least 1.'],
    [-5, 'Quantity must be at least 1.'],
    [1.5, 'Whole shares only.'],
  ])('rejects a quantity of %s', (value, message) => {
    expect(errorFor({ ...base, quantity: value }, 'quantity')).toBe(message)
  })

  it('rejects a price finer than a paisa', () => {
    expect(errorFor({ ...base, orderType: 'LIMIT', limitPrice: 100.005 }, 'limitPrice')).toBe(
      'Prices go to the paisa.'
    )
  })

  // Zero is caught as a price rather than as a missing one — `positive` runs
  // before the cross-field refinement, and the sharper message is the right one.
  it('rejects a zero limit price', () => {
    expect(errorFor({ ...base, orderType: 'LIMIT', limitPrice: 0 }, 'limitPrice')).toBe(
      'Price must be more than zero.'
    )
  })

  it('rejects a symbol that is not one', () => {
    expect(errorFor({ ...base, symbol: 'reliance; drop table' }, 'symbol')).toBe(
      'That is not a symbol.'
    )
  })
})
