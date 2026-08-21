import { LineChart, PieChart, Receipt, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { OPENING_BALANCE } from '@/lib/constants'
import { formatCurrency } from '@/lib/utils'

import { Section } from './Section'

type Feature = {
  icon: LucideIcon
  title: string
  body: string
}

/**
 * The prices tile deliberately does not say "live". No provider in this build
 * streams ticks, so a quote can only ever badge DELAYED, SIMULATED or STALE —
 * see architecture.md → Quote Provenance, and the honesty band further down the
 * page, which explains the whole vocabulary.
 */
const FEATURES: readonly Feature[] = [
  {
    icon: LineChart,
    title: 'Real NSE prices, honestly delayed',
    body: 'Quotes come from a real market data provider, refreshed on a schedule and interpolated between refreshes so the tape moves. Every price on screen can tell you which provider produced it and how old it is.',
  },
  {
    icon: Receipt,
    title: 'Real order types',
    body: 'Market and limit orders in CNC and MIS. Margin is blocked when you place, released when you cancel, and an order you cannot afford is rejected the way a broker would reject it.',
  },
  {
    icon: Wallet,
    title: 'Simulated funds',
    body: `Every account opens with ${formatCurrency(OPENING_BALANCE)}. Cash, blocked margin and a full ledger reconcile to the paisa, and you can reset back to the opening balance whenever you want a clean run.`,
  },
  {
    icon: PieChart,
    title: 'Portfolio analytics',
    body: 'Holdings and positions tracked separately, realised and unrealised P&L kept apart, charges broken down per trade, and a report of everything you have closed.',
  },
]

export function FeatureGrid() {
  return (
    <Section
      heading="What you can do"
      lede="Everything below runs against the same engine — there is no demo mode with softer rules."
    >
      <ul className="grid gap-6 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.title} className="rounded-xl border border-hairline bg-surface p-6">
            <feature.icon className="size-5 text-brand" aria-hidden="true" />
            <h3 className="mt-4 text-title-sm font-semibold text-ink">{feature.title}</h3>
            <p className="mt-2 text-body-sm text-body">{feature.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
