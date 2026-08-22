import { z } from 'zod'

/**
 * The order input shape, validated identically on both sides of the wire.
 *
 * F25's ticket parses through this with `zodResolver`; F26's Server Action
 * parses the same schema before it calls `place_order`. That is the point of
 * sharing it — a client-only bound is a courtesy, and the publishable key ships
 * in the browser bundle, so `place_order` is reachable directly. Postgres is
 * what actually cannot be bypassed: `orders_quantity_positive`,
 * `orders_limit_price_iff_limit` and `reserve_margin` all refuse what this
 * refuses, and `trading-contract.md` §4's rejection codes are decided there.
 */

/**
 * NSE symbols are upper-case alphanumerics with the occasional `&` or `-`
 * (`M&M`, `BAJAJ-AUTO`). Same bound as the watchlist's, and for the same reason:
 * a crafted megabyte of text is refused before it reaches Postgres.
 */
const symbol = z
  .string()
  .trim()
  .min(1, 'Pick a symbol.')
  .max(32, 'That is not a symbol.')
  .regex(/^[A-Z0-9&-]+$/, 'That is not a symbol.')

/**
 * Whole shares only. §1 makes quantities `integer`, so a fraction is not a
 * rounding question — it is a different type, and the CHECK would refuse it.
 *
 * The upper bound is a sanity rail rather than a rule from the contract: no
 * order in a ₹1,00,000 account can reach it at any price this universe trades
 * at, so it only ever catches a typo or a script.
 */
const quantity = z
  .number({ error: 'Enter a quantity.' })
  .int('Whole shares only.')
  .positive('Quantity must be at least 1.')
  .max(1_000_000, 'That is more shares than this simulator allows.')

/**
 * Money in, money out: two decimal places, per §1. `multipleOf` is exact here
 * because Zod compares against the scaled integer rather than the float.
 */
const price = z
  .number({ error: 'Enter a price.' })
  .positive('Price must be more than zero.')
  .max(1_000_000, 'That price is outside this simulator.')
  .multipleOf(0.01, 'Prices go to the paisa.')

export const placeOrderSchema = z
  .object({
    symbol,
    side: z.enum(['BUY', 'SELL'], { error: 'Choose buy or sell.' }),
    orderType: z.enum(['MARKET', 'LIMIT'], { error: 'Choose an order type.' }),
    product: z.enum(['CNC', 'MIS'], { error: 'Choose a product.' }),
    quantity,
    limitPrice: price.nullable().optional(),
  })
  // Mirrors `orders_limit_price_iff_limit`, which is a CHECK and not a
  // preference: a market order carrying a price is refused by the database, so
  // refusing it here turns a 23514 into a field error the user can act on.
  .refine((value) => (value.orderType === 'LIMIT') === (value.limitPrice != null), {
    error: 'A limit order needs a limit price.',
    path: ['limitPrice'],
  })

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>
