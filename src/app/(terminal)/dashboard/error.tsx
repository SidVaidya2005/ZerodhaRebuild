'use client'

import { TerminalErrorBoundary } from '@/components/terminal/TerminalErrorBoundary'

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <TerminalErrorBoundary
      tag="dashboard.error"
      title="Your dashboard could not be loaded"
      description="Your holdings, cash and orders are unaffected — this page could not read them. Nothing has been changed."
      error={error}
      retry={retry}
    />
  )
}
