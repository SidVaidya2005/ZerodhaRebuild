import { PageSkeleton } from '@/components/terminal/skeletons/PageSkeleton'
import { SummaryCardsSkeleton } from '@/components/terminal/skeletons/SummaryCardsSkeleton'
import { TableSkeleton } from '@/components/terminal/skeletons/TableSkeleton'

export default function PositionsLoading() {
  return (
    <PageSkeleton label="Loading positions">
      <SummaryCardsSkeleton />
      <div className="mt-4">
        <TableSkeleton rows={5} columns={7} />
      </div>
    </PageSkeleton>
  )
}
