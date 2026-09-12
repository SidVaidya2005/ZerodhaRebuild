'use client'

import { useEffect } from 'react'

import './globals.css'

/**
 * The last boundary. It catches what `src/app/error.tsx` cannot: an error
 * thrown by the root layout itself, which F08 recorded as a known gap.
 *
 * Next.js replaces the root layout with this component, so it must declare its
 * own `<html>` and `<body>` and import `globals.css` itself — nothing above it
 * runs. Three consequences follow, and all three are deliberate:
 *
 * 1. **No `next/font`.** The `--font-inter` / `--font-plex` variables are set
 *    on `<html>` by the root layout that is no longer rendering, so this page
 *    falls back to the system stack. Correct: pulling the font loader in here
 *    would add a failure mode to the page whose job is to survive one.
 * 2. **No `next-themes`.** Without the provider there is no `.light` class, so
 *    the tokens resolve to their `:root` values — the dark palette. That is the
 *    project's default theme, so the page is on-brand rather than unstyled.
 * 3. **No shadcn `Button`.** A plain element styled from tokens, because the
 *    less machinery this page depends on, the better its chances of rendering
 *    at all. Same reasoning the root boundary already states for chrome.
 *
 * The action is `retry`, matching every other boundary in the app.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[app.global-error]', error)
  }, [error])

  return (
    <html lang="en">
      <body className="bg-canvas text-body">
        <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <p className="text-caption font-medium text-muted-strong">Something went wrong</p>
          <h1 className="mt-2 max-w-prose text-display-sm font-semibold text-ink">
            ZerodhaRebuild could not start
          </h1>
          <p className="mt-4 max-w-prose text-body">
            This is a failure in the application shell rather than in any one page. No simulated
            money has moved, and no order has been placed or changed.
          </p>

          <button
            type="button"
            onClick={() => retry()}
            className="mt-8 rounded-full bg-brand px-5 py-2.5 text-body-sm font-medium text-on-brand hover:bg-brand-active"
          >
            Try again
          </button>

          {error.digest ? (
            <p className="mt-10 font-numeric text-caption text-muted-strong">
              Reference: {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  )
}
