import Link from 'next/link'

import { Section } from './Section'

const REAL: readonly string[] = [
  'The instruments. Around 200 real NSE symbols with their real names, seeded from published exchange data — and every quote against them records where it came from and when.',
  'The charge formulas. Brokerage, STT, exchange transaction charges, the SEBI turnover fee, stamp duty, GST and DP charges are modelled on the published structure, applied per order.',
  'The order mechanics. Margin is blocked at placement, released on cancellation, and an unaffordable order is rejected rather than quietly shrunk.',
  'The market clock. Sessions follow NSE hours in IST against a holiday calendar, and intraday positions are squared off at 3:20pm.',
  'The arithmetic. Cash, holdings, positions and the ledger reconcile exactly, and a test proves it.',
]

const SIMULATED: readonly string[] = [
  'The prices. A tick engine generates every quote, walking from a real NSE closing price. The provider chain that would fetch real quotes is built, but none is wired here — so every price on screen badges SIMULATED, and says so rather than implying otherwise.',
  'The money. There is no account, no deposit, no withdrawal, and no payment integration anywhere in the system. The opening balance is a number in a database row.',
  'The fills. There is no counterparty and no order book, so an order fills in full at the last traded price or not at all — partial fills do not exist here.',
  'The market impact. Your orders move nothing, because there is nobody on the other side.',
  'The settlement. Delivery is immediate rather than settling over days, so shares are sellable as soon as they are bought.',
  'The tape between refreshes. Prices are polled on a schedule and animated in between; the motion you see is interpolation, not ticks.',
]

/**
 * The inventory of what is genuine and what is fabricated. /legal carries the
 * consequences and the specific divergences from a real broker in a legal
 * register — this page states the facts and links there rather than restating
 * them, so neither page becomes a stale copy of the other.
 */
export function RealVsSimulated() {
  return (
    <Section
      heading="What is real and what is simulated"
      lede="The point of the project is that the mechanics are faithful. It is worth being exact about where that stops."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <InventoryColumn heading="Real" items={REAL} />
        <InventoryColumn heading="Simulated" items={SIMULATED} />
      </div>

      <p className="mt-8 max-w-prose text-body-sm text-body">
        The places this deliberately diverges from how a real broker would behave — and what that
        means for you — are set out on the{' '}
        <Link href="/legal" className="text-brand underline underline-offset-4 light:text-ink">
          disclaimer page
        </Link>
        .
      </p>
    </Section>
  )
}

type InventoryColumnProps = {
  heading: string
  items: readonly string[]
}

function InventoryColumn({ heading, items }: InventoryColumnProps) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-6">
      <h3 className="text-title-sm font-semibold text-ink">{heading}</h3>
      <ul className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-body-sm text-body">
            <span aria-hidden="true" className="text-brand">
              &middot;
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
