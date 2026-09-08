import { roundToPaise } from '@/lib/trading/charges'

import { anchorPrice, type PriceMap } from './totals'
import type { PositionRow, PositionsSummary } from './types'

/**
 * The positions page, restated against the prices that have arrived since it
 * rendered.
 *
 * **Display arithmetic, never persisted.** `portfolio_positions` and
 * `portfolio_positions_summary` compute every figure the page first renders, per
 * `CLAUDE.md`'s money rule, which forbids computing a money value in TypeScript
 * *and storing it*. Nothing here reaches the database, an order, or a stored
 * total. It exists so a position's P&L cannot sit frozen beside a watchlist
 * whose prices are visibly moving.
 *
 * **Every figure is taken from the anchor, never from a tween.** There is no
 * interpolated value in scope in this module at all, which is what makes
 * `architecture.md`'s invariant structural here rather than remembered.
 */

/**
 * One position valued at the live anchor.
 *
 * **`netQuantity` carries the sign and one expression covers both directions.**
 * A short of 100 at ₹99.70 against ₹90 gives `−100 × (90 − 99.70) = +970`, which
 * is §9's `(average_price − exit_price) × quantity` for a short and
 * `(exit_price − average_price) × quantity` for a long. The view computes the
 * identical expression; branching on direction in either place would be two
 * formulas free to drift.
 *
 * Charges are excluded, exactly as they are for a holding: §9 nets the closing
 * charges into *realised* P&L, on the closing leg only.
 */
export function recomputePosition(position: PositionRow, anchors: PriceMap): PositionRow {
  const price = anchorPrice(position.symbol, position.ltp, anchors)

  // No price is not a price of zero. The derived figures drop out together, so
  // the row renders em dashes rather than valuing the position at nothing.
  if (price === null) {
    return { ...position, ltp: null, unrealisedPnl: null }
  }

  return {
    ...position,
    ltp: price,
    unrealisedPnl: roundToPaise(position.netQuantity * (price - position.averagePrice)),
  }
}

/**
 * The footer, restated over the same anchors the rows used.
 *
 * `realisedPnl` and `blockedMargin` do not move with price and are re-summed
 * anyway, because the criterion this footer has to meet is that it equals the
 * sum of the rows on screen — not that it equals what the server last said.
 */
export function recomputePositionsSummary(
  summary: PositionsSummary,
  positions: readonly PositionRow[],
  anchors: PriceMap
): PositionsSummary {
  let unrealisedPnl = 0
  let realisedPnl = 0
  let blockedMargin = 0
  let unpricedCount = 0

  for (const position of positions) {
    realisedPnl += position.realisedPnl
    blockedMargin += position.blockedMargin

    const price = anchorPrice(position.symbol, position.ltp, anchors)

    // Counted rather than valued at zero, so the footer can say what it could
    // not value instead of understating itself in silence.
    if (price === null) {
      unpricedCount += 1
      continue
    }

    unrealisedPnl += position.netQuantity * (price - position.averagePrice)
  }

  return {
    ...summary,
    unrealisedPnl: roundToPaise(unrealisedPnl),
    realisedPnl: roundToPaise(realisedPnl),
    blockedMargin: roundToPaise(blockedMargin),
    positionCount: positions.length,
    unpricedCount,
  }
}

/** The columns the positions table can be ordered by. */
export type PositionSortKey =
  | 'symbol'
  | 'netQuantity'
  | 'averagePrice'
  | 'ltp'
  | 'unrealisedPnl'
  | 'realisedPnl'
  | 'blockedMargin'

export type SortDirection = 'asc' | 'desc'

/**
 * Orders two restated positions.
 *
 * **An unpriced position sorts last in both directions**, for the same reason
 * F30's do: treating its null as negative infinity would put it at the head of
 * an ascending P&L sort, reading as the worst performer when nothing at all is
 * known about it. Ties break on symbol so the order is total.
 */
export function comparePositions(
  a: PositionRow,
  b: PositionRow,
  key: PositionSortKey,
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

/** `comparePositions` applied, without mutating the caller's array. */
export function sortPositions(
  positions: readonly PositionRow[],
  key: PositionSortKey,
  direction: SortDirection
): PositionRow[] {
  return [...positions].sort((a, b) => comparePositions(a, b, key, direction))
}
