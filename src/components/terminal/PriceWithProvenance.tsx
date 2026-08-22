'use client'

import { useId, useState } from 'react'

import type { Provenance } from '@shared/provenance.ts'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { SOURCE_COPY } from '@/lib/market/screen-provenance'
import { cn } from '@/lib/utils'

/**
 * A price, and everything the project is willing to claim about it.
 *
 * **The disclosure does not depend on hover.** The same facts render as
 * `sr-only` text tied to the figure by `aria-describedby`, because hover does
 * not exist on touch and never fires for a screen reader — and the guarantee is
 * that no price renders without accessible provenance, not that a mouse user can
 * find it. The HoverCard is the sighted affordance over the top.
 *
 * Shared rather than inlined into the watchlist row: F21's summary tiles, F30's
 * holdings and F33's chart header each add price surfaces, and each reinventing
 * this is how one of them ends up rendering a number with nothing behind it.
 */

const priceFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** IST, because every timestamp a visitor sees in this product is exchange time. */
const timeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

type PriceWithProvenanceProps = {
  /** The figure to render. May be mid-tween and therefore synthetic. */
  value: number | null
  /**
   * Null when no provider has ever reported this symbol. The figure then renders
   * as an em dash, which makes no claim and so needs no provenance.
   */
  provenance: Provenance | null
  /** The last price a provider actually reported. Shown when the figure is not it. */
  anchor?: number | null
  className?: string
}

function describe(provenance: Provenance, anchor: number | null | undefined): string {
  const copy = SOURCE_COPY[provenance.source]
  const parts = [
    `${copy.label} price.`,
    `Source ${provenance.provider}.`,
    provenance.providerTs
      ? `Provider timestamp ${timeFormatter.format(provenance.providerTs)} IST.`
      : 'The provider reported no timestamp.',
    `Fetched ${timeFormatter.format(provenance.fetchedAt)} IST.`,
  ]

  if (provenance.isInterpolated) {
    parts.push(
      anchor === null || anchor === undefined
        ? 'This figure is interpolated between server prices.'
        : `This figure is interpolated; the last reported price was ${priceFormatter.format(anchor)}.`
    )
  }

  return parts.join(' ')
}

export function PriceWithProvenance({
  value,
  provenance,
  anchor,
  className,
}: PriceWithProvenanceProps) {
  const descriptionId = useId()
  // Controlled so keyboard focus opens the card too. Radix's HoverCard opens on
  // focus only for anchor triggers, so with a span a keyboard user could tab
  // onto the price and get nothing — a focusable element that does nothing is
  // worse than one that is not focusable at all. Measured, not assumed: focusing
  // the trigger left the card closed.
  const [open, setOpen] = useState(false)

  // Nothing to disclose and nothing claimed. An em dash is the absence of a
  // price, not a price of zero.
  if (value === null || provenance === null) {
    return <span className={cn('tabular-nums', className)}>—</span>
  }

  const copy = SOURCE_COPY[provenance.source]

  return (
    <>
      <HoverCard open={open} onOpenChange={setOpen} openDelay={120}>
        <HoverCardTrigger asChild>
          <span
            aria-describedby={descriptionId}
            tabIndex={0}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            className={cn(
              'rounded-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand',
              // Only STALE is muted. Every price in this build is simulated, so
              // muting those too would grey the entire terminal and the
              // treatment would stop carrying any information at all.
              provenance.source === 'STALE' ? 'text-muted' : 'text-ink',
              className
            )}
          >
            {priceFormatter.format(value)}
          </span>
        </HoverCardTrigger>

        <HoverCardContent align="end" className="w-72 space-y-2">
          <p className="text-body-sm font-medium text-ink">{copy.label}</p>
          <p className="text-caption text-muted-strong">{copy.meaning}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption">
            <dt className="text-muted">Provider</dt>
            <dd className="text-ink">{provenance.provider}</dd>

            <dt className="text-muted">Provider time</dt>
            <dd className="text-ink tabular-nums">
              {provenance.providerTs ? `${timeFormatter.format(provenance.providerTs)} IST` : '—'}
            </dd>

            <dt className="text-muted">Fetched</dt>
            <dd className="text-ink tabular-nums">
              {timeFormatter.format(provenance.fetchedAt)} IST
            </dd>

            <dt className="text-muted">On screen</dt>
            <dd className="text-ink">
              {provenance.isInterpolated ? 'Interpolated' : 'As reported'}
            </dd>

            {provenance.isInterpolated && anchor !== null && anchor !== undefined && (
              <>
                <dt className="text-muted">Last reported</dt>
                <dd className="text-ink tabular-nums">{priceFormatter.format(anchor)}</dd>
              </>
            )}
          </dl>
        </HoverCardContent>
      </HoverCard>

      {/* The guarantee. Present whether or not anything is ever hovered. */}
      <span id={descriptionId} className="sr-only">
        {describe(provenance, anchor)}
      </span>
    </>
  )
}
