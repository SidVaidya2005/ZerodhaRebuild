import type { Metadata } from 'next'

import { TerminalPlaceholder } from '@/components/terminal/TerminalPlaceholder'

export const metadata: Metadata = {
  title: 'Holdings — ZerodhaRebuild',
}

export default function Page() {
  return (
    <TerminalPlaceholder
      title="Holdings"
      arrivesIn="F30"
      description="Delivery positions carried overnight, with average cost, current value and overall P&amp;L."
    />
  )
}
