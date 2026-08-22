import { roundToPaise } from '@/lib/trading/charges'
import type { LiveQuote } from '@/lib/stores/quote-store'

import type { HoldingRow, PortfolioSummary } from './types'

/**
 * The dashboard tiles, restated against the prices that have arrived since the
 * page rendered.
 *
 * **This is display arithmetic and it is never persisted.** Postgres computes
 * every figure the page first renders — `portfolio_summary` does the work, per
 * `CLAUDE.md`'s money rule, which forbids computing a money value in TypeScript
 * *and storing it*. Nothing here reaches the database, an order, or a total that
 * is written anywhere. It exists for the same reason F19's `dayChange` does: a
 * portfolio value frozen at render time, sitting beside a watchlist whose prices
 * are visibly moving, contradicts itself on screen.
 *
 * **Every figure is taken from `anchor`, never from `ltp`.** `architecture.md`'s
 * invariant is that a monetary total renders the price a provider actually
 * reported, never one the interpolation loop invented — and an earlier draft of
 * that document listed these tiles as an ambient surface that could tween, which
 * F21 corrected. The tiles jump when a tick lands. They do not slide.
 */

/** The anchor for a symbol, or the server's own figure when it has not ticked. */
function anchorFor(holding: HoldingRow, quotes: Record<string, LiveQuote>): number | null {
  const quote = quotes[holding.symbol]
  // `anchor`, deliberately. `quote.ltp` is mid-tween and synthetic.
  if (quote && Number.isFinite(quote.anchor)) return quote.anchor
  return holding.ltp
}

function prevCloseFor(holding: HoldingRow, quotes: Record<string, LiveQuote>): number | null {
  const quote = quotes[holding.symbol]
  if (quote && quote.prevClose !== null) return quote.prevClose
  return holding.prevClose
}

export function recomputeSummary(
  summary: PortfolioSummary,
  holdings: HoldingRow[],
  quotes: Record<string, LiveQuote>
): PortfolioSummary {
  let marketValue = 0
  let dayPnl = 0
  let pricedInvested = 0
  let unpricedCount = 0

  for (const holding of holdings) {
    const price = anchorFor(holding, quotes)

    // No price is not a price of zero. The holding drops out of the valuation
    // and is counted instead, so the tiles can say what they could not value.
    if (price === null) {
      unpricedCount += 1
      continue
    }

    marketValue += holding.quantity * price
    pricedInvested += holding.quantity * holding.averagePrice

    const prevClose = prevCloseFor(holding, quotes)
    if (prevClose !== null) dayPnl += holding.quantity * (price - prevClose)
  }

  // Overall P&L spans the priced holdings only, which is why the unpriced count
  // travels beside it. Comparing a full invested figure against a partial market
  // value would report the missing holding as a total loss.
  return {
    ...summary,
    marketValue: roundToPaise(marketValue),
    portfolioValue: roundToPaise(summary.availableCash + marketValue),
    overallPnl: roundToPaise(marketValue - pricedInvested),
    dayPnl: roundToPaise(dayPnl),
    unpricedCount,
  }
}

/** One arc of the holdings donut. */
export type DonutSlice = {
  name: string
  value: number
  /** True for the aggregated tail, which has no symbol to link to. */
  isOthers: boolean
}

export const DONUT_SLICE_LIMIT = 10

/**
 * The top ten holdings by market value, with everything below them summed into
 * a single `Others` arc.
 *
 * **Ranked by market value, not by quantity.** A thousand shares of a ₹12 stock
 * is a smaller position than ten shares of a ₹4,000 one, and a donut is a
 * picture of concentration — ranking by quantity would draw the wrong one.
 *
 * Unpriced holdings are excluded rather than drawn at zero: an arc of zero size
 * is invisible, so it would appear in the legend as a holding the chart claims
 * to have drawn and has not.
 */
export function toDonutSlices(
  holdings: HoldingRow[],
  quotes: Record<string, LiveQuote> = {},
  limit: number = DONUT_SLICE_LIMIT
): DonutSlice[] {
  const priced = holdings
    .map((holding) => {
      const price = anchorFor(holding, quotes)
      return price === null
        ? null
        : { name: holding.symbol, value: holding.quantity * price, isOthers: false }
    })
    .filter((slice): slice is DonutSlice => slice !== null && slice.value > 0)
    .sort((a, b) => b.value - a.value)

  if (priced.length <= limit) return priced.map(round)

  const head = priced.slice(0, limit).map(round)
  const tail = priced.slice(limit).reduce((total, slice) => total + slice.value, 0)

  return [...head, { name: 'Others', value: roundToPaise(tail), isOthers: true }]
}

function round(slice: DonutSlice): DonutSlice {
  return { ...slice, value: roundToPaise(slice.value) }
}
