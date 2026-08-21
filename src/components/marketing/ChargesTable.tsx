import {
  DP_CHARGE_BASE,
  DP_CHARGE_INCLUSIVE,
  EXCHANGE_TXN_RATE,
  GST_RATE,
  SEBI_TURNOVER_RATE,
  STAMP_DUTY_CNC_BUY_RATE,
  STAMP_DUTY_MIS_BUY_RATE,
  STT_CNC_RATE,
  STT_MIS_SELL_RATE,
  BROKERAGE_MIS_CAP,
  BROKERAGE_MIS_RATE,
} from '@/lib/constants'
import { formatCurrency, formatRate } from '@/lib/utils'

import { Section } from './Section'

const NIL = '—'

/** Rates as a percentage string, from the decimal fractions in constants.ts. */
function rate(fraction: number): string {
  return formatRate(fraction * 100)
}

type ChargeRow = {
  component: string
  cncBuy: string
  cncSell: string
  misBuy: string
  misSell: string
  note?: string
}

const ROWS: readonly ChargeRow[] = [
  {
    component: 'Brokerage',
    cncBuy: formatCurrency(0),
    cncSell: formatCurrency(0),
    misBuy: `${rate(BROKERAGE_MIS_RATE)} or ${formatCurrency(BROKERAGE_MIS_CAP)}`,
    misSell: `${rate(BROKERAGE_MIS_RATE)} or ${formatCurrency(BROKERAGE_MIS_CAP)}`,
    note: 'Whichever is lower, per executed order.',
  },
  {
    component: 'STT',
    cncBuy: rate(STT_CNC_RATE),
    cncSell: rate(STT_CNC_RATE),
    misBuy: NIL,
    misSell: rate(STT_MIS_SELL_RATE),
    note: 'Delivery is taxed on both legs; intraday only when you sell.',
  },
  {
    component: 'Exchange transaction',
    cncBuy: rate(EXCHANGE_TXN_RATE),
    cncSell: rate(EXCHANGE_TXN_RATE),
    misBuy: rate(EXCHANGE_TXN_RATE),
    misSell: rate(EXCHANGE_TXN_RATE),
    note: 'NSE equity.',
  },
  {
    component: 'SEBI turnover fee',
    cncBuy: rate(SEBI_TURNOVER_RATE),
    cncSell: rate(SEBI_TURNOVER_RATE),
    misBuy: rate(SEBI_TURNOVER_RATE),
    misSell: rate(SEBI_TURNOVER_RATE),
    note: 'Published as ₹10 per crore.',
  },
  {
    component: 'Stamp duty',
    cncBuy: rate(STAMP_DUTY_CNC_BUY_RATE),
    cncSell: NIL,
    misBuy: rate(STAMP_DUTY_MIS_BUY_RATE),
    misSell: NIL,
    note: 'Buy side only, on both products.',
  },
  {
    component: 'GST',
    cncBuy: rate(GST_RATE),
    cncSell: rate(GST_RATE),
    misBuy: rate(GST_RATE),
    misSell: rate(GST_RATE),
    note: 'On brokerage, exchange transaction, the SEBI fee and the DP charge — never on STT or stamp duty.',
  },
  {
    component: 'DP charge',
    cncBuy: NIL,
    cncSell: formatCurrency(DP_CHARGE_INCLUSIVE),
    misBuy: NIL,
    misSell: NIL,
    note: `Flat per scrip on a delivery sell, whatever the quantity. That is ${formatCurrency(DP_CHARGE_BASE)} plus ${formatCurrency(DP_CHARGE_INCLUSIVE - DP_CHARGE_BASE)} of GST; the trade breakdown stores the two separately so all GST sits in one line.`,
  },
]

export function ChargesTable() {
  return (
    <Section
      heading="Every charge, in full"
      lede="Rates come from src/lib/constants.ts, the same file the order engine reads. Changing one changes this table and the worked example below."
    >
      <div
        role="region"
        aria-label="Charges by component and product"
        tabIndex={0}
        className="overflow-x-auto rounded-xl border border-hairline focus-visible:ring-2 focus-visible:ring-info/50 focus-visible:outline-none"
      >
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <caption className="sr-only">
            Charge rates by component for delivery and intraday, buy and sell sides.
          </caption>
          <thead>
            <tr className="border-b border-hairline bg-surface">
              <th scope="col" className="px-4 py-3 text-caption font-medium text-muted-strong">
                Component
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-medium text-muted-strong">
                Delivery buy
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-medium text-muted-strong">
                Delivery sell
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-medium text-muted-strong">
                Intraday buy
              </th>
              <th scope="col" className="px-4 py-3 text-caption font-medium text-muted-strong">
                Intraday sell
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.component} className="border-b border-hairline last:border-b-0">
                <th
                  scope="row"
                  className="px-4 py-3 align-top text-body-sm font-medium whitespace-nowrap text-ink"
                >
                  {row.component}
                  {row.note ? (
                    <span className="mt-1 block max-w-[18rem] text-caption font-normal text-wrap text-body">
                      {row.note}
                    </span>
                  ) : null}
                </th>
                <Cell value={row.cncBuy} />
                <Cell value={row.cncSell} />
                <Cell value={row.misBuy} />
                <Cell value={row.misSell} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function Cell({ value }: { value: string }) {
  return (
    <td className="px-4 py-3 align-top font-numeric text-body-sm whitespace-nowrap text-body">
      {value === NIL ? <span className="text-muted-strong">{NIL}</span> : value}
    </td>
  )
}
