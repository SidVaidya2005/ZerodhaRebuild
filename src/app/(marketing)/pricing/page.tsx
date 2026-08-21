import type { Metadata } from 'next'

import { ChargesTable } from '@/components/marketing/ChargesTable'
import { PlanCard } from '@/components/marketing/PlanCard'
import { WorkedExample } from '@/components/marketing/WorkedExample'

export const metadata: Metadata = {
  title: 'Pricing — ZerodhaRebuild',
  description:
    'The charge structure the simulated order engine applies: zero delivery brokerage, capped intraday brokerage, STT, exchange and SEBI charges, stamp duty, GST and DP charges, with a worked round trip.',
}

export default function PricingPage() {
  return (
    <>
      <PlanCard />
      <ChargesTable />
      <WorkedExample />
    </>
  )
}
