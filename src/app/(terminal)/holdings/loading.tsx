import { PageSkeleton } from '@/components/terminal/skeletons/PageSkeleton'
import { SummaryCardsSkeleton } from '@/components/terminal/skeletons/SummaryCardsSkeleton'
import { TableSkeleton } from '@/components/terminal/skeletons/TableSkeleton'

export default function HoldingsLoading() {
  return (
    <PageSkeleton label="Loading holdings">
      <SummaryCardsSkeleton />
      <div className="mt-4">
        <TableSkeleton rows={8} columns={7} />
      </div>
    </PageSkeleton>
  )
}
