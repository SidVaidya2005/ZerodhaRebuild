import type { Metadata } from 'next'

import { TerminalPlaceholder } from '@/components/terminal/TerminalPlaceholder'

export const metadata: Metadata = {
  title: 'Reports — ZerodhaRebuild',
}

export default function Page() {
  return (
    <TerminalPlaceholder
      title="Reports"
      arrivesIn="F34"
      description="Trade history and the realised P&amp;L statement, filterable by period and symbol."
    />
  )
}
