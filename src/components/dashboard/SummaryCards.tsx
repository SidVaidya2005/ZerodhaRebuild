'use client'

import { useId } from 'react'

import { worstSource } from '@shared/provenance.ts'

import { SOURCE_COPY, serverProvenance } from '@/lib/market/screen-provenance'
import { useHoldingPrices } from '@/components/dashboard/use-holding-prices'
import { recomputeSummary } from '@/lib/portfolio/totals'
import type { HoldingRow, PortfolioSummary } from '@/lib/portfolio/types'
import { cn, formatCurrency, formatSignedCurrency } from '@/lib/utils'

import { useNow } from '@/components/terminal/TerminalClock'

/**
 * The five summary tiles.
 *
 * **Every figure arrives computed by Postgres.** `portfolio_summary` does the
 * arithmetic, per `CLAUDE.md`'s money rule. What happens here is a *restatement*
 * against prices that arrived after the page rendered — display-only, never
 * persisted, and the same call F19 made for the watchlist's day change. A
 * portfolio value frozen at render time beside a visibly ticking watchlist
 * contradicts itself on screen.
 *
 * **The restatement reads `anchor`, never `ltp`.** `architecture.md`'s invariant
 * is that a monetary total renders the price a provider actually reported, never
 * one the interpolation loop invented. An earlier draft of that document listed
 * these tiles as an ambient surface that could tween; F21 resolved that in the
 * invariant's favour. The tiles jump when a tick lands. They do not slide.
 */

type SummaryCardsProps = {
  summary: PortfolioSummary
  holdings: HoldingRow[]
}

export function SummaryCards({ summary, holdings }: SummaryCardsProps) {
  const { anchors, prevCloses } = useHoldingPrices(holdings)
  const now = useNow()
  const live = recomputeSummary(summary, holdings, anchors, prevCloses)
  const provenanceId = useId()

  // **No figure on this page is a single-symbol price**, so `PriceWithProvenance`
  // has nothing to attach to — a portfolio value is an aggregate, not a quote.
  // The honesty rule still applies to it: these totals are only as sound as the
  // prices they were valued with, and every one of those prices is simulated
  // today. So the aggregate carries the aggregate's provenance — the worst
  // source among the holdings actually being valued, scoped to those holdings
  // rather than to the whole store, because the watchlist's symbols do not
  // appear in any of these numbers.
  // Derived from the same rows the tiles are valued from, so the disclosure and
  // the figures cannot disagree. A holding the store has not seen yet falls back
  // to the provenance of the server row it was rendered from.
  const provenances = holdings
    .map((holding) => serverProvenance(holding, now))
    .filter((value): value is NonNullable<typeof value> => value !== null)
  const source = provenances.length === 0 ? null : worstSource(provenances.map((p) => p.source))
  const copy = source ? SOURCE_COPY[source] : null

  return (
    <section aria-label="Portfolio summary" aria-describedby={copy ? provenanceId : undefined}>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Portfolio value" value={formatCurrency(live.portfolioValue)} emphasis />
        <Tile label="Invested" value={formatCurrency(live.invested)} />
        <Tile
          label="Overall P&L"
          value={formatSignedCurrency(live.overallPnl)}
          direction={directionOf(live.overallPnl)}
        />
        <Tile
          label="Day's P&L"
          value={formatSignedCurrency(live.dayPnl)}
          direction={directionOf(live.dayPnl)}
        />
        <Tile label="Available cash" value={formatCurrency(live.availableCash)} />
      </dl>

      {/* Announced as well as shown, the same guarantee F20 established for
          individual prices: hover does not exist on touch and never fires for a
          screen reader. */}
      {copy && (
        <p id={provenanceId} className="mt-3 text-caption text-muted-strong">
          Valued using{' '}
          <span className="font-medium text-ink">{copy.label.toLowerCase()} prices</span> —{' '}
          {copy.meaning} These totals are computed from those prices at the moment they were last
          reported, not stored.
        </p>
      )}

      {/* Not a footnote. A portfolio quietly missing a position understates
          itself with no sign that anything is absent, so the omission is stated
          wherever the totals are. */}
      {live.unpricedCount > 0 && (
        <p className="mt-3 text-caption text-muted-strong">
          {live.unpricedCount === 1
            ? '1 holding could not be valued — no price has been reported for it yet, so it is counted in Invested but not in Portfolio value or P&L.'
            : `${live.unpricedCount} holdings could not be valued — no price has been reported for them yet, so they are counted in Invested but not in Portfolio value or P&L.`}
        </p>
      )}
    </section>
  )
}

function directionOf(value: number): 'up' | 'down' | 'flat' {
  if (value > 0) return 'up'
  if (value < 0) return 'down'
  return 'flat'
}

function Tile({
  label,
  value,
  direction,
  emphasis = false,
}: {
  label: string
  value: string
  direction?: 'up' | 'down' | 'flat'
  emphasis?: boolean
}) {
  return (
    <div className="rounded-md border border-hairline bg-surface p-4">
      <dt className="text-caption text-muted">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-numeric tabular-nums',
          emphasis ? 'text-title font-semibold' : 'text-title-sm font-medium',
          direction === 'up' && 'text-up',
          direction === 'down' && 'text-down',
          (direction === undefined || direction === 'flat') && 'text-ink'
        )}
      >
        {value}
      </dd>
    </div>
  )
}
