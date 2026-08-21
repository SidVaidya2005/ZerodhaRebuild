import Link from 'next/link'

import { Button } from '@/components/ui/button'

import { SIGN_IN_HREF } from './nav-links'

export function ClosingCta() {
  return (
    <section className="py-section">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="rounded-xl border border-hairline bg-surface px-6 py-12 text-center md:px-12">
          <h2 className="text-display-sm font-semibold text-ink">Open the terminal</h2>
          <p className="mx-auto mt-3 max-w-prose text-body text-muted-strong">
            Google sign-in, and you are in. No KYC, no PAN, no deposit — there is nothing to deposit
            into.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild className="h-11 rounded-full px-6">
              <Link href={SIGN_IN_HREF}>Sign in with Google</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
