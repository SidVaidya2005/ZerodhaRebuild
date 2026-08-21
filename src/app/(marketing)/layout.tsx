import type { ReactNode } from 'react'

import { DisclaimerBanner } from '@/components/marketing/DisclaimerBanner'
import { SiteFooter } from '@/components/marketing/SiteFooter'
import { SiteHeader } from '@/components/marketing/SiteHeader'

type MarketingLayoutProps = {
  children: ReactNode
}

/**
 * The chrome every public page sits inside.
 *
 * Nothing in this subtree reads `cookies()`, so every page under it stays
 * statically renderable — `code-standards.md` makes that a hard rule for
 * `(marketing)`, and the build output is what proves it.
 */
export default function MarketingLayout({ children }: MarketingLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <DisclaimerBanner />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
