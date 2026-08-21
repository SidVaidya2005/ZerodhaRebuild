import { estimateCharges, roundToPaise } from '@/lib/trading/charges'
import type { ChargeEstimate } from '@/lib/trading/charges'
import { formatCurrency, formatQuantity } from '@/lib/utils'

import { Section } from './Section'

const QUANTITY = 500
const PRICE = 100

/**
 * Both legs are computed by the same estimator the order ticket will use, so
 * changing a rate in constants.ts changes these figures. Nothing here is typed
 * in — that is what feature 06's verify requires, and it is the only way the
 * page and the engine cannot drift apart.
 *
 * Buying and selling at the same price is deliberate: it isolates the cost of
 * trading from any move in the price.
 */
const BUY = estimateCharges({ side: 'BUY', product: 'CNC', quantity: QUANTITY, price: PRICE })
const SELL = estimateCharges({ side: 'SELL', product: 'CNC', quantity: QUANTITY, price: PRICE })
const ROUND_TRIP = roundToPaise(BUY.total + SELL.total)

const LINES: readonly { key: keyof ChargeEstimate['breakdown']; label: string }[] = [
  { key: 'brokerage', label: 'Brokerage' },
  { key: 'stt', label: 'STT' },
  { key: 'exchangeTxn', label: 'Exchange transaction' },
  { key: 'sebiTurnover', label: 'SEBI turnover fee' },
  { key: 'stampDuty', label: 'Stamp duty' },
  { key: 'dpCharge', label: 'DP charge' },
  { key: 'gst', label: 'GST' },
]

export function WorkedExample() {
  return (
    <Section
      heading="A worked example"
      lede={`Buying ${formatQuantity(QUANTITY)} shares at ${formatCurrency(PRICE)} as delivery, then selling them at the same price. Every figure below is computed by the same code the order engine uses.`}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Leg title="The buy" subtitle="Delivery, 500 × ₹100" estimate={BUY} />
        <Leg title="The sell" subtitle="Delivery, 500 × ₹100" estimate={SELL} />
      </div>

      <div className="mt-6 rounded-xl border border-hairline bg-surface p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="text-title-sm font-semibold text-ink">Round trip</span>
          <span className="font-numeric text-display-sm font-semibold text-ink">
            {formatCurrency(ROUND_TRIP)}
          </span>
        </div>
        <p className="mt-3 max-w-prose text-body-sm text-body">
          That is what it costs to buy {formatQuantity(QUANTITY)} shares and sell them again, on{' '}
          {formatCurrency(BUY.turnover + SELL.turnover)} of turnover. The price never moved, so the
          whole figure is charges — which is the point of showing it. On a real trade you would need
          the price to rise by about {formatCurrency(roundToPaise(ROUND_TRIP / QUANTITY))} a share
          just to break even.
        </p>
      </div>

      <p className="mt-6 max-w-prose text-body-sm text-body">
        These are estimates, computed in the browser layer for display. When you actually place an
        order the charges are calculated in the database and stored with the trade, so what you see
        on a filled order is the real figure rather than this one recomputed.
      </p>
    </Section>
  )
}

type LegProps = {
  title: string
  subtitle: string
  estimate: ChargeEstimate
}

function Leg({ title, subtitle, estimate }: LegProps) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-6">
      <h3 className="text-title-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-caption text-muted-strong">{subtitle}</p>

      <dl className="mt-4 flex flex-col gap-2">
        <Row label="Turnover" value={formatCurrency(estimate.turnover)} />
        {LINES.map((line) => (
          <Row
            key={line.key}
            label={line.label}
            value={formatCurrency(estimate.breakdown[line.key])}
            dimmed={estimate.breakdown[line.key] === 0}
          />
        ))}
      </dl>

      <div className="mt-4 flex items-baseline justify-between border-t border-hairline pt-4">
        <span className="text-body-sm font-medium text-ink">Total charges</span>
        <span className="font-numeric text-number font-semibold text-ink">
          {formatCurrency(estimate.total)}
        </span>
      </div>
    </div>
  )
}

type RowProps = {
  label: string
  value: string
  dimmed?: boolean
}

function Row({ label, value, dimmed = false }: RowProps) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={dimmed ? 'text-body-sm text-muted-strong' : 'text-body-sm text-body'}>
        {label}
      </dt>
      <dd
        className={
          dimmed
            ? 'font-numeric text-body-sm text-muted-strong'
            : 'font-numeric text-body-sm text-body'
        }
      >
        {value}
      </dd>
    </div>
  )
}
