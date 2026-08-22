import type { Metadata } from 'next'

import { TerminalPlaceholder } from '@/components/terminal/TerminalPlaceholder'

export const metadata: Metadata = {
  title: 'Dashboard — ZerodhaRebuild',
}

/**
 * F13 built this page to prove a session actually arrived, so it read the user,
 * the profile and the funds itself and rendered them. All three now live in the
 * shell: the session is checked once in `(terminal)/layout.tsx`, the client ID
 * sits in the avatar menu, and available cash is in the top nav — which is where
 * a terminal shows them, and means every page gets them rather than one.
 *
 * What remains is the page's own content, and that is F21's.
 */
export default function DashboardPage() {
  return (
    <TerminalPlaceholder
      title="Dashboard"
      arrivesIn="F21"
      description="Portfolio value, day P&L, the index strip, a top-10 holdings donut and recent orders."
    />
  )
}
