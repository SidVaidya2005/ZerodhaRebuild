'use client'

import { useState } from 'react'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { badgeSource, SOURCE_COPY } from '@/lib/market/screen-provenance'
import { useQuoteStore } from '@/lib/stores/quote-store'
import { cn } from '@/lib/utils'

import { useNow } from './TerminalClock'

/**
 * The shell's summary of where the prices on screen came from.
 *
 * **A summary, never a substitute.** Every individual price still resolves and
 * announces its own provenance; this exists so a visitor can tell at a glance
 * that nothing on the page is a real live quote, without hovering ten rows.
 *
 * Renders nothing when no price is on screen. With nothing claimed there is
 * nothing to characterise, and a badge over an empty watchlist would describe
 * absent data rather than anything being looked at.
 */

/** SIMULATED is not an error state here: it is the honest normal for this build. */
const SOURCE_DOT: Record<string, string> = {
  LIVE: 'bg-up',
  DELAYED: 'bg-info',
  SIMULATED: 'bg-brand',
  STALE: 'bg-muted',
}

export function DataSourceBadge() {
  const now = useNow()
  // Controlled for the same reason as the price card: Radix opens a HoverCard on
  // focus only for anchor triggers, so a keyboard user tabbing to this button
  // would otherwise see nothing.
  const [open, setOpen] = useState(false)

  // The selector returns the verdict itself — a string, or null — rather than
  // any part of the store. That is what keeps this cheap: the interpolation
  // driver hands back a new `quotes` object on every animation frame, so
  // selecting the store would re-render this badge sixty times a second, while
  // selecting the derived source re-renders it only when the answer changes.
  // Provenance does not depend on `ltp`, so during a tween the answer never does.
  const source = useQuoteStore((state) => badgeSource(state.quotes, now))

  if (source === null) return null

  const copy = SOURCE_COPY[source]

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={120}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={`Data source: ${copy.label}. ${copy.meaning}`}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-surface-elevated px-3 py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span aria-hidden="true" className={cn('size-2 rounded-full', SOURCE_DOT[source])} />
          <span className="text-caption font-medium tracking-wide text-ink uppercase">
            {copy.label}
          </span>
        </button>
      </HoverCardTrigger>

      <HoverCardContent align="end" className="w-72 space-y-2">
        <p className="text-body-sm font-medium text-ink">{copy.label} prices</p>
        <p className="text-caption text-muted-strong">{copy.meaning}</p>
        <p className="text-caption text-muted">
          This is the worst source among the prices currently on screen. Hover any individual price
          for its own provider and timestamps.
        </p>
      </HoverCardContent>
    </HoverCard>
  )
}
