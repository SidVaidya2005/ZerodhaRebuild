'use client'

import {
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  type PieSectorShapeProps,
} from 'recharts'

import { toDonutSlices, type DonutSlice } from '@/lib/portfolio/totals'
import type { HoldingRow } from '@/lib/portfolio/types'
import { useHoldingPrices } from '@/components/terminal/use-holding-prices'
import { formatCurrency } from '@/lib/utils'

/**
 * The top-ten holdings donut, with everything below the tenth in one `Others`
 * arc.
 *
 * The ramp deliberately excludes `--color-up` and `--color-down`: those two mean
 * "price rose" and "price fell" everywhere else in this app, and a green slice
 * would read as "this position is up" when it means nothing of the sort. Only a
 * chart that genuinely encodes gain against loss may use them.
 *
 * Ranked by market value against the live **anchor**, so a tick that changes the
 * order of the portfolio changes the order of the chart.
 */

const SLICE_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-chart-6)',
  'var(--color-chart-7)',
  'var(--color-chart-8)',
  'var(--color-chart-9)',
  'var(--color-chart-10)',
] as const

/**
 * `Others` is not a holding and must not wear a holding's colour.
 *
 * It is always last, so with a full ten named slices in front of it the naive
 * `index % 10` handed it chart-1 — the legend then showed two identical
 * swatches against different rows, which is exactly the confusion the ramp
 * exists to prevent. It gets the neutral instead, which is also the honest
 * signal: this arc is an aggregate, not a position.
 */
const OTHERS_COLOR = 'var(--color-muted)'

function colorFor(index: number, isOthers: boolean): string {
  return isOthers ? OTHERS_COLOR : SLICE_COLORS[index % SLICE_COLORS.length]!
}

const HoldingSlice = (props: PieSectorShapeProps) => {
  const slice = props.payload as unknown as DonutSlice | undefined
  return <Sector {...props} fill={colorFor(props.index ?? 0, slice?.isOthers ?? false)} />
}

export function HoldingsDonut({ holdings }: { holdings: HoldingRow[] }) {
  const { anchors } = useHoldingPrices(holdings)
  const slices = toDonutSlices(holdings, anchors)

  // Two different absences, and saying the wrong one is a small lie about the
  // account: a user who has closed everything out holds nothing, while a user
  // whose symbols have no quote row holds plenty that simply cannot be valued.
  if (slices.length === 0) {
    return (
      <p className="text-body-sm text-muted">
        {holdings.length === 0
          ? 'Nothing to chart — you hold no stock at the moment.'
          : 'Nothing to chart yet — no holding has a price to value it by.'}
      </p>
    )
  }

  const total = slices.reduce((sum, slice) => sum + slice.value, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr] lg:items-center">
      {/* ResponsiveContainer needs a parent with a definite height or the chart
          collapses to nothing.

          Hidden from assistive tech, deliberately. The table beside it carries
          every holding, value and share, so the arcs add nothing a screen reader
          could use — and Recharts stamps the SVG `role="application"`, which
          tells a screen reader to hand every keystroke to the chart. That breaks
          browse mode on a graphic that has no interaction to offer. */}
      <div aria-hidden="true" className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={70}
              outerRadius={110}
              shape={HoldingSlice}
              isAnimationActive={false}
            />
            {/* Recharts 3 types the formatter's value as possibly undefined,
                so the narrowing is required rather than cosmetic — see the
                correction in library-docs.md § Recharts. */}
            <Tooltip
              formatter={(value) => (typeof value === 'number' ? formatCurrency(value) : '—')}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* The legend is also the accessible reading of the chart: an SVG of arcs
          says nothing to a screen reader, and this table says all of it. */}
      <table className="w-full text-body-sm">
        <caption className="sr-only">
          Holdings by market value, largest first, with any beyond the tenth grouped as Others.
        </caption>
        <thead>
          <tr className="text-caption text-muted">
            <th scope="col" className="pb-2 text-left font-medium">
              Holding
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Value
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {slices.map((slice, index) => (
            <tr key={slice.name} className="border-t border-hairline">
              <th scope="row" className="py-1.5 text-left font-normal text-ink">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-xs"
                    style={{ background: colorFor(index, slice.isOthers) }}
                  />
                  {slice.name}
                </span>
              </th>
              <td className="py-1.5 text-right text-ink tabular-nums">
                {formatCurrency(slice.value)}
              </td>
              <td className="py-1.5 text-right text-muted-strong tabular-nums">
                {total === 0 ? '—' : `${((slice.value / total) * 100).toFixed(1)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
