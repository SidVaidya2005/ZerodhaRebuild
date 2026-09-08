'use client'

import { useEffect, useMemo, useState } from 'react'

import { marketStatusAt } from '@/lib/market/market-hours'
import {
  formatCountdown,
  squareOffCountdownAt,
  squareOffRefreshMs,
} from '@/lib/terminal/square-off'

/**
 * How long until open intraday positions are closed for the day.
 *
 * **A client component for the same reason `MarketStatusPill` is.** The figure
 * it renders is wrong a second after it is computed, so a server render would be
 * a stale claim about the user's money rather than a stale label. `serverNow` is
 * what avoids both a hydration mismatch and a loading flash: the first client
 * render uses the server's instant, and the timer takes over from there.
 *
 * It renders **nothing** when there is nothing to say — outside a live session,
 * or with no open positions. A banner counting down to a square-off that will
 * close no rows is noise, and one shown on a Sunday would be counting to a
 * boundary that is not today's.
 */

type SquareOffBannerProps = {
  /** IST `YYYY-MM-DD` closures, read from `market_holidays` by the page. */
  holidays: string[]
  /** The server's render instant, ISO-8601. */
  serverNow: string
  /** Rows on screen. Zero silences the banner entirely. */
  positionCount: number
}

export function SquareOffBanner({ holidays, serverNow, positionCount }: SquareOffBannerProps) {
  const [now, setNow] = useState(() => new Date(serverNow))
  const holidaySet = useMemo(() => new Set(holidays), [holidays])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    // Each pass schedules the next from its own result: one second while the
    // countdown is live, and the pill's slower schedule otherwise, so a page
    // left open overnight is not running a per-second timer.
    const scheduleFrom = (current: Date) => {
      const status = marketStatusAt(current, holidaySet)
      const countdown = squareOffCountdownAt(current, status)

      timer = setTimeout(
        () => {
          const next = new Date()
          setNow(next)
          scheduleFrom(next)
        },
        squareOffRefreshMs(countdown, status, current)
      )
    }

    scheduleFrom(new Date(serverNow))
    return () => clearTimeout(timer)
  }, [holidaySet, serverNow])

  const countdown = squareOffCountdownAt(now, marketStatusAt(now, holidaySet))

  if (positionCount === 0 || countdown.kind === 'IDLE') return null

  return (
    <div
      // Polite: the approaching square-off is worth announcing and never worth
      // interrupting what the visitor is reading.
      aria-live="polite"
      className="mt-4 rounded-lg border border-border bg-surface-elevated px-4 py-3"
    >
      {countdown.kind === 'DUE' ? (
        <p className="text-body-sm text-ink">
          The 15:20 square-off is running. Open intraday positions are being closed automatically.
        </p>
      ) : (
        <p className="text-body-sm text-body">
          Intraday positions are squared off automatically at 15:20 —{' '}
          <span className="font-medium text-ink tabular-nums">
            {formatCountdown(countdown.msRemaining)}
          </span>{' '}
          remaining.
        </p>
      )}
    </div>
  )
}
