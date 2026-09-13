import type { FundsOverview } from '@/lib/funds/types'
import { cn, formatCurrency, formatSignedCurrency } from '@/lib/utils'

/**
 * The four Funds cards.
 *
 * **A Server Component, unlike the dashboard's tiles**, and that is the whole
 * point of the page: not one figure here is a price, so there is nothing to
 * restate when a tick lands and nothing to disclose provenance for. Cash, margin
 * and the opening balance are stored facts; §9's realised P&L is a fact about
 * closed trades. Unrealised is the figure that would drag quotes onto this page,
 * and it deliberately lives on Dashboard and Holdings instead.
 *
 * Every figure arrives computed by Postgres through `funds_overview`, per
 * `CLAUDE.md`'s money rule.
 */
export function FundsCards({ overview }: { overview: FundsOverview }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Available cash" value={formatCurrency(overview.availableCash)} emphasis />
      <Tile label="Used margin" value={formatCurrency(overview.usedMargin)} />
      <Tile label="Opening balance" value={formatCurrency(overview.openingBalance)} />
      {/* Labelled "Realised" rather than "Total", because §9 is explicit that
          realised and unrealised answer different questions and a card headed
          "Total P&L" showing only half of one would be the wrong answer to the
          question it appears to ask. */}
      <Tile
        label="Realised P&L"
        value={formatSignedCurrency(overview.realisedPnl)}
        direction={directionOf(overview.realisedPnl)}
      />
    </dl>
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
          direction === 'up' && 'text-up-text',
          direction === 'down' && 'text-down-text',
          (direction === undefined || direction === 'flat') && 'text-ink'
        )}
      >
        {value}
      </dd>
    </div>
  )
}
