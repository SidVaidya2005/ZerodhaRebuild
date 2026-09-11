import Link from 'next/link'

import { SOURCE_COPY } from '@/lib/market/screen-provenance'
import type { ReportsSummary, UnrealisedSummary } from '@/lib/reports/types'
import { cn, formatCurrency, formatSignedCurrency } from '@/lib/utils'

/**
 * The two summaries above the trade history, kept visibly apart.
 *
 * **They answer questions with different scopes, and merging them would lie.**
 * The first four cards are the *filtered* set — change the date range and every
 * one of them changes. Unrealised P&L is a fact about the portfolio right now
 * and no filter touches it, so putting it in the same row of cards would imply a
 * date range it does not obey. §9 already insists realised and unrealised are
 * different questions; this is that distinction made visible.
 *
 * A Server Component. Every figure arrives computed by Postgres —
 * `reports_summary` for the filtered totals, `portfolio_summary` for the
 * unrealised one — per `CLAUDE.md`'s money rule.
 */
export function ReportsSummaryCards({
  summary,
  unrealised,
  filtered,
}: {
  summary: ReportsSummary
  unrealised: UnrealisedSummary
  /** Whether any filter is applied, which decides the heading's wording. */
  filtered: boolean
}) {
  return (
    <>
      <section aria-labelledby="filtered-heading">
        <h2 id="filtered-heading" className="sr-only">
          {filtered ? 'Totals for the filtered range' : 'Totals across every trade'}
        </h2>

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Labelled "Realised" for the reason F32 gave: a card headed
              "Total P&L" showing only half of one answers a question the user
              did not ask. */}
          <Tile
            label="Realised P&L"
            value={formatSignedCurrency(summary.realisedPnl)}
            direction={directionOf(summary.realisedPnl)}
            emphasis
          />
          <Tile label="Charges" value={formatCurrency(summary.chargesTotal)} />
          <Tile label="Bought" value={formatCurrency(summary.buyValue)} />
          <Tile label="Sold" value={formatCurrency(summary.sellValue)} />
        </dl>

        <p className="mt-2 text-caption text-muted">
          {filtered
            ? `Across the ${summary.tradeCount} ${summary.tradeCount === 1 ? 'trade' : 'trades'} matching the filters above, not the page below.`
            : `Across all ${summary.tradeCount} ${summary.tradeCount === 1 ? 'trade' : 'trades'}.`}{' '}
          Realised P&amp;L is recorded on closing legs only, net of the charges on that leg.
        </p>
      </section>

      <section className="mt-6" aria-labelledby="unrealised-heading">
        <h2 id="unrealised-heading" className="text-title-sm font-semibold text-ink">
          Open holdings
        </h2>
        <p className="mt-1 text-body-sm text-muted">
          What the delivery portfolio is worth against what it cost.{' '}
          <span className="text-muted-strong">
            Not affected by the filters above — it describes the portfolio now.
          </span>
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Unrealised P&L"
            value={
              unrealised.holdingCount === 0 ? '—' : formatSignedCurrency(unrealised.unrealisedPnl)
            }
            direction={
              unrealised.holdingCount === 0 ? 'flat' : directionOf(unrealised.unrealisedPnl)
            }
            emphasis
          />
          <Tile label="Holdings" value={String(unrealised.holdingCount)} direction="flat" />
        </dl>

        {/* The figure is only as sound as the prices behind it, and a total has
            no single quote to attach to — so it carries the worst provenance
            among the holdings being valued, as F21's tiles and F30's footer do. */}
        {unrealised.holdingCount > 0 && unrealised.source !== null && (
          <p className="mt-3 text-caption text-muted">
            Valued with{' '}
            <span className="font-medium text-ink">
              {SOURCE_COPY[unrealised.source].label.toLowerCase()} prices
            </span>{' '}
            — {SOURCE_COPY[unrealised.source].meaning} Computed at read time from those prices,
            never stored.
          </p>
        )}

        {/* Not a footnote. A portfolio quietly missing a position understates
            itself with no sign that anything is absent (F30). */}
        {unrealised.unpricedCount > 0 && (
          <p className="mt-2 text-caption text-muted-strong">
            {unrealised.unpricedCount === 1
              ? '1 holding could not be valued — no price has been reported for it yet, so it is absent from the figure above.'
              : `${unrealised.unpricedCount} holdings could not be valued — no price has been reported for them yet, so they are absent from the figure above.`}
          </p>
        )}

        {/* F21 put intraday positions on their own page and kept them out of the
            dashboard's aggregate. Reports follows that split — but a statement
            that silently omitted them would be the dishonest version of it. */}
        <p className="mt-2 text-caption text-muted-strong">
          Open intraday (MIS) positions are not included here.{' '}
          <Link href="/positions" className="text-ink underline underline-offset-2">
            See Positions
          </Link>{' '}
          for those — they are squared off automatically at 15:20.
        </p>
      </section>
    </>
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
