'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { worstSource } from '@shared/provenance.ts'

import { Button } from '@/components/ui/button'
import { SOURCE_COPY, serverProvenance } from '@/lib/market/screen-provenance'
import {
  recomputeHolding,
  recomputeSummary,
  sortHoldings,
  type HoldingSortKey,
  type LiveHolding,
  type SortDirection,
} from '@/lib/portfolio/totals'
import type { HoldingRow, PortfolioSummary } from '@/lib/portfolio/types'
import { openTicket } from '@/lib/stores/order-ticket-store'
import {
  cn,
  formatCurrency,
  formatQuantity,
  formatSignedCurrency,
  formatSignedPercent,
} from '@/lib/utils'

import { PriceWithProvenance } from './PriceWithProvenance'
import { useNow } from './TerminalClock'
import { useHoldingPrices, useHoldingProvenance } from './use-holding-prices'

/**
 * Delivery holdings, priced.
 *
 * **Every figure arrives computed by Postgres.** `portfolio_holdings` and
 * `portfolio_summary` do the arithmetic, per `CLAUDE.md`'s money rule; what
 * happens here is a *restatement* against prices that arrived after the page
 * rendered, display-only and persisted nowhere — the same call F19 made for the
 * watchlist's day change and F21 for the dashboard tiles.
 *
 * **The whole row jumps on the anchor, including the LTP column.**
 * `architecture.md` names every total on Holdings as a surface that renders the
 * price a provider actually reported. Letting the LTP tween while the current
 * value beside it waited for the tick would put a row visibly in disagreement
 * with itself, so nothing here reads `ltp` at all — `useHoldingPrices` selects
 * `anchor`, and `useHoldingProvenance` supplies the matching claim through
 * `anchorProvenance`, which says *as reported* rather than *interpolated*.
 *
 * Rows and footer are driven from one `useHoldingPrices` call, so a tick that
 * moves a row moves the total in the same render. They cannot drift apart.
 */

type HoldingsTableProps = {
  holdings: HoldingRow[]
  summary: PortfolioSummary
}

type Sort = { key: HoldingSortKey; direction: SortDirection }

/** Ascending reads right for a name; for money the largest position first does. */
const DEFAULT_DIRECTION: Record<HoldingSortKey, SortDirection> = {
  symbol: 'asc',
  quantity: 'desc',
  averagePrice: 'desc',
  invested: 'desc',
  ltp: 'desc',
  marketValue: 'desc',
  unrealisedPnl: 'desc',
  dayPnl: 'desc',
}

const COLUMNS: { key: HoldingSortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'symbol', label: 'Instrument', align: 'left' },
  { key: 'quantity', label: 'Qty', align: 'right' },
  { key: 'averagePrice', label: 'Avg cost', align: 'right' },
  { key: 'invested', label: 'Invested', align: 'right' },
  { key: 'ltp', label: 'LTP', align: 'right' },
  { key: 'marketValue', label: 'Cur. value', align: 'right' },
  { key: 'unrealisedPnl', label: 'P&L', align: 'right' },
  { key: 'dayPnl', label: 'Day chg', align: 'right' },
]

export function HoldingsTable({ holdings, summary }: HoldingsTableProps) {
  const { anchors, prevCloses } = useHoldingPrices(holdings)
  const now = useNow()
  const provenances = useHoldingProvenance(holdings, now)
  const [sort, setSort] = useState<Sort>({ key: 'symbol', direction: 'asc' })

  const rows = useMemo(
    () =>
      sortHoldings(
        holdings.map((holding) => recomputeHolding(holding, anchors, prevCloses)),
        sort.key,
        sort.direction
      ),
    [holdings, anchors, prevCloses, sort]
  )

  // The same restatement the dashboard tiles use, over the same anchors, so the
  // footer is arithmetically the rows above it.
  const footer = recomputeSummary(summary, holdings, anchors, prevCloses)

  // The totals are only as sound as the prices they were valued with, and a
  // total is an aggregate with no single quote to attach to — so it carries the
  // worst provenance among the holdings actually being valued, exactly as F21's
  // tiles do.
  const aggregate = rows
    .map((row) => provenances[row.symbol] ?? serverProvenance(row, now))
    .filter((value): value is NonNullable<typeof value> => value !== null)
  const source = aggregate.length === 0 ? null : worstSource(aggregate.map((p) => p.source))
  const copy = source ? SOURCE_COPY[source] : null

  function toggle(key: HoldingSortKey): void {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: DEFAULT_DIRECTION[key] }
    )
  }

  return (
    <>
      {/* Focusable and labelled: this table overflows well before 375px, and a
          scroll container that cannot be focused leaves keyboard users unable to
          reach the columns past the right edge. Lighthouse does not audit this;
          axe does. */}
      <div
        role="region"
        aria-label="Holdings, scrollable"
        tabIndex={0}
        className="overflow-x-auto rounded-xs focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <table className="w-full min-w-[880px] text-body-sm">
          <caption className="sr-only">
            Your delivery holdings, with cost, live valuation and profit or loss. Column headers
            sort the table.
          </caption>
          <thead>
            <tr className="text-caption text-muted">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  // Announced, not merely styled: a sighted user reads the arrow,
                  // a screen-reader user reads this.
                  aria-sort={
                    sort.key === column.key
                      ? sort.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className={cn('pb-2 font-medium', column.align === 'left' && 'text-left')}
                >
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-xs hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
                      sort.key === column.key && 'text-ink',
                      column.align === 'right' && 'flex-row-reverse'
                    )}
                  >
                    {column.label}
                    <span aria-hidden="true" className="text-[0.65rem]">
                      {sort.key === column.key ? (sort.direction === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className="pb-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <HoldingsRow
                key={row.symbol}
                row={row}
                provenance={provenances[row.symbol] ?? serverProvenance(row, now)}
              />
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-hairline font-medium">
              <th scope="row" className="py-2 text-left text-ink">
                Total
              </th>
              <td />
              <td />
              <td className="py-2 text-right text-ink tabular-nums">
                {formatCurrency(footer.invested)}
              </td>
              <td />
              <td className="py-2 text-right text-ink tabular-nums">
                {formatCurrency(footer.marketValue)}
              </td>
              <td
                className={cn('py-2 text-right tabular-nums', toneOf(footer.overallPnl))}
              >
                {formatSignedCurrency(footer.overallPnl)}
              </td>
              <td className={cn('py-2 text-right tabular-nums', toneOf(footer.dayPnl))}>
                {formatSignedCurrency(footer.dayPnl)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Announced as well as shown, the same guarantee F20 established for
          individual prices. Every row discloses its own price; this covers the
          totals, which are an aggregate over all of them. */}
      {copy && (
        <p className="mt-3 text-caption text-muted-strong">
          Totals valued using{' '}
          <span className="font-medium text-ink">{copy.label.toLowerCase()} prices</span> —{' '}
          {copy.meaning} They are computed at read time from those prices, never stored.
        </p>
      )}

      {/* Not a footnote. A portfolio quietly missing a position understates
          itself with no sign that anything is absent. */}
      {footer.unpricedCount > 0 && (
        <p className="mt-3 text-caption text-muted-strong">
          {footer.unpricedCount === 1
            ? '1 holding could not be valued — no price has been reported for it yet, so it is counted in Invested but not in Cur. value or P&L.'
            : `${footer.unpricedCount} holdings could not be valued — no price has been reported for them yet, so they are counted in Invested but not in Cur. value or P&L.`}
        </p>
      )}
    </>
  )
}

