import { describe, expect, it } from 'vitest'

import { QUOTE_DELAYED_WINDOW_MS, QUOTE_LIVE_WINDOW_MS } from '@/lib/constants'
import { deriveSource, worstSource, type QuoteProviderName } from '@/lib/market/provenance'

const NOW = new Date('2026-08-21T10:00:00Z')
const agoMs = (ms: number) => new Date(NOW.getTime() - ms)

describe('deriveSource', () => {
  it('never labels simulated data as anything else', () => {
    expect(deriveSource('SIMULATOR', null, NOW)).toBe('SIMULATED')
    // Even handed a fresh timestamp, a simulated price stays SIMULATED.
    expect(deriveSource('SIMULATOR', NOW, NOW)).toBe('SIMULATED')
  })

  it('treats a missing provider timestamp as stale, not fresh', () => {
    expect(deriveSource('YAHOO', null, NOW)).toBe('STALE')
  })

  it('badges a recent polled quote DELAYED', () => {
    expect(deriveSource('YAHOO', agoMs(60_000), NOW)).toBe('DELAYED')
  })

  it('badges anything past the delayed window STALE', () => {
    expect(deriveSource('YAHOO', agoMs(QUOTE_DELAYED_WINDOW_MS + 1), NOW)).toBe('STALE')
    expect(deriveSource('YAHOO', agoMs(QUOTE_DELAYED_WINDOW_MS), NOW)).toBe('DELAYED')
  })

  it('is not fooled by a timestamp in the future', () => {
    // A provider clock running ahead yields a negative age. That is not
    // grounds for promotion — the best it can be is DELAYED.
    expect(deriveSource('YAHOO', new Date(NOW.getTime() + 60_000), NOW)).toBe('DELAYED')
  })

  /**
   * The guarantee the whole module exists for. No provider declares itself
   * realtime, so no combination of provider and age can produce LIVE — and if
   * someone ever flips one to realtime, this test is what makes them notice.
   */
  it('cannot produce LIVE for any provider at any age', () => {
    const providers: QuoteProviderName[] = ['YAHOO', 'TWELVE_DATA', 'SIMULATOR']
    const ages = [0, 1, QUOTE_LIVE_WINDOW_MS - 1, QUOTE_LIVE_WINDOW_MS, 60_000]

    for (const provider of providers) {
      for (const age of ages) {
        expect(deriveSource(provider, agoMs(age), NOW), `${provider} @ ${age}ms`).not.toBe('LIVE')
      }
    }
  })
})

describe('worstSource', () => {
  it('reports the worst source on screen, not the best', () => {
    expect(worstSource(['DELAYED', 'SIMULATED', 'DELAYED'])).toBe('SIMULATED')
    expect(worstSource(['SIMULATED', 'STALE'])).toBe('STALE')
    expect(worstSource(['DELAYED', 'DELAYED'])).toBe('DELAYED')
  })

  it('is pessimistic about an empty screen', () => {
    expect(worstSource([])).toBe('STALE')
  })
})
