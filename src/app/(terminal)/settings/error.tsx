'use client'

import { TerminalErrorBoundary } from '@/components/terminal/TerminalErrorBoundary'

export default function SettingsError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <TerminalErrorBoundary
      tag="settings.error"
      title="Settings could not be loaded"
      description="Your profile and preferences are unchanged — this page could not read them."
      error={error}
      retry={retry}
    />
  )
}
