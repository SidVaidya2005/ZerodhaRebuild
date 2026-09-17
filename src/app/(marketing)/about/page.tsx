import type { Metadata } from 'next'

import { AboutAuthor } from '@/components/marketing/AboutAuthor'
import { AboutIntro } from '@/components/marketing/AboutIntro'
import { HowItWasBuilt } from '@/components/marketing/HowItWasBuilt'
import { RealVsSimulated } from '@/components/marketing/RealVsSimulated'
import { StackTable } from '@/components/marketing/StackTable'

export const metadata: Metadata = {
  title: 'About — ZerodhaRebuild',
  description:
    'Why this paper-trading terminal exists, how it is built, and an honest account of what is real about it and what is simulated.',
}

export default function AboutPage() {
  return (
    <>
      <AboutIntro />
      <HowItWasBuilt />
      <StackTable />
      <RealVsSimulated />
      <AboutAuthor />
    </>
  )
}
