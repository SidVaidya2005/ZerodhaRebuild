import type { Metadata } from 'next'

import { ClosingCta } from '@/components/marketing/ClosingCta'
import { DataHonesty } from '@/components/marketing/DataHonesty'
import { FeatureGrid } from '@/components/marketing/FeatureGrid'
import { Hero } from '@/components/marketing/Hero'
import { ProductComparison } from '@/components/marketing/ProductComparison'

export const metadata: Metadata = {
  title: 'ZerodhaRebuild — paper trading for NSE equities',
  description:
    'Learn how Indian equity trading works against simulated prices on real NSE stocks, with simulated money. Market and limit orders, CNC and MIS, margin and charges — none of it real.',
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeatureGrid />
      <ProductComparison />
      <DataHonesty />
      <ClosingCta />
    </>
  )
}
