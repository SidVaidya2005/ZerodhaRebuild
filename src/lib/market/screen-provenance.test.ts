import { describe, expect, it } from 'vitest'

import {
  anchorProvenance,
  badgeSource,
  compositeSource,
  provenanceOf,
} from '@/lib/market/screen-provenance'
import type { LiveQuote } from '@/lib/stores/quote-store'

const NOW = new Date('2026-08-22T09:00:00Z')
const agoMs = (ms: number) => new Date(NOW.getTime() - ms)

function quote(overrides: Partial<LiveQuote> = {}): LiveQuote {
  return {
    anchor: 100,
    ltp: 100,
    prevClose: 95,
    provider: 'SIMULATOR',
    providerTs: null,
    fetchedAt: agoMs(1_000),
    direction: 'flat',
    from: 100,
    startedAt: 0,
    flashKey: 0,
    ...overrides,
  }
}

describe('the provenance of one figure', () => {
  it('reports interpolated exactly when the tween has not arrived', () => {
    expect(provenanceOf(quote({ ltp: 100, anchor: 100 }), NOW).isInterpolated).toBe(false)
    expect(provenanceOf(quote({ ltp: 99.4, anchor: 100 }), NOW).isInterpolated).toBe(true)
  })

  it('carries the provider and both timestamps', () => {
    const fetchedAt = agoMs(2_000)
    const providerTs = agoMs(60_000)
    const result = provenanceOf(quote({ provider: 'YAHOO', providerTs, fetchedAt }), NOW)
    expect(result).toMatchObject({ source: 'DELAYED', provider: 'YAHOO', providerTs, fetchedAt })
  })

  it('never dresses simulated data as anything else, however fresh', () => {
    expect(provenanceOf(quote({ provider: 'SIMULATOR', providerTs: NOW }), NOW).source).toBe(
      'SIMULATED'
    )
  })
})

describe('the shell badge', () => {
  it('reports the worst source among the prices on screen', () => {
    // One simulated symbol downgrades the whole badge.
    const source = badgeSource(
      {
        A: quote({ provider: 'YAHOO', providerTs: agoMs(60_000) }),
        B: quote({ provider: 'SIMULATOR' }),
      },
      NOW
    )
    expect(source).toBe('SIMULATED')
  })

  it('lets a stale price outrank a simulated one', () => {
    // STALE outranks SIMULATED in the severity table: a figure nothing has
    // refreshed is worse than one honestly labelled as generated.
    const source = badgeSource(
      {
        A: quote({ provider: 'SIMULATOR' }),
        B: quote({ provider: 'YAHOO', providerTs: agoMs(60 * 60 * 1000) }),
      },
      NOW
    )
    expect(source).toBe('STALE')
  })

  it('never reports LIVE, whatever is on screen', () => {
    // The failure this whole feature exists to prevent. No provider in this
    // build streams, so LIVE must be unreachable from the badge too.
    const source = badgeSource({ A: quote({ provider: 'YAHOO', providerTs: NOW }) }, NOW)
    expect(source).not.toBe('LIVE')
    expect(source).toBe('DELAYED')
  })

  it('reports nothing when no price is on screen', () => {
    // Not STALE. With no price rendered there is no claim to characterise, and
    // a STALE badge over an empty watchlist describes absent data rather than
    // anything the visitor is looking at.
    expect(badgeSource({}, NOW)).toBeNull()
  })

  it('recomputes with the clock rather than freezing', () => {
    // The same store, read at two instants, either side of the delayed window.
    const quotes = { A: quote({ provider: 'YAHOO', providerTs: agoMs(60_000) }) }
    expect(badgeSource(quotes, NOW)).toBe('DELAYED')
    expect(badgeSource(quotes, new Date(NOW.getTime() + 20 * 60 * 1000))).toBe('STALE')
  })
})

describe('the composite strip provenance', () => {
  it('is null when nothing is priced, so the strip claims nothing', () => {
    expect(compositeSource([], null, NOW)).toBeNull()
  })

  it('reports SIMULATED when every constituent is the simulator', () => {
    expect(compositeSource(['SIMULATOR'], null, NOW)).toBe('SIMULATED')
  })

  it('pairs every provider with the oldest timestamp, so one stale constituent taints the whole', () => {
    // 40 minutes is past the 15-minute delayed window, so Yahoo derives to
    // STALE — worse than the simulator's SIMULATED, and therefore the answer.
    expect(compositeSource(['SIMULATOR', 'YAHOO'], agoMs(40 * 60_000), NOW)).toBe('STALE')
  })

  it('errs downwards rather than upwards on a mixed set', () => {
    // Fresh enough that Yahoo alone would be DELAYED. SIMULATED is worse, and
    // the strip reports the worse one — it may under-claim, never over-claim.
    expect(compositeSource(['SIMULATOR', 'YAHOO'], agoMs(60_000), NOW)).toBe('SIMULATED')
    expect(compositeSource(['YAHOO'], agoMs(60_000), NOW)).toBe('DELAYED')
  })

  it('never reports LIVE, because no provider in this build streams', () => {
    expect(compositeSource(['YAHOO'], NOW, NOW)).toBe('DELAYED')
  })
})

describe('the provenance of an anchor-rendered figure', () => {
  it('reports as reported, even mid-tween', () => {
    // The trap this exists for: the store is tweening, so `provenanceOf` says
    // interpolated — but the caller is rendering `anchor`, which is exactly the
    // price the provider reported. Announcing it as synthetic would misdescribe
    // it, and every monetary surface renders the anchor.
    const tweening = quote({ ltp: 99.4, anchor: 100 })

    expect(provenanceOf(tweening, NOW).isInterpolated).toBe(true)
    expect(anchorProvenance(tweening, NOW).isInterpolated).toBe(false)
  })

  it('changes nothing else about the claim', () => {
    const providerTs = agoMs(60_000)
    const tweening = quote({ provider: 'YAHOO', providerTs, ltp: 99.4, anchor: 100 })

    expect(anchorProvenance(tweening, NOW)).toEqual({
      ...provenanceOf(tweening, NOW),
      isInterpolated: false,
    })
  })

  it('still never dresses simulated data as anything else', () => {
    expect(anchorProvenance(quote({ provider: 'SIMULATOR', providerTs: NOW }), NOW).source).toBe(
      'SIMULATED'
    )
  })
})
