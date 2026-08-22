import type { Metadata } from 'next'

import { TerminalPlaceholder } from '@/components/terminal/TerminalPlaceholder'

export const metadata: Metadata = {
  title: 'Funds — ZerodhaRebuild',
}

export default function Page() {
  return (
    <TerminalPlaceholder
      title="Funds"
      arrivesIn="F32"
      description="Available cash, margin used, the full ledger behind the balance, and account reset."
    />
  )
}
