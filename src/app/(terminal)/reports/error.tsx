'use client'

import { TerminalErrorBoundary } from '@/components/terminal/TerminalErrorBoundary'

export default function ReportsError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <TerminalErrorBoundary
      tag="reports.error"
      title="Reports could not be loaded"
      description="Your trade history is intact; this page could not read it."
      error={error}
      retry={retry}
    />
  )
}
