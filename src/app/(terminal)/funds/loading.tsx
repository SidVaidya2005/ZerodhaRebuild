import { PageSkeleton } from '@/components/terminal/skeletons/PageSkeleton'
import { SummaryCardsSkeleton } from '@/components/terminal/skeletons/SummaryCardsSkeleton'
import { TableSkeleton } from '@/components/terminal/skeletons/TableSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function FundsLoading() {
  return (
    <PageSkeleton label="Loading funds">
      <SummaryCardsSkeleton count={3} />
      <div className="mt-6 flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="mt-4">
        <TableSkeleton rows={10} columns={5} />
      </div>
    </PageSkeleton>
  )
}
