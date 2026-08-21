import {
  BROKERAGE_CNC_RATE,
  BROKERAGE_MIS_CAP,
  BROKERAGE_MIS_RATE,
  DP_CHARGE_BASE,
  EXCHANGE_TXN_RATE,
  GST_RATE,
  SEBI_TURNOVER_RATE,
  STAMP_DUTY_CNC_BUY_RATE,
  STAMP_DUTY_MIS_BUY_RATE,
  STT_CNC_RATE,
  STT_MIS_SELL_RATE,
} from '@/lib/constants'

export type OrderSide = 'BUY' | 'SELL'
export type OrderProduct = 'CNC' | 'MIS'

/**
 * One key per component in `trading-contract.md` §3. Absent components are 0,
 * never missing — the same shape `trades.charge_breakdown` stores, in camelCase
 * because snake_case does not cross into TypeScript (`code-standards.md`).
 */
export type ChargeBreakdown = {
  brokerage: number
  stt: number
  exchangeTxn: number
  sebiTurnover: number
  stampDuty: number
  dpCharge: number
  gst: number
}

export type ChargeEstimate = {
  turnover: number
  breakdown: ChargeBreakdown
  /** Sum of the already-rounded components, per §2. */
  total: number
}

export type ChargeInput = {
  side: OrderSide
  product: OrderProduct
  quantity: number
  price: number
}

/**
 * Round half-up to paise.
 *
 * `Math.round` is half-up for positives, but binary floating point puts values
 * like 1.005 a hair below the midpoint, so scaling alone rounds them down. Every
 * charge here is non-negative, so nudging by one ulp before rounding is safe and
 * makes the boundary behave the way §2 says it does. Feature 22 has to reproduce
 * this exactly in Postgres, where `numeric` rounds half-up natively.
 */
export function roundToPaise(value: number): number {
  const scaled = value * 100
  return Math.round(scaled + Number.EPSILON * Math.abs(scaled)) / 100
}

/**
 * A **display estimate**, and nothing more. `trading-contract.md` §1 permits
 * TypeScript to show a clearly-labelled estimate and forbids it producing any
 * stored value — every figure that gets written to the database comes from the
 * Postgres calculator in feature 22, which a property test proves equal to this.
 */
export function estimateCharges({ side, product, quantity, price }: ChargeInput): ChargeEstimate {
  const turnover = quantity * price
  const isBuy = side === 'BUY'
  const isDelivery = product === 'CNC'

  const brokerageRaw = isDelivery
    ? BROKERAGE_CNC_RATE * turnover
    : Math.min(BROKERAGE_MIS_RATE * turnover, BROKERAGE_MIS_CAP)

  // Delivery is taxed on both legs; intraday only when you sell.
  const sttRaw = isDelivery ? STT_CNC_RATE * turnover : isBuy ? 0 : STT_MIS_SELL_RATE * turnover

  const exchangeTxnRaw = EXCHANGE_TXN_RATE * turnover
  const sebiRaw = SEBI_TURNOVER_RATE * turnover

  // Stamp duty is buy-side only, on both products.
  const stampDutyRaw = !isBuy
    ? 0
    : (isDelivery ? STAMP_DUTY_CNC_BUY_RATE : STAMP_DUTY_MIS_BUY_RATE) * turnover

  // DP applies to a delivery sell only, flat regardless of quantity, and — as a
  // documented divergence from a real broker — once per order rather than once
  // per scrip per day. See trading-contract.md §3.
  const dpChargeRaw = isDelivery && !isBuy ? DP_CHARGE_BASE : 0

  // §2: GST is computed on the UNROUNDED sub-components and rounded once. Its
  // base includes the DP base, and all GST on the trade lands in this one key,
  // so `gst` never changes meaning depending on whether DP was involved.
  const gstRaw = GST_RATE * (brokerageRaw + exchangeTxnRaw + sebiRaw + dpChargeRaw)

  const breakdown: ChargeBreakdown = {
    brokerage: roundToPaise(brokerageRaw),
    stt: roundToPaise(sttRaw),
    exchangeTxn: roundToPaise(exchangeTxnRaw),
    sebiTurnover: roundToPaise(sebiRaw),
    stampDuty: roundToPaise(stampDutyRaw),
    dpCharge: roundToPaise(dpChargeRaw),
    gst: roundToPaise(gstRaw),
  }

  // §2: the total is the sum of already-rounded components, never a rounding of
  // the unrounded sum — that is what keeps the breakdown reconciling exactly.
  const total = roundToPaise(
    Object.values(breakdown).reduce((sum, component) => sum + component, 0)
  )

  return { turnover, breakdown, total }
}
