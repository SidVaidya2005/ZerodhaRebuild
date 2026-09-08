/**
 * What a user with no open intraday positions sees.
 *
 * **Empty is the normal overnight state here, unlike Holdings.** Every MIS
 * position is closed by 15:20 (§10), so this page is empty for most of the day
 * by design rather than because the user has never traded — the copy says so,
 * instead of implying something is missing. It also points at Reports, because
 * after a square-off that is where the day's positions actually went.
 */
export function PositionsEmptyState() {
  return (
    <div className="rounded-md border border-dashed border-hairline bg-surface p-8 text-center">
      <h2 className="text-title-sm font-semibold text-ink">No open positions</h2>
      <p className="mx-auto mt-2 max-w-prose text-body-sm text-muted-strong">
        Intraday MIS trades appear here while they are open, and are squared off automatically at
        3:20pm — so this page is empty outside market hours. Delivery holdings live under Holdings,
        and closed positions stay in Reports.
      </p>
    </div>
  )
}
