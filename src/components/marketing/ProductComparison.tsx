import Link from 'next/link'

import { Section } from './Section'

/**
 * Behaviour only — no charge rates. trading-contract.md §3 still carries a TODO
 * that every rate needs a dated source before the pricing page is built, and a
 * second copy of those figures here would be a second thing to keep in sync.
 * Charges live on /pricing, computed from constants.ts.
 */
export function ProductComparison() {
  return (
    <Section
      heading="CNC and MIS, in plain language"
      lede="Two product types, and the difference is not how much you can borrow — it is when the trade has to be closed."
    >
      <div className="grid gap-6 md:grid-cols-2">
        <ProductCard
          code="CNC"
          name="Delivery"
          summary="You are buying the shares and keeping them."
          points={[
            'The position survives the close and sits in Holdings until you sell it.',
            'You can only sell what you already hold — there is no short selling in CNC.',
            'Nothing closes your position for you. It stays open until you act.',
          ]}
        />
        <ProductCard
          code="MIS"
          name="Intraday"
          summary="You are taking a view for the day and it ends today."
          points={[
            'The position lives in Positions and must be closed the same session.',
            'You can sell first and buy back later — shorting is allowed here, and only here.',
            'Anything still open at 3:20pm IST is squared off automatically at the last traded price.',
          ]}
        />
      </div>

      <p className="mt-8 max-w-prose text-body-sm text-body">
        <span className="font-medium text-body">Neither product gives you leverage.</span> Both
        require the full value of the trade, so the choice between them is about settlement and
        square-off, not about buying more than you can afford. What they do cost differs — that is
        set out on the{' '}
        <Link href="/pricing" className="text-brand underline underline-offset-4 light:text-ink">
          pricing page
        </Link>
        .
      </p>
    </Section>
  )
}

type ProductCardProps = {
  code: string
  name: string
  summary: string
  points: readonly string[]
}

function ProductCard({ code, name, summary, points }: ProductCardProps) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-6">
      <div className="flex items-baseline gap-3">
        <span className="font-numeric text-title font-semibold text-brand light:text-ink">
          {code}
        </span>
        <span className="text-body-sm text-muted">{name}</span>
      </div>
      <p className="mt-3 text-body">{summary}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {points.map((point) => (
          <li key={point} className="flex gap-2 text-body-sm text-body">
            <span aria-hidden="true" className="text-brand">
              &middot;
            </span>
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
