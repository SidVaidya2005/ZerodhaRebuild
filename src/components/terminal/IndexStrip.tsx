'use client'

import { useId, useState } from 'react'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { compositeSource, SOURCE_COPY } from '@/lib/market/screen-provenance'
import type { MarketComposite } from '@/lib/portfolio/types'
import { cn } from '@/lib/utils'

import { useNow } from './TerminalClock'

/**
 * The index strip — a breadth statistic over our own universe, and never an
 * index.
 *
 * **F17 shipped this slot empty and F21 filled it with something true.** NIFTY
 * 50 and BANK NIFTY have no row, no quote and no simulator anchor anywhere in
 * this project — `instruments` holds 200 NSE equities — and SENSEX is BSE
 * against an NSE-only scope. Putting three invented numbers in the most
 * prominent chrome on the page would be the worst place in the app to fabricate
 * data, and `CLAUDE.md`'s "never label simulated data as live" is the rule this
 * component is most able to break.
 *
 * What we can honestly compute is the equal-weighted mean of per-symbol day
 * change across the symbols we actually have prices for. That is what this
 * renders, with its **constituent count beside it**, so "10 of 200 priced" can
 * never be read as the Nifty 200.
 *
 * The figure does not tick, deliberately. It averages over the whole priced
 * universe, but a visitor's quote store holds only their own watchlist — a
 * client-side recompute would silently change the constituent set and report a
 * different number under the same label. It is a server figure, restated on
 * navigation. Only its *provenance* moves with the clock, because freshness is
 * derived at read time and never stored.
 */

const pctFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export function IndexStrip({ composite }: { composite: MarketComposite | null }) {
  const now = useNow()
  const descriptionId = useId()
  const [open, setOpen] = useState(false)

  // Nothing priced and nothing to say. An em dash is the absence of a figure,
  // where 0.00% would be a claim that the market is flat.
  if (!composite || composite.constituents === 0 || composite.changePct === null) {
    return (
      <div aria-label="Market breadth" className="hidden items-baseline gap-2 lg:flex">
        <span className="text-caption font-medium tracking-wide text-muted">NSE COMPOSITE</span>
        <span className="text-body-sm text-muted tabular-nums" title="No prices yet">
          —
        </span>
      </div>
    )
  }

  const providerTs = composite.oldestProviderTs ? new Date(composite.oldestProviderTs) : null
  const source = compositeSource(composite.providers, providerTs, now)
  const copy = source ? SOURCE_COPY[source] : null
  const direction = composite.changePct > 0 ? 'up' : composite.changePct < 0 ? 'down' : 'flat'

  const description = [
    `NSE composite, ${copy?.label.toLowerCase() ?? 'unsourced'}.`,
    `Equal-weighted mean day change across ${composite.constituents} of ${composite.universeSize} instruments.`,
    `${composite.advances} advancing, ${composite.declines} declining, ${composite.unchanged} unchanged.`,
    `This is a derived breadth statistic, not a published index.`,
    composite.oldestFetchedAt
      ? `Oldest constituent fetched ${timeFormatter.format(new Date(composite.oldestFetchedAt))} IST.`
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div aria-label="Market breadth" className="hidden items-center gap-3 lg:flex">
      <HoverCard open={open} onOpenChange={setOpen} openDelay={120}>
        <HoverCardTrigger asChild>
          <div
            aria-describedby={descriptionId}
            tabIndex={0}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            className="flex items-baseline gap-2 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="text-caption font-medium tracking-wide text-muted">NSE COMPOSITE</span>
            <span
              className={cn(
                'text-body-sm font-medium tabular-nums',
                // Direction is the one thing these two tokens mean everywhere
                // in the app, and here the number genuinely encodes it.
                direction === 'up' && 'text-up',
                direction === 'down' && 'text-down',
                direction === 'flat' && 'text-muted-strong',
                source === 'STALE' && 'text-muted'
              )}
            >
              {pctFormatter.format(composite.changePct)}%
            </span>
            {/* The count is not decoration. It is what stops the figure being
                read as full-universe coverage. */}
            <span className="text-caption text-muted tabular-nums">
              {composite.constituents}/{composite.universeSize}
            </span>
          </div>
        </HoverCardTrigger>

        <HoverCardContent align="start" className="w-80 space-y-2">
          <p className="text-body-sm font-medium text-ink">NSE composite</p>
          <p className="text-caption text-muted-strong">
            The equal-weighted mean day change across the {composite.constituents} instruments we
            currently hold a price for, out of {composite.universeSize} in the universe.{' '}
            <strong className="text-ink">This is not NIFTY, BANK NIFTY or SENSEX.</strong> No index
            level is published to this project, so none is shown.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
            <dt className="text-muted">Advancing</dt>
            <dd className="text-up tabular-nums">{composite.advances}</dd>

            <dt className="text-muted">Declining</dt>
            <dd className="text-down tabular-nums">{composite.declines}</dd>

            <dt className="text-muted">Unchanged</dt>
            <dd className="text-ink tabular-nums">{composite.unchanged}</dd>

            <dt className="text-muted">Source</dt>
            <dd className="text-ink">{copy?.label ?? '—'}</dd>
          </dl>
          {copy && <p className="text-caption text-muted-strong">{copy.meaning}</p>}
        </HoverCardContent>
      </HoverCard>

      {/* The same facts, for a reader who will never hover. */}
      <span id={descriptionId} className="sr-only">
        {description}
      </span>
    </div>
  )
}
