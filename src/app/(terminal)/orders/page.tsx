import type { Metadata } from 'next'

import { TerminalPlaceholder } from '@/components/terminal/TerminalPlaceholder'

export const metadata: Metadata = {
  title: 'Orders — ZerodhaRebuild',
}

export default function Page() {
  return (
    <TerminalPlaceholder
      title="Orders"
      arrivesIn="F27"
      description="Every order placed today, open and executed, with status and the charges applied on fill."
    />
  )
}
