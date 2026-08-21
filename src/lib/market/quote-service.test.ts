import { describe, expect, it } from 'vitest'

import { createSimulatorProvider } from '@/lib/market/providers/simulator'
import type { ProviderQuote, QuoteProvider } from '@/lib/market/providers/types'
import { createQuoteService } from '@/lib/market/quote-service'

const ANCHORS = [{ symbol: 'RELIANCE', lastPrice: null, prevClose: 1316 }]

/** A provider whose behaviour each test dictates, and which counts its calls. */
function fakeProvider(
  name: QuoteProvider['name'],
  behaviour: { available?: boolean; throws?: boolean; quotes?: ProviderQuote[] } = {}
) {
  let calls = 0
  const provider: QuoteProvider = {
    name,
    async isAvailable() {
      return behaviour.available ?? true
    },
    async fetchQuotes(symbols) {
      calls += 1
      if (behaviour.throws) throw new Error('upstream said no')
      return (
        behaviour.quotes ??
        symbols.map((symbol) => ({
          symbol,
          ltp: 100,
          prevClose: null,
          dayOpen: null,
          dayHigh: null,
          dayLow: null,
          volume: null,
          providerTs: new Date(),
        }))
      )
    },
  }
  return { provider, calls: () => calls }
}

function simulator() {
  return createSimulatorProvider({ anchors: ANCHORS, random: () => 0.5 })
}

describe('walking the chain', () => {
  it('uses the first provider that answers', async () => {
    const first = fakeProvider('YAHOO')
    const service = createQuoteService({ providers: [first.provider, simulator()] })

    const result = await service.getQuotes(['RELIANCE'])
    expect(result.provider).toBe('YAHOO')
    expect(result.quotes).toHaveLength(1)
  })

  it('falls through to the simulator when the first one throws', async () => {
    const broken = fakeProvider('YAHOO', { throws: true })
    const service = createQuoteService({ providers: [broken.provider, simulator()] })

    const result = await service.getQuotes(['RELIANCE'])
    expect(result.provider).toBe('SIMULATOR')
    expect(result.attempted).toEqual([{ name: 'YAHOO', outcome: 'FAILED' }])
  })

  it('skips an unavailable provider without counting it as a failure', async () => {
    // A provider with no key is declining, not breaking — it must not trip.
    const unconfigured = fakeProvider('TWELVE_DATA', { available: false })
    const service = createQuoteService({ providers: [unconfigured.provider, simulator()] })

    await service.getQuotes(['RELIANCE'])
    await service.getQuotes(['RELIANCE'])
    await service.getQuotes(['RELIANCE'])

    expect(service.circuitState('TWELVE_DATA')).toBe('CLOSED')
  })

  it('reports no provider when every one of them declines', async () => {
    const none = fakeProvider('YAHOO', { available: false })
    const result = await createQuoteService({ providers: [none.provider] }).getQuotes(['RELIANCE'])

    expect(result.provider).toBeNull()
    expect(result.quotes).toEqual([])
  })

  it('asks nobody for an empty symbol list', async () => {
    const first = fakeProvider('YAHOO')
    const result = await createQuoteService({ providers: [first.provider] }).getQuotes([])

    expect(first.calls()).toBe(0)
    expect(result.provider).toBeNull()
  })
})

describe('the circuit breaker', () => {
  it('opens after the threshold and then stops calling the provider', async () => {
    const broken = fakeProvider('YAHOO', { throws: true })
    const service = createQuoteService({
      providers: [broken.provider, simulator()],
      failureThreshold: 2,
    })

    await service.getQuotes(['RELIANCE'])
    expect(service.circuitState('YAHOO')).toBe('CLOSED')

    await service.getQuotes(['RELIANCE'])
    expect(service.circuitState('YAHOO')).toBe('OPEN')

    // The claim that matters: an open circuit means we stop asking. Continuing
    // to hammer an upstream that already said no is what keeps a block alive.
    const callsWhenOpen = broken.calls()
    const result = await service.getQuotes(['RELIANCE'])
    expect(broken.calls()).toBe(callsWhenOpen)
    expect(result.provider).toBe('SIMULATOR')
    expect(result.attempted).toEqual([{ name: 'YAHOO', outcome: 'OPEN_CIRCUIT' }])
  })

  it('closes again once the cool-off has elapsed', async () => {
    let clock = 0
    const broken = fakeProvider('YAHOO', { throws: true })
    const service = createQuoteService({
      providers: [broken.provider, simulator()],
      failureThreshold: 1,
      cooldownMs: 60_000,
      now: () => clock,
    })

    await service.getQuotes(['RELIANCE'])
    expect(service.circuitState('YAHOO')).toBe('OPEN')

    clock += 59_999
    expect(service.circuitState('YAHOO')).toBe('OPEN')

    clock += 1
    expect(service.circuitState('YAHOO')).toBe('CLOSED')

    // And it really is retried, not merely reported closed.
    const before = broken.calls()
    await service.getQuotes(['RELIANCE'])
    expect(broken.calls()).toBe(before + 1)
  })

  it('counts consecutive failures, not lifetime ones', async () => {
    let shouldThrow = true
    const flaky: QuoteProvider = {
      name: 'YAHOO',
      async isAvailable() {
        return true
      },
      async fetchQuotes(symbols) {
        if (shouldThrow) throw new Error('upstream said no')
        return symbols.map((symbol) => ({
          symbol,
          ltp: 1,
          prevClose: null,
          dayOpen: null,
          dayHigh: null,
          dayLow: null,
          volume: null,
          providerTs: new Date(),
        }))
      },
    }
    const service = createQuoteService({ providers: [flaky, simulator()], failureThreshold: 2 })

    await service.getQuotes(['RELIANCE']) // fail 1
    shouldThrow = false
    await service.getQuotes(['RELIANCE']) // success resets the count
    shouldThrow = true
    await service.getQuotes(['RELIANCE']) // fail 1 again, not 2

    expect(service.circuitState('YAHOO')).toBe('CLOSED')
  })

  it('treats an empty answer as a failure', async () => {
    // A provider returning nothing has not served the request, whatever it
    // says about itself — otherwise the chain would return an empty result
    // rather than falling through to the simulator.
    const empty = fakeProvider('YAHOO', { quotes: [] })
    const service = createQuoteService({ providers: [empty.provider, simulator()] })

    const result = await service.getQuotes(['RELIANCE'])
    expect(result.provider).toBe('SIMULATOR')
  })
})
