import { SIMULATOR_MAX_MOVE_PCT, SIMULATOR_STEP_VOLATILITY } from '@/lib/constants'

import type { ProviderQuote, QuoteProvider, SymbolAnchor } from './types'

/**
 * The provider of last resort, and — while Yahoo is deferred — the only one that
 * serves a price at all.
 *
 * It walks from a **real** market close. `instruments.prev_close` is seeded from
 * NSE's published bhavcopy (F15), so MRF starts near ₹1,32,665 and YESBANK near
 * ₹22.80 instead of both starting at an invented constant. That matters for more
 * than looks: Phase 5's portfolio arithmetic is meaningless if every holding is
 * priced the same.
 *
 * It is honest about what it is. Every quote carries a null `providerTs`, and
 * `deriveSource()` renders anything from this provider as SIMULATED regardless
 * of age — the badge is the project's honesty guarantee.
 *
 * Deterministic under test: both the clock and the random source are injected,
 * so the same seed produces the same series.
 */

export type SimulatorOptions = {
  /** Anchors for the symbols this instance may serve. */
  anchors: readonly SymbolAnchor[]
  /** Injected so tests are deterministic. Defaults to `Math.random`. */
  random?: () => number
}

/**
 * A bounded step. The walk is multiplicative so a ₹22 stock and a ₹1,32,000 one
 * move by comparable *proportions* rather than comparable rupees, and it is
 * clamped to ±5% of the session anchor so a long run cannot drift into fantasy.
 */
function nextPrice(current: number, anchor: number, random: () => number): number {
  // Box–Muller would be more faithful, but a sum of uniforms is enough for a
  // plausible-looking walk and keeps the step bounded by construction.
  const drift = (random() + random() + random() - 1.5) * 2 * SIMULATOR_STEP_VOLATILITY
  const stepped = current * (1 + drift)

  const floor = anchor * (1 - SIMULATOR_MAX_MOVE_PCT)
  const ceiling = anchor * (1 + SIMULATOR_MAX_MOVE_PCT)
  const bounded = Math.min(Math.max(stepped, floor), ceiling)

  // Two decimals, because that is the precision `quotes.ltp` stores. Rounding
  // here rather than at the database keeps the walk's own state honest: an
  // unrounded series would drift away from the prices actually recorded.
  return Math.round(bounded * 100) / 100
}

export function createSimulatorProvider(options: SimulatorOptions): QuoteProvider {
  const random = options.random ?? Math.random
  const anchors = new Map(options.anchors.map((anchor) => [anchor.symbol, anchor]))

  /** The price each symbol is currently at, carried across calls. */
  const current = new Map<string, number>()

  function seedFor(symbol: string): number | null {
    const anchor = anchors.get(symbol)
    if (!anchor) return null
    // Last observed price first, falling back to the published close. With
    // neither, this symbol has no basis for a price and is skipped — inventing
    // one is the thing this provider must not do.
    return anchor.lastPrice ?? anchor.prevClose
  }

  return {
    name: 'SIMULATOR',

    async isAvailable(symbols) {
      // Available only for symbols it can actually anchor. A fresh listing with
      // no close and no prior quote makes it unavailable rather than creative.
      return symbols.some((symbol) => seedFor(symbol) !== null)
    },

    async fetchQuotes(symbols) {
      const quotes: ProviderQuote[] = []

      for (const symbol of symbols) {
        const seed = seedFor(symbol)
        if (seed === null) continue

        const anchor = anchors.get(symbol)?.prevClose ?? seed
        const price = nextPrice(current.get(symbol) ?? seed, anchor, random)
        current.set(symbol, price)

        quotes.push({
          symbol,
          ltp: price,
          prevClose: anchors.get(symbol)?.prevClose ?? null,
          dayOpen: null,
          dayHigh: null,
          dayLow: null,
          volume: null,
          // No upstream clock exists to report. deriveSource() renders every
          // quote from this provider as SIMULATED anyway.
          providerTs: null,
        })
      }

      return quotes
    },
  }
}
