import type { Metadata } from 'next'

import { TerminalPlaceholder } from '@/components/terminal/TerminalPlaceholder'

export const metadata: Metadata = {
  title: 'Settings — ZerodhaRebuild',
}

export default function Page() {
  return (
    <TerminalPlaceholder
      title="Settings"
      arrivesIn="F35"
      description="Profile details, theme, and the preferences that persist across sessions."
    />
  )
}
