import type { Metadata } from 'next'

import { TerminalPlaceholder } from '@/components/terminal/TerminalPlaceholder'

export const metadata: Metadata = {
  title: 'Positions — ZerodhaRebuild',
}

export default function Page() {
  return (
    <TerminalPlaceholder
      title="Positions"
      arrivesIn="F31"
      description="Intraday positions, their day P&amp;L, and the 15:20 square-off that closes them."
    />
  )
}
