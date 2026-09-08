import { describe, expect, it } from 'vitest'

import { marketStatusAt } from '@/lib/market/market-hours'
import {
  formatCountdown,
  squareOffCountdownAt,
  squareOffRefreshMs,
} from '@/lib/terminal/square-off'

/**
 * 2026-09-08 is a Tuesday and is not in the seeded calendar, so it is a normal
 * trading day. IST is UTC+5:30 throughout the year, which is what lets these
 * instants be written in UTC without a timezone library.
 */
const NO_HOLIDAYS = new Set<string>()

/** `HH:MM` IST on that Tuesday, as a UTC instant. */
function ist(hours: number, minutes: number): Date {
  const totalMinutes = hours * 60 + minutes - (5 * 60 + 30)
  return new Date(Date.UTC(2026, 8, 8, 0, totalMinutes, 0, 0))
}

function countdownAt(at: Date) {
  return squareOffCountdownAt(at, marketStatusAt(at, NO_HOLIDAYS))
}

describe('the countdown to 15:20', () => {
  it('counts down during a live session', () => {
    const result = countdownAt(ist(15, 0))

    expect(result.kind).toBe('PENDING')
    // Exactly twenty minutes, in ms — read off SQUARE_OFF_TIME_IST rather than
    // restated here, so the banner cannot promise a time the sweep ignores.
    if (result.kind === 'PENDING') expect(result.msRemaining).toBe(20 * 60 * 1_000)
  })

  it('reports the sweep as due at 15:20 exactly', () => {
    // The boundary belongs to DUE: at 15:20:00 the job's own gate has opened.
    expect(countdownAt(ist(15, 20)).kind).toBe('DUE')
  })

  it('stays due between 15:20 and the close', () => {
    expect(countdownAt(ist(15, 25)).kind).toBe('DUE')
  })

  it('says nothing before the session opens', () => {
    // Pre-open is not a session, and nothing is squared off during it.
    expect(countdownAt(ist(9, 0)).kind).toBe('IDLE')
  })

  it('says nothing after the close', () => {
    expect(countdownAt(ist(15, 45)).kind).toBe('IDLE')
  })

  it('says nothing on a weekend', () => {
    // 2026-09-06 is a Sunday. Counting down to "today's" 15:20 would be
    // counting to a boundary that does not exist.
    const sunday = new Date(Date.UTC(2026, 8, 6, 6, 0, 0))
    expect(squareOffCountdownAt(sunday, marketStatusAt(sunday, NO_HOLIDAYS)).kind).toBe('IDLE')
  })

  it('says nothing on a trading holiday', () => {
    const holiday = ist(12, 0)
    const status = marketStatusAt(holiday, new Set(['2026-09-08']))
    expect(squareOffCountdownAt(holiday, status).kind).toBe('IDLE')
  })
})

describe('how often the banner recomputes', () => {
  it('ticks once a second while counting down', () => {
    const at = ist(15, 0)
    const status = marketStatusAt(at, NO_HOLIDAYS)
    expect(squareOffRefreshMs(countdownAt(at), status, at)).toBe(1_000)
  })

  it('never schedules below the floor, so a stale clock cannot busy-loop', () => {
    const at = ist(15, 0)
    const status = marketStatusAt(at, NO_HOLIDAYS)
    expect(squareOffRefreshMs({ kind: 'PENDING', msRemaining: 10 }, status, at)).toBe(250)
  })

  it('falls back to the pill schedule when there is nothing to count', () => {
    // Idle overnight must not leave a per-second timer running.
    const at = ist(20, 0)
    const status = marketStatusAt(at, NO_HOLIDAYS)
    expect(squareOffRefreshMs({ kind: 'IDLE' }, status, at)).toBeGreaterThan(1_000)
  })
})

describe('formatting', () => {
  it('drops seconds above an hour, where they are noise', () => {
    expect(formatCountdown(2 * 3_600_000 + 5 * 60_000)).toBe('2h 05m')
  })

  it('shows seconds below an hour, where they are what is being watched', () => {
    expect(formatCountdown(4 * 60_000 + 12_000)).toBe('04m 12s')
  })

  it('rounds up, so it never reads zero while the sweep has not run', () => {
    expect(formatCountdown(1)).toBe('00m 01s')
  })

  it('floors at zero rather than rendering a negative', () => {
    expect(formatCountdown(-5_000)).toBe('00m 00s')
  })
})
