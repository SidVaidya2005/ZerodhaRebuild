'use client'

import { TerminalErrorBoundary } from '@/components/terminal/TerminalErrorBoundary'

export default function HoldingsError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <TerminalErrorBoundary
      tag="holdings.error"
      title="Holdings could not be loaded"
      description="Your holdings are safe; this page could not read them. Nothing has been bought or sold."
      error={error}
      retry={retry}
    />
  )
}
