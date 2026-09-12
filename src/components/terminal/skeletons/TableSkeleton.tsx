import { Skeleton } from '@/components/ui/skeleton'

/**
 * Stands in for a terminal data table.
 *
 * The header row is rendered a shade narrower than the body rows so the shape
 * reads as a table rather than a stack of bars — the point of a skeleton is
 * that the eye recognises what is coming, not that something is animating.
 *
 * It deliberately does **not** reproduce the real table's horizontal scroll
 * region. That region carries `tabIndex`, `role` and a label because its
 * content overflows and a keyboard user must reach the far columns (F05); a
 * placeholder has no far columns to reach, and a focusable element that
 * announces itself as a scrollable region while holding nothing is noise on
 * the one surface a screen-reader user is waiting through.
 */
type TableSkeletonProps = {
  rows?: number
  columns?: number
}

export function TableSkeleton({ rows = 8, columns = 6 }: TableSkeletonProps) {
  return (
    <div className="rounded-lg border border-hairline">
      <div className="flex items-center gap-4 border-b border-hairline px-4 py-3">
        {Array.from({ length: columns }, (_, column) => (
          <Skeleton key={column} className="h-3 flex-1" />
        ))}
      </div>

      <div>
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            className="flex items-center gap-4 border-b border-hairline px-4 py-3.5 last:border-b-0"
          >
            {Array.from({ length: columns }, (_, column) => (
              <Skeleton key={column} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
