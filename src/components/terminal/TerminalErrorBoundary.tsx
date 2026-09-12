'use client'

import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

/**
 * The body every terminal segment's `error.tsx` renders.
 *
 * `code-standards.md` requires a boundary per terminal segment. Eight copies of
 * this markup would drift within a phase, so the segments own only their copy
 * and their log tag and share everything else.
 *
 * **The action is `retry`, not `reset`.** Next.js passes both: `reset()` only
 * resets the boundary and re-renders from the payload it already has, while
 * `retry()` calls `router.refresh()` first. Every failure this boundary catches
 * is a *server-side* read, so `reset` alone would re-render the same failed
 * payload — a retry button that visibly does nothing. Confirmed against the
 * framework's own `ErrorBoundaryHandler`, which passes `error`, `reset` and
 * `retry`.
 *
 * Unlike the root boundary this one keeps the terminal chrome, because it
 * renders inside `(terminal)/layout.tsx`: the shell is still working, one
 * segment beneath it is not, and the nav is the useful thing to offer. The
 * root boundary renders no chrome for the opposite reason.
 *
 * `error.message` is never rendered — `code-standards.md` forbids putting a raw
 * error or database message into a UI string, and in production Next.js
 * replaces it with an opaque digest anyway. The digest is shown because it is
 * the one thing that makes a report actionable.
 */
type TerminalErrorBoundaryProps = {
  /** Bracketed module tag for the log line, e.g. `holdings.error`. */
  tag: string
  /** Names what failed, in the user's terms: "Holdings could not be loaded". */
  title: string
  /** One sentence on what is and is not affected. */
  description: string
  error: Error & { digest?: string }
  retry: () => void
}

export function TerminalErrorBoundary({
  tag,
  title,
  description,
  error,
  retry,
}: TerminalErrorBoundaryProps) {
  useEffect(() => {
    console.error(`[${tag}]`, error)
  }, [tag, error])

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-16 text-center sm:px-6">
      <p className="text-caption font-medium text-muted-strong">Something went wrong</p>
      <h1 className="mt-2 text-title text-ink">{title}</h1>
      <p className="mt-3 text-body-sm text-body">{description}</p>

      <div className="mt-8">
        <Button onClick={() => retry()} className="rounded-full">
          Try again
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
