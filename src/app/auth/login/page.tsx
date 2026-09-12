import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { safeNext } from '@/lib/auth/routes'
import { signInWithGoogle } from '@/server/actions/auth'

export const metadata: Metadata = {
  title: 'Sign in — ZerodhaRebuild',
  description:
    'Sign in with Google to open the paper-trading terminal. No real money is involved anywhere in this project.',
}

type LoginPageProps = {
  // Async in Next.js 16 — `code-standards.md` → Next.js 16 Conventions.
  searchParams: Promise<{ next?: string; error?: string }>
}

/**
 * A Server Component with no client island in it. The Google button is a plain
 * form submitting to a Server Action, so sign-in works with JavaScript disabled
 * — the standard F07B set for the support form, and the reason OAuth is started
 * server-side rather than from a browser client.
 *
 * The `<main>` landmark here is what closes the Phase 1 checkpoint's
 * `landmark-one-main` failure: the F03 stub this replaces was a bare `<div>`,
 * and it was the only public route scoring below 100.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  // Re-validated rather than passed through: this value reaches a redirect.
  const next = safeNext(params.next)
  const failed = params.error === 'auth'

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-title-sm font-bold text-brand light:text-ink">
          ZerodhaRebuild
        </Link>

        <h1 className="mt-8 text-display-sm font-semibold text-ink">Sign in</h1>
        <p className="mt-4 text-body text-muted-strong">
          Google is the only way in — no passwords to store, and nothing to remember. You get
          ₹1,00,000 of simulated cash and none of it is real.
        </p>

        {failed ? (
          <p
            role="alert"
            className="mt-6 rounded-md border border-hairline bg-surface p-3 text-body-sm text-body"
          >
            That sign-in did not complete. Please try again.
          </p>
        ) : null}

        <form action={signInWithGoogle} className="mt-8">
          <input type="hidden" name="next" value={next} />
          {/* The pill radius is DESIGN.md's "this is THE action" signal, and on
              this page there is exactly one action. */}
          <Button type="submit" className="w-full rounded-full">
            Continue with Google
          </Button>
        </form>

        <p className="mt-6 text-body-sm text-muted">
          By signing in you agree that this is a simulator.{' '}
          <Link href="/legal" className="text-brand underline underline-offset-4 light:text-ink">
            What that means
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
