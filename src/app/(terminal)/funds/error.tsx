'use client'

import { TerminalErrorBoundary } from '@/components/terminal/TerminalErrorBoundary'

export default function FundsError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <TerminalErrorBoundary
      tag="funds.error"
      title="Funds could not be loaded"
      description="Your balance and ledger are unchanged — this page could not read them."
      error={error}
      retry={retry}
    />
  )
}
