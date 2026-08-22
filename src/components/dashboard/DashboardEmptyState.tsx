import Link from 'next/link'

import { formatCurrency } from '@/lib/utils'

/**
 * What a brand-new account sees.
 *
 * **Shown only when the account has never traded** — no holdings *and* no
 * orders. A user who traded and closed everything out has a history, and
 * replacing it with "you have not started yet" would deny it; that account gets
 * zeroes and its order list instead.
 *
 * It points at the watchlist because that is where the next action is, and the
 * rail is already on screen beside it.
 */

export function DashboardEmptyState({ availableCash }: { availableCash: number }) {
  return (
    <div className="rounded-md border border-dashed border-hairline bg-surface p-8 text-center">
      <h2 className="text-title-sm font-semibold text-ink">Nothing here yet</h2>
      <p className="mx-auto mt-2 max-w-prose text-body-sm text-muted-strong">
        Your account opened with {formatCurrency(availableCash)} of simulated cash. Pick a stock
        from the watchlist to see its chart and place your first order — no real money moves at any
        point.
      </p>
      <Link
        href="/holdings"
        className="mt-5 inline-flex items-center rounded-sm border border-hairline px-4 py-2 text-body-sm font-medium text-ink transition-colors hover:bg-surface-elevated"
      >
        See how holdings will appear
      </Link>
    </div>
  )
}
