import { Skeleton } from '@/components/ui/skeleton'

/**
 * Not a `PageSkeleton`: the stock page is the one terminal route with no page
 * title of its own — the symbol *is* the heading, and it renders inside the
 * header block alongside the price. Wrapping it in the shared shell would draw
 * a title bar the real page never has.
 */
export default function StockLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading stock">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-2 h-4 w-56 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      <Skeleton className="h-[360px] w-full rounded-lg" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, stat) => (
          <div key={stat} className="rounded-lg border border-hairline p-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-5 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
