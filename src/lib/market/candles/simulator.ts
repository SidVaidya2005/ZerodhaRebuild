import { SIMULATOR_MAX_MOVE_PCT, SIMULATOR_STEP_VOLATILITY } from '@/lib/constants'

import type { CandleInterval, CandleProvider, ProviderCandle } from './types'

/**
 * The candle simulator.
 *
 * **Every bar is a pure function of `(symbol, interval, ts)` and the close
 * before it.** That is the whole design: a chart that redraws its own past on
 * each visit is fabricated data that contradicts itself, and the provenance
 * rules exist to prevent exactly that. Seeding per bar means a regenerated
 * window comes back byte-identical, so the upsert is idempotent and a refresh
 * appends rather than rewrites.
 *
 * It is deliberately not `Math.random`-driven and takes no clock: given the same
 * slots and the same anchors it returns the same series in any process, which is
 * what makes it testable at tier 1 with no database.
 *
 * **Two properties, and it is worth being exact about which does what.** Purity
 * is this module's: same input, same bytes. *Immutable history* is the service's
 * — `getCandles` generates only the slots it does not already hold, plus the one
 * still forming, so a stored bar is never regenerated and never rewritten. Purity
 * alone would not give that, because the anchor a batch is bridged to moves.
 */

/** FNV-1a. Small, fast, and well-distributed enough for a plausible walk. */
function hash(text: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 0x01000193)
  }
  return value >>> 0
}

/**
 * A deterministic draw in [0, 1) for one bar.
 *
 * `salt` distinguishes the draws a single bar needs — its step, its two wicks,
 * its volume — so they are independent of each other without needing a stateful
 * generator threaded through the series.
 */
function draw(symbol: string, interval: CandleInterval, ts: number, salt: string): number {
  const state = hash(`${symbol}|${interval}|${ts}|${salt}`)
  // mulberry32's finaliser, applied once. The input is already well-mixed, so
  // this is about spreading the low bits rather than about period length.
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * How volatile one bar of this interval is, as a fraction of price.
 *
 * A random walk's dispersion grows with the square root of elapsed time, so a
 * 30-minute bar moves √6 times a 5-minute one and a daily bar √75. Reusing the
 * quote simulator's per-tick figure directly would make a year of dailies look
 * like a flat line.
 */
const INTERVAL_MINUTES: Record<CandleInterval, number> = {
  FIVE_MIN: 5,
  THIRTY_MIN: 30,
  ONE_DAY: 375,
}

function stepVolatility(interval: CandleInterval): number {
  return SIMULATOR_STEP_VOLATILITY * Math.sqrt(INTERVAL_MINUTES[interval] / 5)
}

/** Prices exist on the instrument's tick grid, never between two ticks. */
function toTick(price: number, tickSize: number): number {
  const grid = tickSize > 0 ? tickSize : 0.05
  return Math.max(grid, Math.round(price / grid) * grid)
}

export type BuildSeriesParams = {
  symbol: string
  interval: CandleInterval
  /** Candle open times, oldest first, from `candleSlots`. */
  slots: readonly number[]
  /**
   * The close of the bar immediately before `slots[0]`, when one is already
   * stored. Present on an incremental fill, null on a cold start.
   */
  startClose: number | null
  /**
   * The close the final bar must land on — the price the rest of the page is
   * showing. Null only when no quote exists for the symbol.
   */
  endClose: number | null
  tickSize: number
}

/**
 * Build a series for the given slots.
 *
 * **A whole series or nothing.** With no anchor at either end there is no honest
 * price to draw from, so this returns `[]` rather than inventing a level —
 * `library-docs.md` is explicit that a shorter series beats a fabricated one.
 *
 * With `startClose` set the walk runs forward and the last bar is pinned to
 * `endClose`; on a cold start it runs backward from `endClose`. Both directions
 * read the same per-bar draws, so a cold start and a later incremental fill of
 * the same slot agree.
 */
export function buildSeries({
  symbol,
  interval,
  slots,
  startClose,
  endClose,
  tickSize,
}: BuildSeriesParams): ProviderCandle[] {
  if (slots.length === 0) return []
  if (startClose === null && endClose === null) return []

  const volatility = stepVolatility(interval)
  const closes = new Array<number>(slots.length)

  /** A signed step for one bar, clamped to the band a single session may move. */
  const stepFor = (ts: number): number => {
    const raw = (draw(symbol, interval, ts, 'step') - 0.5) * 2 * volatility * 3
    return Math.max(-SIMULATOR_MAX_MOVE_PCT, Math.min(SIMULATOR_MAX_MOVE_PCT, raw))
  }

  if (startClose !== null) {
    let previous = startClose
    for (let i = 0; i < slots.length; i += 1) {
      previous = previous * (1 + stepFor(slots[i]!))
      closes[i] = previous
    }
    // The final bar has to land on the price the header is showing, or the page
    // contradicts itself. Snapping only the last close would leave a visible gap
    // beside it, so the correction is spread across the batch as a Brownian
    // bridge: every step keeps its own shape, and the drift is absorbed evenly.
    if (endClose !== null) {
      const drift = endClose / closes[slots.length - 1]!
      for (let i = 0; i < slots.length; i += 1) {
        closes[i] = closes[i]! * Math.pow(drift, (i + 1) / slots.length)
      }
      closes[slots.length - 1] = endClose
    }
  } else {
    closes[slots.length - 1] = endClose!
    for (let i = slots.length - 1; i > 0; i -= 1) {
      closes[i - 1] = closes[i]! / (1 + stepFor(slots[i]!))
    }
  }

  // The first bar needs an open, and on a cold start there is no prior close to
  // use — so it is stepped back from its own close by its own draw.
  const openingClose = startClose ?? closes[0]! / (1 + stepFor(slots[0]!))

  return slots.map((ts, i) => {
    const close = toTick(closes[i]!, tickSize)
    const open = toTick(i === 0 ? openingClose : closes[i - 1]!, tickSize)

    const body = { high: Math.max(open, close), low: Math.min(open, close) }
    const upperWick = draw(symbol, interval, ts, 'high') * volatility
    const lowerWick = draw(symbol, interval, ts, 'low') * volatility

    // Rounding can pull a wick back inside the body, so the invariant is
    // repaired after the grid is applied rather than trusted before it.
    const high = Math.max(toTick(body.high * (1 + upperWick), tickSize), body.high)
    const low = Math.min(toTick(body.low * (1 - lowerWick), tickSize), body.low)

    return {
      ts,
      open,
      high,
      low,
      close,
      volume: Math.round(10_000 + draw(symbol, interval, ts, 'vol') * 990_000),
    }
  })
}

/**
 * The simulator as a `CandleProvider`.
 *
 * Always available, and last in the chain by construction: it is the only
 * provider that can serve a symbol no upstream will answer for. Every series it
 * produces badges `SIMULATOR`, which is honest — nothing in this build has ever
 * drawn a real candle.
 */
export function createSimulatorCandleProvider(): CandleProvider {
  return {
    name: 'SIMULATOR',
    isAvailable: async () => true,
    fetchCandles: async (symbol, interval, request) =>
      buildSeries({
        symbol,
        interval,
        slots: request.slots,
        startClose: request.startClose,
        endClose: request.endClose,
        tickSize: request.tickSize,
      }),
  }
}
