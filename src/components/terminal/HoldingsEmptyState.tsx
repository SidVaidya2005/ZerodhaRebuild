/**
 * What a user with no delivery holdings sees.
 *
 * **Shown for an empty portfolio, not for a new account.** Someone who bought
 * CNC and sold out has no holdings and a full history elsewhere, so this says
 * the shelf is empty rather than "you have not started" — the dashboard's empty
 * state is the one that speaks to a never-traded account, and it checks orders
 * as well as holdings before it does.
 *
 * It points at the watchlist because that is where the next action is, and the
 * rail is already on screen beside it.
 */
export function HoldingsEmptyState() {
  return (
    <div className="rounded-md border border-dashed border-hairline bg-surface p-8 text-center">
      <h2 className="text-title-sm font-semibold text-ink">No holdings yet</h2>
      <p className="mx-auto mt-2 max-w-prose text-body-sm text-muted-strong">
        Delivery holdings appear here once a CNC buy fills. Pick a stock from the watchlist and
        place an order — intraday MIS trades show up under Positions instead, and are squared off
        automatically at 3:20pm.
      </p>
    </div>
  )
}
