import type { ReactNode } from 'react'

import { PublicShell } from '@/components/marketing/PublicShell'

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
  return <PublicShell>{children}</PublicShell>
}
