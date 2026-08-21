import { QUOTE_DELAYED_WINDOW_MS, QUOTE_LIVE_WINDOW_MS } from './market-constants.ts'

/**
 * The honesty guarantee, implemented as a derivation rather than a stored flag.
 *
 * `quotes` deliberately has no `source` column: freshness is a function of the
 * current time, so a row written as LIVE is stale minutes later with no write to
 * invalidate it. Storing the badge would make it wrong by default
 * (`architecture.md` → Quote Provenance).
 */

export type QuoteSource = 'LIVE' | 'DELAYED' | 'STALE' | 'SIMULATED'

export type QuoteProviderName = 'YAHOO' | 'TWELVE_DATA' | 'SIMULATOR'

export type Provenance = {
  source: QuoteSource
  provider: QuoteProviderName
  providerTs: Date | null
  fetchedAt: Date
  /** True when the figure on screen came from F19's interpolation loop. */
  isInterpolated: boolean
}

/**
 * A provider declares the best latency it can achieve, and only a genuinely
 * streaming one may ever qualify as LIVE.
 *
 * Every entry is `false`, and that is not an oversight: all three poll a REST
 * endpoint. **`LIVE` is therefore unreachable in this build**, which is the
 * point — a LIVE badge over a polled endpoint would be the exact dishonesty the
 * badge exists to prevent. `TWELVE_DATA` is listed because the database enum
 * still carries it; the provider itself is not built (F14 found its free plan
 * serves no NSE symbol).
 */
const PROVIDER_IS_REALTIME: Record<QuoteProviderName, boolean> = {
  YAHOO: false,
  TWELVE_DATA: false,
  SIMULATOR: false,
}

export function deriveSource(
  provider: QuoteProviderName,
  providerTs: Date | null,
  now: Date
): QuoteSource {
  // Simulated data is never dressed up as anything else, whatever its age.
  if (provider === 'SIMULATOR') return 'SIMULATED'

  // A real provider that reported no timestamp cannot be vouched for.
  if (!providerTs) return 'STALE'

  const age = now.getTime() - providerTs.getTime()
  if (age > QUOTE_DELAYED_WINDOW_MS) return 'STALE'
  if (age <= QUOTE_LIVE_WINDOW_MS && PROVIDER_IS_REALTIME[provider]) return 'LIVE'
  return 'DELAYED'
}

/** Rank used by the shell badge, which reports the worst source on screen. */
const SEVERITY: Record<QuoteSource, number> = {
  LIVE: 0,
  DELAYED: 1,
  SIMULATED: 2,
  STALE: 3,
}

/**
 * The worst provenance among the symbols on screen.
 *
 * A summary, never a substitute: every individual price still resolves its own
 * source. Empty input reports STALE — with nothing to vouch for, the honest
 * answer is the pessimistic one.
 */
export function worstSource(sources: readonly QuoteSource[]): QuoteSource {
  return sources.reduce<QuoteSource>(
    (worst, source) => (SEVERITY[source] > SEVERITY[worst] ? source : worst),
    sources.length === 0 ? 'STALE' : 'LIVE'
  )
}
