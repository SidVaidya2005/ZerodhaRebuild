import { describe, expect, it } from 'vitest'

import { fromIstDate } from './slots'
import { isFresh } from './freshness'

const NONE: ReadonlySet<string> = new Set()
const HOLIDAYS: ReadonlySet<string> = new Set(['2026-01-26'])
const ist = (date: string, minutes: number) => fromIstDate(date, minutes)

describe('never fetched', () => {
  it('is never fresh', () => {
    expect(isFresh('ONE_DAY', null, ist('2026-01-13', 600), NONE)).toBe(false)
    expect(isFresh('FIVE_MIN', null, ist('2026-01-13', 600), NONE)).toBe(false)
  })
})

describe('intraday', () => {
  it('goes stale after its TTL during a session', () => {
    const at = ist('2026-01-13', 11 * 60)
    expect(isFresh('FIVE_MIN', new Date(at.getTime() - 4 * 60_000), at, NONE)).toBe(true)
    expect(isFresh('FIVE_MIN', new Date(at.getTime() - 6 * 60_000), at, NONE)).toBe(false)
    expect(isFresh('THIRTY_MIN', new Date(at.getTime() - 29 * 60_000), at, NONE)).toBe(true)
    expect(isFresh('THIRTY_MIN', new Date(at.getTime() - 31 * 60_000), at, NONE)).toBe(false)
  })

  it('stays fresh outside a session however old it is', () => {
    // The weekend case: nothing new has printed, so re-fetching an unchanged
    // Friday on every visit would be pure waste.
    const sunday = ist('2026-01-11', 12 * 60)
    expect(isFresh('FIVE_MIN', ist('2026-01-09', 15 * 60 + 25), sunday, NONE)).toBe(true)
  })

  it('stays fresh on a published closure', () => {
    const holiday = ist('2026-01-26', 12 * 60)
    expect(isFresh('FIVE_MIN', ist('2026-01-23', 15 * 60), holiday, HOLIDAYS)).toBe(true)
  })

  it('stays fresh before the open and goes stale after it', () => {
    expect(isFresh('FIVE_MIN', ist('2026-01-12', 15 * 60), ist('2026-01-13', 8 * 60), NONE)).toBe(
      true
    )
    expect(isFresh('FIVE_MIN', ist('2026-01-12', 15 * 60), ist('2026-01-13', 10 * 60), NONE)).toBe(
      false
    )
  })
})

describe('daily', () => {
  it('is fresh for the rest of the IST day it was fetched on', () => {
    expect(isFresh('ONE_DAY', ist('2026-01-13', 9 * 60), ist('2026-01-13', 23 * 60), NONE)).toBe(
      true
    )
  })

  it('goes stale on the next day', () => {
    expect(isFresh('ONE_DAY', ist('2026-01-12', 16 * 60), ist('2026-01-14', 10 * 60), NONE)).toBe(
      false
    )
  })

  it('survives the night after a post-close fetch', () => {
    // Fetched at 15:35, read at 09:00 next morning: before the open there is no
    // new daily bar, so a flat 24-hour age would re-fetch for nothing.
    expect(
      isFresh('ONE_DAY', ist('2026-01-13', 15 * 60 + 35), ist('2026-01-14', 9 * 60), NONE)
    ).toBe(true)
  })
})

describe('a clock that went backwards', () => {
  it('treats a future timestamp as fresh rather than looping on it', () => {
    const at = ist('2026-01-13', 11 * 60)
    expect(isFresh('FIVE_MIN', new Date(at.getTime() + 60_000), at, NONE)).toBe(true)
  })
})
