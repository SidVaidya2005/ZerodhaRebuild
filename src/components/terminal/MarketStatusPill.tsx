'use client'

import { useEffect, useMemo, useState } from 'react'

import { marketStatusAt, type MarketState } from '@/lib/market/market-hours'
import { msUntilNextRecompute } from '@/lib/terminal/pill'
import { cn } from '@/lib/utils'

/**
 * PRE-OPEN / OPEN / CLOSED, and when that next changes.
 *
 * **A client component on purpose.** Rendering this on the server once would be
 * simpler and wrong: a tab left open past 15:30, or a Render instance waking
 * with a cached render, would keep telling the visitor the market is open. This
 * is the shell's most visible claim about the world, so it recomputes rather
 * than being frozen at render time.
 *
 * It calls the same pure `marketStatusAt` the tick gates on — the module lives
 * in `supabase/functions/_shared/` precisely so both runtimes can reach it — so
 * the pill and the Edge Function cannot disagree about whether the market is
 * open.
 *
 * **`serverNow` is what avoids both a hydration mismatch and a loading flash.**
 * The first client render uses the server's instant, so the two produce
 * identical HTML; the timer then takes over from the browser's own clock. Doing
 * this with a `null` initial state instead would render a placeholder on every
 * load, and reading `new Date()` during render would hydrate different text than
 * the server sent.
 */

type MarketStatusPillProps = {
  /** IST `YYYY-MM-DD` closures, read from `market_holidays` by the layout. */
  holidays: string[]
  /** The server's render instant, ISO-8601. */
  serverNow: string
}

const STATE_LABEL: Record<MarketState, string> = {
  PRE_OPEN: 'Pre-open',
  OPEN: 'Open',
  CLOSED: 'Closed',
}

/** Only `OPEN` earns the up colour; pre-open is a state, not a session. */
const STATE_DOT: Record<MarketState, string> = {
  PRE_OPEN: 'bg-info',
  OPEN: 'bg-up',
  CLOSED: 'bg-muted',
}

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function MarketStatusPill({ holidays, serverNow }: MarketStatusPillProps) {
  const [now, setNow] = useState(() => new Date(serverNow))
  const holidaySet = useMemo(() => new Set(holidays), [holidays])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    // Each recompute schedules the next from its own result, rather than a fixed
    // interval: `msUntilNextRecompute` returns the shorter of a heartbeat and
    // the time remaining, so the pill lands on the transition instead of up to
    // 30 seconds after it.
    const scheduleFrom = (current: Date) => {
      timer = setTimeout(
        () => {
          const next = new Date()
          setNow(next)
          scheduleFrom(next)
        },
        msUntilNextRecompute(marketStatusAt(current, holidaySet), current)
      )
    }

    scheduleFrom(new Date(serverNow))
    return () => clearTimeout(timer)
  }, [holidaySet, serverNow])

  const status = marketStatusAt(now, holidaySet)
  const transition = timeFormatter.format(status.nextTransition)
  const verb = status.state === 'OPEN' ? 'closes' : 'opens'

  return (
    <span
      // Polite rather than assertive: the market opening is worth announcing, but
      // never worth interrupting what the visitor is reading.
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-full bg-surface-elevated px-3 py-1"
    >
      <span aria-hidden="true" className={cn('size-2 rounded-full', STATE_DOT[status.state])} />
      <span className="text-body-sm font-medium text-ink">{STATE_LABEL[status.state]}</span>
      <span className="hidden text-body-sm text-muted tabular-nums sm:inline">
        · {verb} {transition}
      </span>
    </span>
  )
}
