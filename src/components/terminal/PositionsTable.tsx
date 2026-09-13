'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { worstSource } from '@shared/provenance.ts'

import { Button } from '@/components/ui/button'
import { SOURCE_COPY, serverProvenance } from '@/lib/market/screen-provenance'
import {
  recomputePosition,
  recomputePositionsSummary,
  sortPositions,
  type PositionSortKey,
  type SortDirection,
} from '@/lib/portfolio/positions-totals'
import type { PositionRow, PositionsSummary } from '@/lib/portfolio/types'
import { openTicket } from '@/lib/stores/order-ticket-store'
import { cn, formatCurrency, formatQuantity, formatSignedCurrency } from '@/lib/utils'

import { PriceWithProvenance } from './PriceWithProvenance'
import { useNow } from './TerminalClock'
import { useHoldingPrices, useHoldingProvenance } from './use-holding-prices'

/**
 * Intraday positions, priced.
 *
 * The F30 table's twin, and deliberately so — same anchor rule, same sort
 * semantics, same provenance disclosure. Two differences carry all the meaning:
 *
 * **`netQuantity` is signed and one expression values both directions.** A short
 * of 100 at ₹99.70 against ₹90 is `−100 × (90 − 99.70) = +970`, matching §9 for
 * a short and for a long without branching. `portfolio_positions` computes the
 * identical expression, so the server figure and this restatement cannot drift.
 *
 * **Collateral is `blocked_margin`, and it is not a P&L input.** §12.11 keeps
 * `entry_reference_price` — the basis that produced it — off this page entirely;
 * the view does not even select it, so the two averages cannot be crossed here.
 */

type PositionsTableProps = {
  positions: PositionRow[]
  summary: PositionsSummary
}

type Sort = { key: PositionSortKey; direction: SortDirection }

/** Ascending reads right for a name; for money the largest first does. */
const DEFAULT_DIRECTION: Record<PositionSortKey, SortDirection> = {
  symbol: 'asc',
  netQuantity: 'desc',
  averagePrice: 'desc',
  ltp: 'desc',
  unrealisedPnl: 'desc',
  realisedPnl: 'desc',
  blockedMargin: 'desc',
}

const COLUMNS: { key: PositionSortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'symbol', label: 'Instrument', align: 'left' },
  { key: 'netQuantity', label: 'Qty', align: 'right' },
  { key: 'averagePrice', label: 'Avg price', align: 'right' },
  { key: 'ltp', label: 'LTP', align: 'right' },
  { key: 'unrealisedPnl', label: 'Unrealised', align: 'right' },
  { key: 'realisedPnl', label: 'Realised', align: 'right' },
  { key: 'blockedMargin', label: 'Collateral', align: 'right' },
]

export function PositionsTable({ positions, summary }: PositionsTableProps) {
  const { anchors } = useHoldingPrices(positions)
  const now = useNow()
  const provenances = useHoldingProvenance(positions, now)
  const [sort, setSort] = useState<Sort>({ key: 'symbol', direction: 'asc' })

  const rows = useMemo(
    () =>
      sortPositions(
        positions.map((position) => recomputePosition(position, anchors)),
        sort.key,
        sort.direction
      ),
    [positions, anchors, sort]
  )

  // Restated over the same anchors the rows used, so the footer is
  // arithmetically the rows above it rather than a separate claim.
  const footer = recomputePositionsSummary(summary, positions, anchors)

  // A total is an aggregate with no single quote to attach to, so it carries the
  // worst provenance among the positions actually being valued — F21's rule for
  // its tiles, applied to this footer.
  const aggregate = rows
    .map((row) => provenances[row.symbol] ?? serverProvenance(row, now))
    .filter((value): value is NonNullable<typeof value> => value !== null)
  const source = aggregate.length === 0 ? null : worstSource(aggregate.map((p) => p.source))
  const copy = source ? SOURCE_COPY[source] : null

  function toggle(key: PositionSortKey): void {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: DEFAULT_DIRECTION[key] }
    )
  }

  return (
    <>
      {/* `relative` is load-bearing, not cosmetic: `.sr-only` is
          `position: absolute`, so without a positioned ancestor the caption and
          the Actions label resolve against the initial containing block, escape
          this scroll region and drag the whole page sideways — measured at 521px
          on /holdings and 365px on /orders. This table is wider than either, so
          it is fixed at the source rather than added as a third instance.

          Focusable and labelled for the same reason F30's is: a scroll container
          that cannot be focused leaves keyboard users unable to reach the
          columns past the right edge. Lighthouse does not audit this; axe does. */}
      <div
        role="region"
        aria-label="Positions, scrollable"
        tabIndex={0}
        className="relative overflow-x-auto rounded-xs focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <table className="w-full min-w-[880px] text-body-sm">
          <caption className="sr-only">
            Your intraday positions, with average price, live valuation, realised profit or loss and
            the collateral held against any short. Column headers sort the table.
          </caption>
          <thead>
            <tr className="text-caption text-muted">
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  // Announced, not merely styled: a sighted user reads the
                  // arrow, a screen-reader user reads this.
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
              <PositionsRow
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
              <td />
              <td className={cn('py-2 text-right tabular-nums', toneOf(footer.unrealisedPnl))}>
                {formatSignedCurrency(footer.unrealisedPnl)}
              </td>
              <td className={cn('py-2 text-right tabular-nums', toneOf(footer.realisedPnl))}>
                {formatSignedCurrency(footer.realisedPnl)}
              </td>
              <td className="py-2 text-right text-ink tabular-nums">
                {footer.blockedMargin === 0 ? '—' : formatCurrency(footer.blockedMargin)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Announced as well as shown, the guarantee F20 established for
          individual prices, applied to the aggregate the rows roll up into. */}
      {copy && (
        <p className="mt-3 text-caption text-muted-strong">
          Totals valued using{' '}
          <span className="font-medium text-ink">{copy.label.toLowerCase()} prices</span> —{' '}
          {copy.meaning} They are computed at read time from those prices, never stored.
        </p>
      )}

      {/* Not a footnote. A page quietly missing a position understates itself
          with no sign that anything is absent. */}
      {footer.unpricedCount > 0 && (
        <p className="mt-3 text-caption text-muted-strong">
          {footer.unpricedCount === 1
            ? '1 position could not be valued — no price has been reported for it yet, so it is excluded from Unrealised.'
            : `${footer.unpricedCount} positions could not be valued — no price has been reported for them yet, so they are excluded from Unrealised.`}
        </p>
      )}
    </>
  )
}

