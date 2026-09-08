import { roundToPaise } from '@/lib/trading/charges'

import type { HoldingRow, PortfolioSummary } from './types'

/**
 * Symbol to price. Deliberately a map of primitives rather than of `LiveQuote`:
 * the callers select it with `useShallow`, which only compares one level deep,
 * so objects here would re-render on every animation frame and change nothing.
 */
export type PriceMap = Record<string, number | null>

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

/**
 * The anchor for a symbol, or the server's own figure when it has not ticked.
 *
 * The caller passes anchors, never interpolated values — see this module's
 * header. There is no `ltp` in scope here at all, which is the point.
 */
export function anchorPrice(
  symbol: string,
  serverLtp: number | null,
  anchors: PriceMap
): number | null {
  const anchor = anchors[symbol]
  if (anchor !== undefined && anchor !== null && Number.isFinite(anchor)) return anchor
  return serverLtp
}

function anchorFor(holding: HoldingRow, anchors: PriceMap): number | null {
  return anchorPrice(holding.symbol, holding.ltp, anchors)
}

function prevCloseFor(holding: HoldingRow, prevCloses: PriceMap): number | null {
  const live = prevCloses[holding.symbol]
  if (live !== undefined && live !== null) return live
  return holding.prevClose
}

export function recomputeSummary(
  summary: PortfolioSummary,
  holdings: HoldingRow[],
  anchors: PriceMap,
  prevCloses: PriceMap = {}
): PortfolioSummary {
  let marketValue = 0
  let dayPnl = 0
  let pricedInvested = 0
  let unpricedCount = 0

  for (const holding of holdings) {
    const price = anchorFor(holding, anchors)

    // No price is not a price of zero. The holding drops out of the valuation
    // and is counted instead, so the tiles can say what they could not value.
    if (price === null) {
      unpricedCount += 1
      continue
    }

    marketValue += holding.quantity * price
    pricedInvested += holding.quantity * holding.averagePrice

    const prevClose = prevCloseFor(holding, prevCloses)
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
  anchors: PriceMap = {},
  limit: number = DONUT_SLICE_LIMIT
): DonutSlice[] {
  const priced = holdings
    .map((holding) => {
      const price = anchorFor(holding, anchors)
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

/**
 * One holdings row, restated against the prices that have arrived since the page
 * rendered.
 *
 * Defined here rather than in `types.ts` for the same reason `DonutSlice` is:
 * that file holds the shapes the *server* returns, and this is a product of this
 * module. Everything it carries is display arithmetic and reaches nothing — the
 * figures the page first renders come from `portfolio_holdings`, per
 * `CLAUDE.md`'s money rule.
 */
export type LiveHolding = HoldingRow & {
  /**
   * The stock's own move since its previous close, in percent — not the
   * holding's. Null when either price is absent, never zero: a zero claims the
   * price is unchanged, and the absence of a previous close is the absence of
   * any claim at all (§9).
   */
  dayChangePct: number | null
}

/**
 * A holdings row valued at the live anchor.
 *
 * **Every figure is the anchor's, never the tween's.** `architecture.md` names
 * every total on Holdings as a surface that renders the price a provider
 * actually reported, and F30 renders the LTP column from the anchor too — so the
 * whole row jumps together when a tick lands rather than the price sliding beside
 * a current value that does not. `anchorFor` is the only price source in scope
 * here, which is what makes that structural.
 */
export function recomputeHolding(
  holding: HoldingRow,
  anchors: PriceMap,
  prevCloses: PriceMap = {}
): LiveHolding {
  const price = anchorFor(holding, anchors)
  const prevClose = prevCloseFor(holding, prevCloses)

  // No price is not a price of zero. Every derived figure drops out together,
  // so the row renders em dashes rather than valuing the holding at nothing.
  if (price === null) {
    return {
      ...holding,
      ltp: null,
      prevClose,
      marketValue: null,
      unrealisedPnl: null,
      dayPnl: null,
      dayChangePct: null,
    }
  }

  return {
    ...holding,
    ltp: price,
    prevClose,
    marketValue: roundToPaise(holding.quantity * price),
    // Unrealised measures against average_price — what this holding has made
    // since it was opened. The day's figure below measures against prev_close.
    // The two answer different questions and §9 forbids substituting either.
    unrealisedPnl: roundToPaise(holding.quantity * (price - holding.averagePrice)),
    dayPnl: prevClose === null ? null : roundToPaise(holding.quantity * (price - prevClose)),
    // Not rounded to paise: this is a percentage, not money. `formatPercent`
    // renders it at 2dp, which is the precision a day change is read at.
    dayChangePct:
      prevClose === null || prevClose === 0 ? null : ((price - prevClose) / prevClose) * 100,
  }
}

/** The columns the holdings table can be ordered by. */
export type HoldingSortKey =
  | 'symbol'
  | 'quantity'
  | 'averagePrice'
  | 'invested'
  | 'ltp'
  | 'marketValue'
  | 'unrealisedPnl'
  | 'dayPnl'

export type SortDirection = 'asc' | 'desc'

/**
 * Orders two restated rows.
 *
 * **An unpriced holding sorts last in both directions.** Treating its null as
 * negative infinity would put it at the head of an ascending P&L sort, reading as
 * the worst performer in the portfolio when in fact nothing is known about it —
 * the same misreading the em dash exists to prevent, reintroduced through the
 * ordering.
 *
 * Ties break on symbol so the order is total: without it two holdings of equal
 * value swap places between renders for no reason a user could explain.
 */
export function compareHoldings(
  a: LiveHolding,
  b: LiveHolding,
  key: HoldingSortKey,
  direction: SortDirection
): number {
  if (key === 'symbol') {
    const order = a.symbol.localeCompare(b.symbol)
    return direction === 'asc' ? order : -order
  }

  const left = a[key]
  const right = b[key]

  if (left === null && right === null) return a.symbol.localeCompare(b.symbol)
  if (left === null) return 1
  if (right === null) return -1

  if (left === right) return a.symbol.localeCompare(b.symbol)
  return direction === 'asc' ? left - right : right - left
}

/** `compareHoldings` applied, without mutating the caller's array. */
export function sortHoldings(
  holdings: readonly LiveHolding[],
  key: HoldingSortKey,
  direction: SortDirection
): LiveHolding[] {
  return [...holdings].sort((a, b) => compareHoldings(a, b, key, direction))
}
