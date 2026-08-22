import { describe, expect, it } from 'vitest'

import { TWEEN_DURATION_MS, easeOutCubic, isTweening, tweenAt } from '@/lib/market/interpolate'
import { dayChange } from '@/lib/market/change'

describe('the tween between anchors', () => {
  it('starts at the old anchor and ends at the new one', () => {
    expect(tweenAt(100, 110, 0)).toBe(100)
    expect(tweenAt(100, 110, TWEEN_DURATION_MS)).toBe(110)
  })

  it('never leaves the interval between the two anchors', () => {
    // The invariant the whole module exists for, and the replacement for the
    // "small band" the build plan used to describe. A value outside this range
    // is a price the market never traded at.
    const pairs: readonly (readonly [number, number])[] = [
      [100, 110],
      [110, 100], // falling
      [2450.5, 2450.55], // a tick smaller than the rounding
      [0.05, 0.1],
    ]
    for (const [from, to] of pairs) {
      const low = Math.min(from, to)
      const high = Math.max(from, to)
      for (let elapsed = -500; elapsed <= TWEEN_DURATION_MS * 2; elapsed += 17) {
        const value = tweenAt(from, to, elapsed)
        expect(value).toBeGreaterThanOrEqual(low)
        expect(value).toBeLessThanOrEqual(high)
      }
    }
  })

  it('lands exactly on the anchor for a late frame rather than overshooting', () => {
    // A backgrounded tab resumes with a huge elapsed. Extrapolating there would
    // put a price on screen beyond anything observed.
    expect(tweenAt(100, 110, 10 ** 9)).toBe(110)
    expect(tweenAt(110, 100, 10 ** 9)).toBe(100)
  })

  it('clamps a negative elapsed to the start', () => {
    // Clock skew between performance.now() readings, not a hypothetical.
    expect(tweenAt(100, 110, -1)).toBe(100)
  })

  it('moves monotonically toward the new anchor', () => {
    let previous = tweenAt(100, 110, 0)
    for (let elapsed = 0; elapsed <= TWEEN_DURATION_MS; elapsed += 25) {
      const value = tweenAt(100, 110, elapsed)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
  })

  it('treats a zero duration as already arrived', () => {
    expect(tweenAt(100, 110, 0, 0)).toBe(110)
  })

  it('eases out, so the first half covers more than half the distance', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('reports when a tween is still running', () => {
    expect(isTweening(0)).toBe(true)
    expect(isTweening(TWEEN_DURATION_MS)).toBe(false)
  })
})

describe('the recomputed day change', () => {
  it('agrees with the price it is derived from', () => {
    expect(dayChange(110, 100)).toEqual({ change: 10, changePct: 10 })
  })

  it('is negative on a fall', () => {
    const result = dayChange(90, 100)
    expect(result?.change).toBe(-10)
    expect(result?.changePct).toBe(-10)
  })

  it('refuses to state a change it cannot honestly compute', () => {
    // A zero would read as "unchanged", which is a claim about the market
    // rather than an absence of data — the same call the SQL view makes.
    expect(dayChange(null, 100)).toBeNull()
    expect(dayChange(110, null)).toBeNull()
    expect(dayChange(110, 0)).toBeNull()
  })
})
