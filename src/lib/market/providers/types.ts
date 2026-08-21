import type { QuoteProviderName } from '@/lib/market/provenance'

/**
 * The seam a real provider drops into.
 *
 * It exists before there is anything to put in it, deliberately: Yahoo is
 * deferred to the end of the project (F14), and retrofitting a chain around a
 * hardcoded simulator is worse than the interface costing a little now. What is
 * *not* built yet is the token-bucket limiter — a rate limiter in front of a
 * local simulator caps nothing, so it waits for a provider that makes outbound
 * requests.
 */

/** One symbol's price as a provider reported it. */
export type ProviderQuote = {
  symbol: string
  ltp: number
  prevClose: number | null
  dayOpen: number | null
  dayHigh: number | null
  dayLow: number | null
  volume: number | null
  /** The provider's own timestamp. Null when it has no upstream clock to report. */
  providerTs: Date | null
}

export type QuoteProvider = {
  readonly name: QuoteProviderName
  /**
   * Whether this provider could serve a request right now — configured, and
   * holding whatever data it needs. The chain's circuit breaker is separate:
   * this answers "can it", not "should we".
   */
  isAvailable(symbols: readonly string[]): Promise<boolean>
  /**
   * Quotes for as many of `symbols` as it can serve. A provider may return
   * fewer than asked for; it must never invent a symbol it was not given.
   * Throws to signal failure — the chain catches and trips the breaker.
   */
  fetchQuotes(symbols: readonly string[]): Promise<ProviderQuote[]>
}

/** What the simulator needs to know about a symbol before it can walk. */
export type SymbolAnchor = {
  symbol: string
  /** Last observed price, from `quotes`. */
  lastPrice: number | null
  /** Last published NSE close, from `instruments.prev_close` (F15). */
  prevClose: number | null
}
