import { PageSkeleton } from '@/components/terminal/skeletons/PageSkeleton'
import { TableSkeleton } from '@/components/terminal/skeletons/TableSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function OrdersLoading() {
  return (
    <PageSkeleton label="Loading orders">
      {/* The four status tabs resolve with the page, so the rail is part of the shape. */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, tab) => (
          <Skeleton key={tab} className="h-9 w-24" />
        ))}
      </div>
      <div className="mt-4">
        <TableSkeleton rows={6} columns={7} />
      </div>
    </PageSkeleton>
  )
}
