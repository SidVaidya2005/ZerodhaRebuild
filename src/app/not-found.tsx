import Link from 'next/link'

import { PublicShell } from '@/components/marketing/PublicShell'
import { NAV_LINKS } from '@/components/marketing/nav-links'
import { Button } from '@/components/ui/button'

/**
 * The 404 carries the full public chrome deliberately: a mistyped URL is an
 * ordinary navigation outcome, and the most useful thing to hand someone is the
 * nav that gets them somewhere real.
 *
 * It cannot inherit that chrome from the (marketing) layout — an unmatched URL
 * never enters the route group, so Next.js renders this file inside the root
 * layout alone. Hence PublicShell, shared with that layout.
 */
export default function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-7xl px-4 py-section md:px-6">
        <div className="max-w-prose">
          <p className="font-numeric text-number font-medium text-body">404</p>
          <h1 className="mt-2 text-display font-bold text-ink">This page does not exist</h1>
          <p className="mt-6 text-body">
            The link may be out of date, or the address mistyped. Nothing has gone wrong with the
            application — this is just a route that was never there.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="rounded-full">
              <Link href="/">Back to the home page</Link>
            </Button>
          </div>

          <nav className="mt-10 border-t border-hairline pt-6" aria-label="Public pages">
            <p className="text-caption font-medium text-muted-strong">Or try one of these</p>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-body-sm text-body underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </PublicShell>
  )
}
