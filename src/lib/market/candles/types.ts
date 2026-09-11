import type { QuoteProviderName } from '@shared/provenance.ts'

/**
 * The candle pipeline's vocabulary.
 *
 * This lives in `src/lib/market/`, not in `supabase/functions/_shared/`, because
 * nothing Deno-side reads candles: `getCandles` runs in Next's server and
 * retention is `prune_candles()` in Postgres. The quote chain sits in `_shared`
 * only because the Edge Function runs it.
 */

/** The three stored intervals, matching the `candle_interval` enum. */
export type CandleInterval = 'FIVE_MIN' | 'THIRTY_MIN' | 'ONE_DAY'

/** The four ranges the UI offers. */
export type CandleRange = '1D' | '1W' | '1M' | '1Y'

/**
 * Four ranges over three intervals. **1M and 1Y are the same stored series** —
 * one year of dailies, windowed differently — so switching between them must
 * cost no fetch at all.
 */
export const RANGE_INTERVAL: Record<CandleRange, CandleInterval> = {
  '1D': 'FIVE_MIN',
  '1W': 'THIRTY_MIN',
  '1M': 'ONE_DAY',
  '1Y': 'ONE_DAY',
}

/** How many trading days of the stored series each range renders. */
export const RANGE_TRADING_DAYS: Record<CandleRange, number> = {
  '1D': 1,
  '1W': 5,
  '1M': 22,
  '1Y': 250,
}

/**
 * One OHLC bar as a provider reports it.
 *
 * `ts` is the candle's **open** time, as milliseconds since the epoch. The
 * conversion to what Lightweight Charts wants — unix seconds for intraday,
 * `'YYYY-MM-DD'` for daily — happens at the render boundary, because mixing the
 * two forms in one series silently drops points.
 */
export type ProviderCandle = {
  ts: number
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

/**
 * What a provider is asked for.
 *
 * The simulator needs all four; Yahoo will need only `symbol` and `interval`
 * and will ignore the rest, because it returns whatever history it has and the
 * service filters. Passing the slots anyway is what lets the simulator honour
 * the trading calendar without importing it.
 */
export type CandleRequest = {
  /** Candle open times the series should cover, oldest first. */
  slots: readonly number[]
  /** Close of the bar before `slots[0]`, when one is already stored. */
  startClose: number | null
  /** The price the page is showing, which the final bar must land on. */
  endClose: number | null
  tickSize: number
}

/**
 * The seam Yahoo drops into later.
 *
 * Deliberately the same shape as `QuoteProvider`: `isAvailable()` lets a
 * provider excuse itself — an unset key, a tripped breaker — so the chain skips
 * it silently rather than counting a decline as a failure.
 *
 * **No token bucket and no circuit breaker here.** F15 established that a
 * limiter in front of a local simulator caps nothing; both arrive with the first
 * provider that makes an outbound request.
 */
export type CandleProvider = {
  name: QuoteProviderName
  isAvailable: () => Promise<boolean>
  fetchCandles: (
    symbol: string,
    interval: CandleInterval,
    request: CandleRequest
  ) => Promise<ProviderCandle[]>
}
