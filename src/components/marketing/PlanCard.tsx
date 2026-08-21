import { BROKERAGE_MIS_CAP, BROKERAGE_MIS_RATE } from '@/lib/constants'
import { formatCurrency, formatRate } from '@/lib/utils'

type Plan = {
  label: string
  value: string
  detail: string
}

const PLANS: readonly Plan[] = [
  {
    label: 'Account opening',
    value: formatCurrency(0),
    detail: 'There is no account to open. Sign in with Google and the terminal is there.',
  },
  {
    label: 'Delivery brokerage',
    value: formatCurrency(0),
    detail: 'Buying and holding costs no brokerage. Statutory charges still apply.',
  },
  {
    label: 'Intraday brokerage',
    value: `${formatCurrency(BROKERAGE_MIS_CAP)} or ${formatRate(BROKERAGE_MIS_RATE * 100)}`,
    detail: 'Per executed order, whichever of the two is lower.',
  },
]

export function PlanCard() {
  return (
    <section className="py-section">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="max-w-prose">
          <h1 className="text-display font-bold text-ink">Pricing</h1>
          <p className="mt-6 text-body">
            No money changes hands here, so nothing on this page is a price you pay. It is the
            charge structure the order engine applies to your simulated trades — modelled on a real
            Indian broker, because the whole point is that a winning trade should feel the drag of
            brokerage and taxes the way a real one does.
          </p>
        </div>

        <dl className="mt-10 grid gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div key={plan.label} className="rounded-xl border border-hairline bg-surface p-6">
              <dt className="text-caption font-medium text-muted-strong">{plan.label}</dt>
              <dd className="mt-2 font-numeric text-display-sm font-semibold text-ink">
                {plan.value}
              </dd>
              <dd className="mt-2 text-body-sm text-body">{plan.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
