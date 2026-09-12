import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * The page shell every terminal `loading.tsx` renders into.
 *
 * The three widths mirror the wrappers the real pages already use, so the
 * skeleton occupies the same column as the content that replaces it and the
 * swap does not shift the page sideways. Adding a fourth means a page grew a
 * fourth wrapper, which is worth noticing rather than absorbing here.
 *
 * `role="status"` with a label is what a screen reader announces; the bars
 * themselves are empty divs and say nothing. Without the label the whole
 * loading state is silent, which is indistinguishable from a hung page.
 */
const WIDTHS = {
  wide: 'mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6',
  dashboard: 'mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6',
  narrow: 'mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6',
} as const

type PageSkeletonProps = {
  /** Announced while the page loads, e.g. "Loading holdings". */
  label: string
  width?: keyof typeof WIDTHS
  /** Mirrors the one-line description most terminal pages render under the title. */
  withSubtitle?: boolean
  children: ReactNode
}

export function PageSkeleton({
  label,
  width = 'wide',
  withSubtitle = true,
  children,
}: PageSkeletonProps) {
  return (
    <div className={cn(WIDTHS[width])} role="status" aria-label={label}>
      <Skeleton className="h-7 w-40" />
      {withSubtitle ? <Skeleton className="mt-2 h-4 w-72 max-w-full" /> : null}
      <div className="mt-6">{children}</div>
    </div>
  )
}
