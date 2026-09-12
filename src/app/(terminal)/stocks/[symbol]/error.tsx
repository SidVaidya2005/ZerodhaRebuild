'use client'

import { TerminalErrorBoundary } from '@/components/terminal/TerminalErrorBoundary'

export default function StockError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <TerminalErrorBoundary
      tag="stocks.error"
      title="This stock could not be loaded"
      description="The price pipeline is unaffected. Your watchlist and positions for this symbol are unchanged."
      error={error}
      retry={retry}
    />
  )
}
