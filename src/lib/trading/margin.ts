import { SHORT_MARGIN_BUFFER } from '@/lib/constants'

import { estimateCharges, roundToPaise, type OrderProduct, type OrderSide } from './charges'

/**
 * What `reserve_margin` will block, computed in TypeScript for the order ticket.
 *
 * A **display estimate**, per `trading-contract.md` §1 — it may never produce a
 * stored value. `pnpm test:parity` proves it exactly equal to
 * `short_collateral_requirement` + `calculate_charges`, which is the only reason
 * a second implementation of §6 is allowed to exist at all.
 *
 * **The position matters.** §6 reserves over the quantity that opens fresh
 * exposure, not over the whole order: a buy covering a short is funded by the
 * collateral already held against those shares, and a sell against an existing
 * long closes it rather than shorting. Ignoring that would tell a user covering
 * a 100-share short they need ₹10,029 where the engine reserves ₹29 — and the
 * figure would be wrong on roughly half of all orders, always in the direction
 * that refuses a trade the engine would accept.
 */

/** The user's existing exposure in the symbol, as the ticket reads it. */
export type SymbolExposure = {
  /** CNC delivery quantity. Always zero or more — there is no CNC shorting. */
  holding: number
  /** MIS net quantity: negative for a short, zero when no position is open. */
  netQuantity: number
}

export type MarginInput = {
  side: OrderSide
  product: OrderProduct
  quantity: number
  /** `limitPrice` for a limit order, the live `ltp` for a market one (§6). */
  price: number
  exposure: SymbolExposure
}

export type MarginEstimate = {
  /** What `reserve_margin` blocks: collateral or notional, plus charges. */
  required: number
  /** The part of the order that opens or adds to exposure. */
  openingQuantity: number
  /** The part that closes existing exposure, and so needs no fresh cash. */
  closingQuantity: number
  /** Estimated charges on the whole order, per §3. */
  charges: number
  /**
   * The §6 collateral on the shorting excess, before charges. Zero for
   * everything that is not an MIS sell opening a short — the ticket shows it
   * separately so a short's 20% buffer is visible rather than buried in a total.
   */
  collateral: number
}

/**
 * §6's collateral formula, and the one thing here that must not drift:
 *
 *   |quantity| × price × (1 + SHORT_MARGIN_BUFFER)
 *     + estimated closing charges at the buffered price
 *
 * Charges are estimated at the **buffered** price, not the entry price, because
 * the cover this funds happens at the worst price the buffer contemplates.
 * `short_collateral_requirement` in Postgres does exactly this, and tier 4
 * compares them.
 */
export function shortCollateralRequirement(quantity: number, referencePrice: number): number {
  const shares = Math.abs(quantity)
  if (shares === 0) return 0

  const bufferedPrice = referencePrice * (1 + SHORT_MARGIN_BUFFER)
  const notional = roundToPaise(shares * bufferedPrice)
  const closeCharges = estimateCharges({
    side: 'BUY',
    product: 'MIS',
    quantity: shares,
    price: bufferedPrice,
  }).total

  return roundToPaise(notional + closeCharges)
}

export function estimateMargin({
  side,
  product,
  quantity,
  price,
  exposure,
}: MarginInput): MarginEstimate {
  const charges = estimateCharges({ side, product, quantity, price }).total

  // CNC has neither shorting nor a positions row, so a delivery order never nets
  // against the MIS book.
  const netQuantity = product === 'MIS' ? exposure.netQuantity : 0

  if (side === 'BUY') {
    // Only the quantity that opens or adds to a long needs cash; the rest is a
    // cover, funded by the collateral already held against those shares.
    const closingQuantity = Math.min(quantity, Math.max(-netQuantity, 0))
    const openingQuantity = quantity - closingQuantity

    return {
      required: roundToPaise(roundToPaise(openingQuantity * price) + charges),
      openingQuantity,
      closingQuantity,
      charges,
      collateral: 0,
    }
  }

  // A delivery sell reserves nothing — it requires the holding instead, and that
  // is a NO_HOLDING rejection rather than a margin question.
  if (product === 'CNC') {
    return {
      required: 0,
      openingQuantity: 0,
      closingQuantity: Math.min(quantity, Math.max(exposure.holding, 0)),
      charges,
      collateral: 0,
    }
  }

  // An MIS sell reserves only the part that opens a short.
  const closingQuantity = Math.min(quantity, Math.max(netQuantity, 0))
  const openingQuantity = quantity - closingQuantity

  if (openingQuantity <= 0) {
    // Fully covered by an existing long: no obligation is left open, so this
    // reserves nothing at all — exactly like a CNC sell.
    return { required: 0, openingQuantity: 0, closingQuantity, charges, collateral: 0 }
  }

  // §6: a short reserves the COLLATERAL it will have to hold, not the notional.
  // Those differ by the whole buffer, and reserving the notional would leave
  // every short short by roughly a fifth of the trade at fill.
  const collateral = shortCollateralRequirement(openingQuantity, price)

  return {
    required: roundToPaise(collateral + charges),
    openingQuantity,
    closingQuantity,
    charges,
    collateral,
  }
}

/** Nothing is open in this symbol. The ticket's state before the fetch lands. */
export const NO_EXPOSURE: SymbolExposure = { holding: 0, netQuantity: 0 }
