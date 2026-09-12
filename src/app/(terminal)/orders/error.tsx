'use client'

import { TerminalErrorBoundary } from '@/components/terminal/TerminalErrorBoundary'

export default function OrdersError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <TerminalErrorBoundary
      tag="orders.error"
      title="Orders could not be loaded"
      description="Your open orders are unaffected and still match on every tick. This page could not read them."
      error={error}
      retry={retry}
    />
  )
}
