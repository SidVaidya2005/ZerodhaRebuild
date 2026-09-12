'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

type ErrorBoundaryProps = {
  error: Error & { digest?: string }
  retry: () => void
}

/**
 * The root error boundary.
 *
 * It renders no chrome, unlike the 404. A 404 is an ordinary navigation outcome
 * and the nav is the useful thing to offer; an error means something in this
 * subtree already failed, so the less machinery this page depends on to render,
 * the better its chances of rendering at all. It also stays a small client
 * bundle rather than pulling the header and footer across the boundary.
 *
 * `error.message` is deliberately not rendered. `code-standards.md` forbids
 * putting a raw error, stack trace or database message into a UI string, and in
 * production Next.js replaces the message with an opaque digest anyway. The
 * digest is shown because it is the one thing that makes a report actionable.
 *
 * Errors thrown by the root layout itself are not caught here; `global-error.tsx`
 * catches those, added at F36.
 *
 * **The action is `retry`, not `reset`.** Next.js passes both: `reset()` only
 * resets the boundary and re-renders from the payload it already has, while
 * `retry()` calls `router.refresh()` first. Since F36 every terminal read
 * failure throws, so the common case here is a failed *server* read — which
 * `reset` alone would re-render unchanged, making the button appear dead. (F36)
 */
export default function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.error('[app.error]', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <p className="text-caption font-medium text-muted-strong">Something went wrong</p>
      <h1 className="mt-2 max-w-prose text-display-sm font-semibold text-ink">
        This page could not be displayed
      </h1>
      <p className="mt-4 max-w-prose text-body">
        The error has been logged. Trying again often works — if it does not, the home page will
        still be there.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()} className="rounded-full">
          Try again
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/">Go to the home page</Link>
        </Button>
      </div>

      {error.digest ? (
        <p className="mt-10 font-numeric text-caption text-muted-strong">
          Reference: {error.digest}
        </p>
      ) : null}
    </div>
  )
}
