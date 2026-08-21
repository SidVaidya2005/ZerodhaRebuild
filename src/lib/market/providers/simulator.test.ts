import { describe, expect, it } from 'vitest'

import { SIMULATOR_MAX_MOVE_PCT } from '@/lib/constants'
import { createSimulatorProvider } from '@/lib/market/providers/simulator'
import { deriveSource } from '@/lib/market/provenance'

/** A deterministic stand-in for Math.random, so a series is reproducible. */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    // mulberry32 — small, fast, and good enough for a plausible walk.
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RELIANCE = { symbol: 'RELIANCE', lastPrice: null, prevClose: 1316 }
const MRF = { symbol: 'MRF', lastPrice: null, prevClose: 132665 }
const YESBANK = { symbol: 'YESBANK', lastPrice: null, prevClose: 22.8 }

describe('anchoring', () => {
  it('starts each symbol near its own real close, not a shared constant', async () => {
    const provider = createSimulatorProvider({
      anchors: [MRF, YESBANK],
      random: seededRandom(1),
    })
    const [mrf, yes] = await provider.fetchQuotes(['MRF', 'YESBANK'])

    // The spread between these two is the whole argument for prev_close: a
    // fixed base would price both the same and make Phase 5 meaningless.
    expect(mrf!.ltp).toBeGreaterThan(100_000)
    expect(yes!.ltp).toBeLessThan(30)
  })

  it('prefers the last observed price over the published close', async () => {
    const provider = createSimulatorProvider({
      anchors: [{ symbol: 'RELIANCE', lastPrice: 1400, prevClose: 1316 }],
      random: seededRandom(2),
    })
    const [quote] = await provider.fetchQuotes(['RELIANCE'])
    // Continues from where trading actually got to, not from yesterday.
    expect(quote!.ltp).toBeGreaterThan(1350)
  })

  it('refuses to invent a price when it has no anchor at all', async () => {
    const provider = createSimulatorProvider({
      anchors: [{ symbol: 'NEWLISTING', lastPrice: null, prevClose: null }],
      random: seededRandom(3),
    })
    expect(await provider.isAvailable(['NEWLISTING'])).toBe(false)
    expect(await provider.fetchQuotes(['NEWLISTING'])).toEqual([])
  })

  it('never returns a symbol it was not asked for', async () => {
    const provider = createSimulatorProvider({
      anchors: [RELIANCE, MRF],
      random: seededRandom(4),
    })
    const quotes = await provider.fetchQuotes(['RELIANCE'])
    expect(quotes.map((q) => q.symbol)).toEqual(['RELIANCE'])
  })
})

describe('the walk', () => {
  it('is deterministic for a given seed', async () => {
    const run = async () => {
      const provider = createSimulatorProvider({ anchors: [RELIANCE], random: seededRandom(7) })
      const prices: number[] = []
      for (let i = 0; i < 50; i += 1) {
        const [quote] = await provider.fetchQuotes(['RELIANCE'])
        prices.push(quote!.ltp)
      }
      return prices
    }
    expect(await run()).toEqual(await run())
  })

  it('stays within ±5% of the anchor over ten thousand steps', async () => {
    const provider = createSimulatorProvider({ anchors: [RELIANCE], random: seededRandom(9) })
    const floor = 1316 * (1 - SIMULATOR_MAX_MOVE_PCT)
    const ceiling = 1316 * (1 + SIMULATOR_MAX_MOVE_PCT)

    let moved = false
    for (let i = 0; i < 10_000; i += 1) {
      const [quote] = await provider.fetchQuotes(['RELIANCE'])
      expect(quote!.ltp).toBeGreaterThanOrEqual(floor)
      expect(quote!.ltp).toBeLessThanOrEqual(ceiling)
      if (quote!.ltp !== 1316) moved = true
    }
    // A walk that never moves would satisfy the bounds trivially.
    expect(moved).toBe(true)
  })

  it('quotes at the two decimal places the database stores', async () => {
    const provider = createSimulatorProvider({ anchors: [MRF], random: seededRandom(11) })
    for (let i = 0; i < 100; i += 1) {
      const [quote] = await provider.fetchQuotes(['MRF'])
      expect(Number(quote!.ltp.toFixed(2))).toBe(quote!.ltp)
    }
  })
})

describe('honesty', () => {
  it('reports no provider timestamp and badges SIMULATED', async () => {
    const provider = createSimulatorProvider({ anchors: [RELIANCE], random: seededRandom(13) })
    const [quote] = await provider.fetchQuotes(['RELIANCE'])

    expect(provider.name).toBe('SIMULATOR')
    expect(quote!.providerTs).toBeNull()
    // The end-to-end guarantee: whatever this provider returns, the badge says
    // SIMULATED — never DELAYED, and never LIVE.
    expect(deriveSource(provider.name, quote!.providerTs, new Date())).toBe('SIMULATED')
  })
})
