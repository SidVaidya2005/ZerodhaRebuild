import { PageSkeleton } from '@/components/terminal/skeletons/PageSkeleton'
import { SummaryCardsSkeleton } from '@/components/terminal/skeletons/SummaryCardsSkeleton'
import { TableSkeleton } from '@/components/terminal/skeletons/TableSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <PageSkeleton label="Loading dashboard" width="dashboard" withSubtitle={false}>
      <SummaryCardsSkeleton />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* The top-10 holdings donut. A circle, because a rectangle here would
            settle into a chart and the swap would read as a layout jump. */}
        <div className="rounded-lg border border-hairline p-4">
          <Skeleton className="h-4 w-40" />
          <div className="mt-6 flex items-center justify-center">
            <Skeleton className="size-44 rounded-full" />
          </div>
        </div>

        <div className="rounded-lg border border-hairline p-4">
          <Skeleton className="h-4 w-32" />
          <div className="mt-4">
            <TableSkeleton rows={5} columns={4} />
          </div>
        </div>
      </div>
    </PageSkeleton>
  )
}
