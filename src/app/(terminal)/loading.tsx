import { PageSkeleton } from '@/components/terminal/skeletons/PageSkeleton'
import { TableSkeleton } from '@/components/terminal/skeletons/TableSkeleton'

/**
 * The group-level fallback. It covers a terminal segment that has no
 * `loading.tsx` of its own, so a route added after F36 streams something
 * shaped roughly right rather than a blank frame — the failure this feature
 * exists to remove should not return with the next page anyone adds.
 */
export default function TerminalLoading() {
  return (
    <PageSkeleton label="Loading">
      <TableSkeleton />
    </PageSkeleton>
  )
}
