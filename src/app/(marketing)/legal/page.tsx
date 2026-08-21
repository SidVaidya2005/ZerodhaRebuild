import type { Metadata } from 'next'

import { LegalDisclaimer } from '@/components/marketing/LegalDisclaimer'
import { SimulationSimplifications } from '@/components/marketing/SimulationSimplifications'

export const metadata: Metadata = {
  title: 'Disclaimer — ZerodhaRebuild',
  description:
    'An independent portfolio project, unaffiliated with Zerodha. No real trading, no financial advice, and an explicit list of where this simulator differs from a real broker.',
}

export default function LegalPage() {
  return (
    <>
      <LegalDisclaimer />
      <SimulationSimplifications />
    </>
  )
}
