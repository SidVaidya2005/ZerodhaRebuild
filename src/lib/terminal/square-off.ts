import { SQUARE_OFF_TIME_IST } from '@/lib/constants'
import { istDayStart, type MarketStatus } from '@/lib/market/market-hours'

import { msUntilNextRecompute } from './pill'

/**
 * How long until the 15:20 square-off, for the banner on the positions page.
 *
 * Pure and separate from the component for the same reason `pill.ts` is: tier 1
 * runs in node with no jsdom (`constraints.md` → Testing), so this is the part a
 * test can actually drive.
 *
 * **The boundary is read off `SQUARE_OFF_TIME_IST` and `istDayStart`, never
 * recomputed here.** `square_off_mis(p_at)` gates on the same constant through
 * `market-constants.ts`, so the banner cannot promise a time the sweep does not
 * act on. Nothing in this module decides *whether* a position is closed — that
 * is the Edge Function's job — it only says when.
 */

export type SquareOffCountdown =
  /** Not a live session: the banner makes no claim at all. */
  | { kind: 'IDLE' }
  | { kind: 'PENDING'; msRemaining: number }
  /** At or past 15:20 with the session still open — the sweep is running. */
  | { kind: 'DUE' }

export function squareOffCountdownAt(at: Date, status: MarketStatus): SquareOffCountdown {
  // Only a live session squares anything off. Outside one the banner says
  // nothing rather than counting down to a boundary that has no meaning today —
  // on a Sunday the next 15:20 is not this calendar day's.
  if (status.state !== 'OPEN') return { kind: 'IDLE' }

  const squareOffAt = istDayStart(at).getTime() + SQUARE_OFF_TIME_IST * 60_000
  const msRemaining = squareOffAt - at.getTime()

  return msRemaining > 0 ? { kind: 'PENDING', msRemaining } : { kind: 'DUE' }
}

/**
 * How long the banner should wait before recomputing.
 *
 * A second while it is counting down, and the pill's own schedule otherwise — so
 * a page opened before the bell starts counting the moment the session does,
 * without a one-second timer running all night.
 */
export function squareOffRefreshMs(
  countdown: SquareOffCountdown,
  status: MarketStatus,
  now: Date
): number {
  if (countdown.kind === 'PENDING') {
    return Math.max(MIN_TICK_MS, Math.min(1_000, countdown.msRemaining))
  }
  return msUntilNextRecompute(status, now)
}

/** The floor, for the same busy-loop reason `pill.ts` has one. */
const MIN_TICK_MS = 250

/**
 * `2h 05m` above an hour, `04m 12s` below it.
 *
 * Seconds are dropped above an hour because they are noise at that distance, and
 * shown below it because the last minutes are the ones a user is watching.
 * Rounded **up**, so the banner never reads `00m 00s` while the sweep has not
 * run — it reaches zero only by moving to `DUE`.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1_000))
  const hours = Math.floor(total / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const seconds = total % 60

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`
  return `${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}
