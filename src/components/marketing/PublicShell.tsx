import type { ReactNode } from 'react'

import { DisclaimerBanner } from './DisclaimerBanner'
import { SiteFooter } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

type PublicShellProps = {
  children: ReactNode
}

/**
 * Banner, header, content, footer.
 *
 * Extracted from the (marketing) layout because `app/not-found.tsx` needs the
 * same chrome and cannot get it from a route-group layout: an unmatched URL at
 * the root never enters the group, so Next.js renders that file inside the root
 * layout alone. Composing the shell here keeps the two in step.
 */
export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <DisclaimerBanner />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