function PositionsRow({
  row,
  provenance,
}: {
  row: PositionRow
  provenance: ReturnType<typeof serverProvenance>
}) {
  // A short is closed by buying it back. The sign on `netQuantity` is the whole
  // of that decision, and the ticket wants an absolute quantity.
  const isShort = row.netQuantity < 0
  const side = isShort ? 'BUY' : 'SELL'
  const exitQuantity = Math.abs(row.netQuantity)

  return (
    <tr className="border-t border-hairline">
      <th scope="row" className="py-2 text-left font-normal">
        <Link href={`/stocks/${row.symbol}`} className="text-ink hover:underline">
          {row.symbol}
        </Link>
        <span className="ml-2 text-caption text-muted">{row.exchange}</span>
      </th>

      {/* Signed, and toned like a P&L figure, because the sign is the single
          most consequential fact in the row — a short read as a long inverts
          every other number beside it. */}
      <td className={cn('py-2 text-right tabular-nums', isShort ? 'text-down-text' : 'text-ink')}>
        {formatQuantity(row.netQuantity)}
        {isShort && <span className="ml-1 text-caption text-muted">Short</span>}
      </td>

      <td className="py-2 text-right text-muted-strong tabular-nums">
        {formatCurrency(row.averagePrice)}
      </td>

      {/* The anchor, with the claim that matches it. No `anchor` prop: the
          figure rendered *is* the anchor, so there is no second price to name. */}
      <td className="py-2 text-right">
        <PriceWithProvenance value={row.ltp} provenance={provenance} />
      </td>

      {/* An em dash rather than a zero wherever the price is unknown — a zero
          would be a valuation, and no price is not a price of zero. */}
      <td className={cn('py-2 text-right tabular-nums', toneOf(row.unrealisedPnl))}>
        {row.unrealisedPnl === null ? '—' : formatSignedCurrency(row.unrealisedPnl)}
      </td>

      <td className={cn('py-2 text-right tabular-nums', toneOf(row.realisedPnl))}>
        {formatSignedCurrency(row.realisedPnl)}
      </td>

      {/* Zero collateral is a fact about a long, not a missing figure — but an
          em dash reads better than ₹0.00 repeated down a column of longs. */}
      <td className="py-2 text-right text-muted-strong tabular-nums">
        {row.blockedMargin === 0 ? '—' : formatCurrency(row.blockedMargin)}
      </td>

      <td className="py-2 text-right">
        <Button
          variant="outline"
          size="sm"
          // Opens the one ticket mounted in the terminal layout, pre-filled to
          // close the whole position. It places an ordinary order: the close
          // goes through `place_order` → `execute_order`, which takes
          // `orders → funds → positions`. Releasing the collateral from here
          // instead would invert that pair and reintroduce the ABBA deadlock
          // `constraints.md` names this button as the likely source of.
          onClick={() =>
            openTicket({
              symbol: row.symbol,
              side,
              product: 'MIS',
              quantity: exitQuantity,
            })
          }
          // The row is one of many, so the label has to name what it acts on.
          aria-label={`Close ${row.symbol} position — ${side === 'BUY' ? 'buy' : 'sell'} ${exitQuantity} shares`}
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
  if (value > 0) return 'text-up-text'
  if (value < 0) return 'text-down-text'
  return 'text-ink'
}
