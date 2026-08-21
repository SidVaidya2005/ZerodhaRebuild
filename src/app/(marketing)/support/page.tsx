import type { Metadata } from 'next'

import { SupportContact } from '@/components/marketing/SupportContact'
import { SupportFaq } from '@/components/marketing/SupportFaq'

export const metadata: Metadata = {
  title: 'Support — ZerodhaRebuild',
  description:
    'Answers about signing in, placing orders, where the money goes, and how the price data works in this paper-trading simulator.',
}

export default function SupportPage() {
  return (
    <>
      <SupportIntro />
      <SupportFaq />
      <SupportContact />
    </>
  )
}

function SupportIntro() {
  return (
    <section className="py-section pb-0">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="max-w-prose">
          <h1 className="text-display font-bold text-ink">Support</h1>
          <p className="mt-6 text-body">
            Most questions about this project are really questions about how Indian equity trading
            works, which is what it was built to answer. The rest are about what is deliberately
            missing.
          </p>
        </div>
      </div>
    </section>
  )
}
