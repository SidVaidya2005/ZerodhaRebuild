import { PageSkeleton } from '@/components/terminal/skeletons/PageSkeleton'
import { SummaryCardsSkeleton } from '@/components/terminal/skeletons/SummaryCardsSkeleton'
import { TableSkeleton } from '@/components/terminal/skeletons/TableSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function ReportsLoading() {
  return (
    <PageSkeleton label="Loading reports">
      <SummaryCardsSkeleton count={3} />
      {/* Period and symbol filters plus the CSV export control. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="mt-4">
        <TableSkeleton rows={10} columns={7} />
      </div>
    </PageSkeleton>
  )
}
