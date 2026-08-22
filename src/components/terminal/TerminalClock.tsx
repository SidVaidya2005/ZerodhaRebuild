'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { PROVENANCE_HEARTBEAT_MS } from '@/lib/market/screen-provenance'

/**
 * One clock for the whole terminal.
 *
 * Freshness is derived, not stored, which means it changes with the wall clock
 * and nothing else. Something has to advance `now` or a tab left open would keep
 * vouching for a price that went stale an hour ago — that is the build plan's
 * own check, and it fails without a timer.
 *
 * **Shared rather than per-component so the badge cannot contradict the row it
 * summarises.** Two independent timers drift, and a price rendering DELAYED
 * underneath a badge reading STALE is a contradiction the visitor can see.
 *
 * **F17's market-status pill deliberately keeps its own timer.** It schedules
 * itself onto the session boundary so it flips exactly at 09:15 rather than up
 * to a heartbeat late; consuming this coarse 30s tick would undo that. Two
 * timers, genuinely different jobs.
 *
 * `serverNow` is what avoids a hydration mismatch: the first client render uses
 * the server's instant, so both produce identical HTML, and the browser's own
 * clock takes over afterwards. The same trick the pill uses.
 */

const ClockContext = createContext<Date | null>(null)

export function TerminalClock({ serverNow, children }: { serverNow: string; children: ReactNode }) {
  const [now, setNow] = useState(() => new Date(serverNow))

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), PROVENANCE_HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [])

  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>
}

/**
 * The current instant, as every provenance surface should read it.
 *
 * Throws rather than falling back to `new Date()`. A silent fallback would work
 * perfectly in development and quietly give each caller its own drifting clock —
 * exactly the failure the shared provider exists to prevent.
 */
export function useNow(): Date {
  const now = useContext(ClockContext)
  if (now === null) throw new Error('useNow must be used inside <TerminalClock>')
  return now
}
