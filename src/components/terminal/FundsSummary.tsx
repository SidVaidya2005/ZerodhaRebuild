import { formatCurrency } from '@/lib/utils'

/**
 * Available cash in the top nav.
 *
 * Read once per navigation by the layout, not subscribed to. Nothing can change
 * it yet — the first writer is F26's order placement — and a realtime
 * subscription for a figure only the visitor's own actions move would be
 * machinery ahead of a need.
 *
 * The figure comes from `funds.available_cash`, computed in Postgres. This
 * formats it and does no arithmetic, per `CLAUDE.md`'s money rule.
 */

type FundsSummaryProps = {
  availableCash: number | null
}

export function FundsSummary({ availableCash }: FundsSummaryProps) {
  return (
    <div className="hidden flex-col items-end md:flex">
      <span className="text-caption text-muted">Available</span>
      <span className="text-body-sm font-semibold text-ink tabular-nums">
        {availableCash === null ? '—' : formatCurrency(availableCash)}
      </span>
    </div>
  )
}
