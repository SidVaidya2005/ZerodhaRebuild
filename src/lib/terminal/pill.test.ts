import { describe, expect, it } from 'vitest'

import type { MarketStatus } from '@/lib/market/market-hours'
import { PILL_HEARTBEAT_MS, msUntilNextRecompute } from '@/lib/terminal/pill'

/** A status whose only field this function reads is `nextTransition`. */
function statusAt(nextTransition: string): MarketStatus {
  return {
    state: 'OPEN',
    nextTransition: new Date(nextTransition),
    istDate: '2026-08-20',
  }
}

const now = new Date('2026-08-20T06:00:00Z') // 11:30 IST, mid-session

describe('when the pill recomputes', () => {
  it('waits a heartbeat when the next transition is far off', () => {
    // 15:30 IST is four hours away; polling that far ahead is pointless, but a
    // pill that only recomputes at the transition would sit on a stale render
    // through a laptop sleep or a clock correction.
    expect(msUntilNextRecompute(statusAt('2026-08-20T10:00:00Z'), now)).toBe(PILL_HEARTBEAT_MS)
  })

  it('lands on the boundary rather than up to a heartbeat late', () => {
    // Twelve seconds to the open. A fixed 30s interval would show CLOSED for
    // eighteen seconds after the market opened — on the one transition anybody
    // is actually watching.
    expect(msUntilNextRecompute(statusAt('2026-08-20T06:00:12Z'), now)).toBe(12_000)
  })

  it('never returns zero or negative for a transition already past', () => {
    // Normal at load, not an edge case: the server renders a status, the browser
    // hydrates a moment later, and clock skew can put the transition behind us.
    // A zero delay here would spin the tab.
    const delay = msUntilNextRecompute(statusAt('2026-08-20T05:59:00Z'), now)
    expect(delay).toBeGreaterThan(0)
    expect(delay).toBeLessThanOrEqual(PILL_HEARTBEAT_MS)
  })

  it('never returns zero for a transition landing exactly now', () => {
    expect(msUntilNextRecompute(statusAt('2026-08-20T06:00:00Z'), now)).toBeGreaterThan(0)
  })

  it('never overshoots the transition', () => {
    // The property the two cases above are specific instances of: whatever the
    // gap, the pill must not schedule itself past the moment the state changes.
    for (const seconds of [1, 5, 12, 29, 30, 31, 120, 3600]) {
      const transition = new Date(now.getTime() + seconds * 1000)
      const delay = msUntilNextRecompute(statusAt(transition.toISOString()), now)
      expect(delay).toBeLessThanOrEqual(Math.max(1_000, seconds * 1000))
    }
  })
})
