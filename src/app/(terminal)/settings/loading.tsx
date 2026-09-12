import { PageSkeleton } from '@/components/terminal/skeletons/PageSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <PageSkeleton label="Loading settings" width="narrow">
      {/* Profile card: avatar beside name, email and the generated client ID. */}
      <div className="rounded-lg border border-hairline p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-56 max-w-full" />
          </div>
        </div>
        <Skeleton className="mt-4 h-3 w-32" />
      </div>

      {/* Theme toggle, then the account reset control. */}
      {Array.from({ length: 2 }, (_, card) => (
        <div key={card} className="mt-4 rounded-lg border border-hairline p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-2 h-3 w-64 max-w-full" />
          <Skeleton className="mt-4 h-9 w-36" />
        </div>
      ))}
    </PageSkeleton>
  )
}
