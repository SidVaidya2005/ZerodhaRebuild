import type { MarketStatus } from '@/lib/market/market-hours'

/**
 * How long the market-status pill should wait before recomputing.
 *
 * The pill exists because a server-rendered state goes stale: a tab left open
 * past 15:30, or a Render instance waking with a cached render, would keep
 * saying OPEN. Recomputing on a plain 30-second interval fixes that but flips
 * the pill up to 30 seconds late, which is visible on the one transition anybody
 * watches — the open. So the wait is the *shorter* of a heartbeat and the time
 * remaining to the next transition, and the pill lands on the boundary.
 *
 * Pure and separate from the component because tier 1 runs in node with no jsdom
 * (`constraints.md` → Testing), so this is the part of the pill a test can
 * actually drive.
 */

/** The heartbeat. Only relevant when the next transition is further away. */
export const PILL_HEARTBEAT_MS = 30_000

/**
 * Milliseconds until the pill should next recompute.
 *
 * Never negative and never zero: a transition already past, or landing exactly
 * now, yields a minimum delay rather than a `setTimeout(0)` loop that would spin
 * the tab. Clock skew between the server's render and the browser makes "already
 * past" a normal case at load, not an edge one.
 */
export function msUntilNextRecompute(status: MarketStatus, now: Date): number {
  const untilTransition = status.nextTransition.getTime() - now.getTime()
  if (untilTransition <= 0) return MIN_DELAY_MS
  return Math.max(MIN_DELAY_MS, Math.min(PILL_HEARTBEAT_MS, untilTransition))
}

/**
 * The floor. One second is long enough that a stale or skewed transition cannot
 * busy-loop the tab, and short enough to be invisible.
 */
const MIN_DELAY_MS = 1_000
