import { beforeEach, describe, expect, it } from 'vitest'

import { TWEEN_DURATION_MS, hasActiveTween, useQuoteStore } from '@/lib/stores/quote-store'

const row = (ltp: number | null, prevClose: number | null = 100) => ({
  symbol: 'RELIANCE',
  ltp,
  prevClose,
  provider: 'SIMULATOR' as const,
  providerTs: null,
})

/** Narrowed: every caller below asserts on a row it has just written. */
function get() {
  const quote = useQuoteStore.getState().quotes.RELIANCE
  if (!quote) throw new Error('RELIANCE is not in the store')
  return quote
}

beforeEach(() => {
  useQuoteStore.setState({ quotes: {} })
})

describe('seeding from the server render', () => {
  it('adopts a price as an anchor without flashing', () => {
    // The visitor did not watch these arrive, so animating them would be theatre.
    useQuoteStore.getState().seedQuotes([row(105)])
    expect(get()).toMatchObject({ anchor: 105, ltp: 105, direction: 'flat', flashKey: 0 })
  })

  it('skips a symbol with no price rather than inventing a zero', () => {
    // Nine of the ten seeded symbols are in exactly this state.
    useQuoteStore.getState().seedQuotes([row(null)])
    expect(useQuoteStore.getState().quotes.RELIANCE).toBeUndefined()
  })

  it('never rewinds a live anchor', () => {
    // A second seed after the first tick — a navigation, say — must not put the
    // stale server render back on screen.
    useQuoteStore.getState().applyServerQuote(row(120))
    useQuoteStore.getState().seedQuotes([row(105)])
    expect(get().anchor).toBe(120)
  })
})

describe('applying a server tick', () => {
  it('records the direction of a rise', () => {
    useQuoteStore.getState().seedQuotes([row(100)])
    useQuoteStore.getState().applyServerQuote(row(110), { animate: true })
    expect(get()).toMatchObject({ anchor: 110, direction: 'up', flashKey: 1 })
  })

  it('records the direction of a fall', () => {
    useQuoteStore.getState().seedQuotes([row(100)])
    useQuoteStore.getState().applyServerQuote(row(90))
    expect(get()).toMatchObject({ anchor: 90, direction: 'down' })
  })

  it('does not flash when the tick rewrites the same price', () => {
    // The tick runs every minute whether or not the price moved. A rewrite of
    // the same number is not an up-tick and must not pretend to be one.
    useQuoteStore.getState().seedQuotes([row(100)])
    useQuoteStore.getState().applyServerQuote(row(100))
    expect(get()).toMatchObject({ direction: 'flat', flashKey: 0 })
  })

  it('starts the tween from what is on screen, not from the old anchor', () => {
    // A tick landing mid-tween must continue from where the eye last saw the
    // number rather than jumping backwards to restart.
    useQuoteStore.getState().seedQuotes([row(100)])
    useQuoteStore.getState().applyServerQuote(row(200), { animate: true })
    useQuoteStore.getState().advance(performance.now() + TWEEN_DURATION_MS / 2)
    const midway = get().ltp
    expect(midway).toBeGreaterThan(100)
    expect(midway).toBeLessThan(200)

    useQuoteStore.getState().applyServerQuote(row(300), { animate: true })
    expect(get().from).toBe(midway)
  })
})

describe('a tab nobody is watching', () => {
  it('jumps straight to the anchor rather than starting a tween that cannot run', () => {
    // A hidden tab receives no requestAnimationFrame callbacks at all, so a
    // tween started there would freeze at its first value and leave a stale
    // price on screen until the visitor came back.
    useQuoteStore.getState().seedQuotes([row(100)])
    useQuoteStore.getState().applyServerQuote(row(110), { animate: false })
    expect(get()).toMatchObject({ anchor: 110, ltp: 110, direction: 'up', flashKey: 1 })
    expect(hasActiveTween(useQuoteStore.getState().quotes)).toBe(false)
  })
})

describe('advancing the tween', () => {
  it('arrives at the anchor and then stops reporting work', () => {
    useQuoteStore.getState().seedQuotes([row(100)])
    useQuoteStore.getState().applyServerQuote(row(110), { animate: true })
    expect(hasActiveTween(useQuoteStore.getState().quotes)).toBe(true)

    useQuoteStore.getState().advance(performance.now() + TWEEN_DURATION_MS + 1)
    expect(get().ltp).toBe(110)
    expect(hasActiveTween(useQuoteStore.getState().quotes)).toBe(false)
  })

  it('leaves state identity untouched when nothing moved', () => {
    // The driver calls this every frame. Handing back a new object each time
    // would re-render every subscriber sixty times a second.
    useQuoteStore.getState().seedQuotes([row(100)])
    const before = useQuoteStore.getState().quotes
    useQuoteStore.getState().advance(performance.now())
    expect(useQuoteStore.getState().quotes).toBe(before)
  })

  it('gives a new identity only to the symbol that moved', () => {
    useQuoteStore
      .getState()
      .seedQuotes([
        row(100),
        { symbol: 'INFY', ltp: 50, prevClose: 50, provider: 'SIMULATOR', providerTs: null },
      ])
    useQuoteStore.getState().applyServerQuote(row(110), { animate: true })
    const before = useQuoteStore.getState().quotes
    useQuoteStore.getState().advance(performance.now() + TWEEN_DURATION_MS / 2)
    const after = useQuoteStore.getState().quotes

    expect(after.RELIANCE).not.toBe(before.RELIANCE)
    expect(after.INFY).toBe(before.INFY)
  })
})
