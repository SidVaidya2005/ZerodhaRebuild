import type { ProviderQuote, QuoteProvider } from './providers/types'

/**
 * Walks the providers in order and returns the first usable answer, with a
 * circuit breaker per provider.
 *
 * The breaker is the piece F14 paid for. A 200-symbol probe got Yahoo to block
 * this machine's IP for over forty minutes, and the failure mode that matters is
 * not one bad response — it is continuing to hammer an upstream that has already
 * said no, which is what keeps the block alive. An open circuit means the chain
 * stops asking until the cool-off elapses.
 *
 * Time is injected. A breaker tested with real timers is a breaker tested with
 * sleeps, and those tests are slow and flaky.
 */

export type CircuitState = 'CLOSED' | 'OPEN'

export type QuoteServiceOptions = {
  /** Tried in order. The last should be one that cannot fail — the simulator. */
  providers: readonly QuoteProvider[]
  /** Consecutive failures that trip a provider's circuit. */
  failureThreshold?: number
  /** How long a tripped circuit stays open. */
  cooldownMs?: number
  /** Injected clock, so cool-off is testable without waiting. */
  now?: () => number
}

export type QuoteResult = {
  quotes: ProviderQuote[]
  /** Which provider answered, or null when every one of them declined. */
  provider: QuoteProvider['name'] | null
  /** Providers that threw or were skipped, in the order they were tried. */
  attempted: { name: QuoteProvider['name']; outcome: 'OPEN_CIRCUIT' | 'UNAVAILABLE' | 'FAILED' }[]
}

const DEFAULT_FAILURE_THRESHOLD = 2
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000

export function createQuoteService(options: QuoteServiceOptions) {
  const failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const now = options.now ?? Date.now

  const failures = new Map<string, number>()
  const openedAt = new Map<string, number>()

  function circuitState(name: string): CircuitState {
    const opened = openedAt.get(name)
    if (opened === undefined) return 'CLOSED'
    if (now() - opened >= cooldownMs) {
      // Cool-off elapsed: close the circuit and give the provider a clean slate,
      // so one stale failure does not immediately re-trip it.
      openedAt.delete(name)
      failures.delete(name)
      return 'CLOSED'
    }
    return 'OPEN'
  }

  function recordFailure(name: string): void {
    const count = (failures.get(name) ?? 0) + 1
    failures.set(name, count)
    if (count >= failureThreshold) openedAt.set(name, now())
  }

  return {
    /** Exposed for the tick's logging and for tests; not for callers to branch on. */
    circuitState,

    async getQuotes(symbols: readonly string[]): Promise<QuoteResult> {
      const attempted: QuoteResult['attempted'] = []
      if (symbols.length === 0) return { quotes: [], provider: null, attempted }

      for (const provider of options.providers) {
        if (circuitState(provider.name) === 'OPEN') {
          attempted.push({ name: provider.name, outcome: 'OPEN_CIRCUIT' })
          continue
        }

        try {
          if (!(await provider.isAvailable(symbols))) {
            // Not a failure: a provider with no key, or no anchor for these
            // symbols, is correctly declining rather than breaking.
            attempted.push({ name: provider.name, outcome: 'UNAVAILABLE' })
            continue
          }

          const quotes = await provider.fetchQuotes(symbols)
          if (quotes.length === 0) {
            attempted.push({ name: provider.name, outcome: 'FAILED' })
            recordFailure(provider.name)
            continue
          }

          // A provider that answers clears its own failure count. The breaker
          // counts *consecutive* failures, not lifetime ones.
          failures.delete(provider.name)
          return { quotes, provider: provider.name, attempted }
        } catch {
          // Deliberately swallowed: the raw upstream error is the chain's
          // business, not the caller's. The tick logs the attempt trail.
          attempted.push({ name: provider.name, outcome: 'FAILED' })
          recordFailure(provider.name)
        }
      }

      return { quotes: [], provider: null, attempted }
    },
  }
}
