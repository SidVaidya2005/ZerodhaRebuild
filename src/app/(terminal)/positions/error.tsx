'use client'

import { TerminalErrorBoundary } from '@/components/terminal/TerminalErrorBoundary'

export default function PositionsError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <TerminalErrorBoundary
      tag="positions.error"
      title="Positions could not be loaded"
      description="Your positions are safe and any auto square-off still runs on schedule — this page could not read them."
      error={error}
      retry={retry}
    />
  )
}
