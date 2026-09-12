import { Skeleton } from '@/components/ui/skeleton'

/**
 * Stands in for a row of summary tiles — the figures Dashboard, Holdings,
 * Positions, Funds and Reports each carry above their table.
 *
 * The grid steps 2 → 4 across breakpoints because that is what the real cards
 * do; a placeholder that reflows differently from its content makes the swap
 * look like a layout bug on exactly the narrow viewports F37 is about to audit.
 */
type SummaryCardsSkeletonProps = {
  count?: number
}

export function SummaryCardsSkeleton({ count = 4 }: SummaryCardsSkeletonProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, card) => (
        <div key={card} className="rounded-lg border border-hairline p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-6 w-32" />
        </div>
      ))}
    </div>
  )
}