function HoldingsRow({
  row,
  provenance,
}: {
  row: LiveHolding
  provenance: ReturnType<typeof serverProvenance>
}) {
  return (
    <tr className="border-t border-hairline">
      <th scope="row" className="py-2 text-left font-normal">
        <Link href={`/stocks/${row.symbol}`} className="text-ink hover:underline">
          {row.symbol}
        </Link>
        <span className="ml-2 text-caption text-muted">{row.exchange}</span>
      </th>

      <td className="py-2 text-right text-ink tabular-nums">{formatQuantity(row.quantity)}</td>

      <td className="py-2 text-right text-muted-strong tabular-nums">
        {formatCurrency(row.averagePrice)}
      </td>

      <td className="py-2 text-right text-muted-strong tabular-nums">
        {formatCurrency(row.invested)}
      </td>

      {/* The anchor, with the claim that matches it. No `anchor` prop: the
          figure rendered *is* the anchor, so there is no second price to name. */}
      <td className="py-2 text-right">
        <PriceWithProvenance value={row.ltp} provenance={provenance} />
      </td>

      {/* An em dash rather than a zero wherever the price is unknown — a zero
          would be a valuation, and no price is not a price of zero. */}
      <td className="py-2 text-right text-ink tabular-nums">
        {row.marketValue === null ? '—' : formatCurrency(row.marketValue)}
      </td>

      <td className={cn('py-2 text-right tabular-nums', toneOf(row.unrealisedPnl))}>
        {row.unrealisedPnl === null ? '—' : formatSignedCurrency(row.unrealisedPnl)}
      </td>

      {/* Rupees first — that is the column the footer's Day P&L sums — with the
          stock's own percentage move beneath it, on the same prev-close basis
          the watchlist uses (§9), so a symbol reading +2% there cannot show a
          loss here. */}
      <td className={cn('py-2 text-right tabular-nums', toneOf(row.dayPnl))}>
        {row.dayPnl === null ? '—' : formatSignedCurrency(row.dayPnl)}
        <span className="block text-caption">
          {row.dayChangePct === null ? '—' : formatSignedPercent(row.dayChangePct)}
        </span>
      </td>

      <td className="py-2 text-right">
        <Button
          variant="outline"
          size="sm"
          // Opens the one ticket mounted in the terminal layout, pre-filled to
          // close the whole position. Holdings are CNC by definition (§8), so
          // the product is not a choice the user has to re-make here.
          onClick={() =>
            openTicket({
              symbol: row.symbol,
              side: 'SELL',
              product: 'CNC',
              quantity: row.quantity,
            })
          }
          // The row is one of many, so the label has to name what it acts on.
          aria-label={`Sell all ${row.quantity} shares of ${row.symbol}`}
        >
          Exit
        </Button>
      </td>
    </tr>
  )
}

/**
 * Colour never carries the sign on its own — `formatSignedCurrency` renders an
 * explicit +/− beside it (accessibility pass, F38).
 */
function toneOf(value: number | null): string {
  if (value === null) return 'text-muted'
  if (value > 0) return 'text-up'
  if (value < 0) return 'text-down'
  return 'text-ink'
}
