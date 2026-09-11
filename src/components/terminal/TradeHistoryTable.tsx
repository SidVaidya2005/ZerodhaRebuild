import Link from 'next/link'

import { pageCount, reportsHref, type ReportsQuery } from '@/lib/reports/query'
import type { TradeRow } from '@/lib/reports/types'
import { cn, formatCurrency, formatSignedCurrency } from '@/lib/utils'

/**
 * Completed trades, newest first.
 *
 * A Server Component: every figure here is a stored fact about a trade that
 * already happened, so nothing ticks and nothing carries provenance. The only
 * priced figure on this page is the unrealised total above, which is a claim
 * about now rather than about these rows.
 *
 * **The charge breakdown is a native `<details>`**, per F07: no JavaScript, and
 * the keyboard and screen-reader behaviour come from the browser rather than
 * being hand-written and audited at F38.
 */
type TradeHistoryTableProps = {
  trades: readonly TradeRow[]
  /** The filtered total across every page, not this page's length. */
  total: number
  query: ReportsQuery
}

export function TradeHistoryTable({ trades, total, query }: TradeHistoryTableProps) {
  const pages = pageCount(total)
  const isFiltered = query.from !== null || query.to !== null || query.symbol !== null

  // **Past the end is not the same as empty**, and conflating them is the F27
  // defect in a new place: a bookmarked `?page=3` that outlives the trades it
  // pointed at would otherwise tell an account holding five trades that it has
  // never traded. The set is non-empty, so say where it went rather than
  // describing the account.
  if (trades.length === 0 && total > 0) {
    return (
      <p className="rounded-md border border-dashed border-hairline bg-surface p-6 text-center text-body-sm text-muted-strong">
        Page {query.page} is past the end of {total} {total === 1 ? 'trade' : 'trades'}.{' '}
        <Link
          href={reportsHref({ ...query, page: 1 })}
          className="text-ink underline underline-offset-2"
        >
          Back to page 1
        </Link>
        .
      </p>
    )
  }

  if (trades.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-hairline bg-surface p-6 text-center text-body-sm text-muted-strong">
        {isFiltered
          ? 'No trades match these filters. Widen the period or clear the symbol to see more.'
          : 'No completed trades yet. Every order that fills will appear here with its charges and realised P&L.'}
      </p>
    )
  }

  return (
    <>
      {/* `relative` is load-bearing: `.sr-only` is `position: absolute`, so
          without a positioned ancestor the caption escapes this scroll region
          and drags the whole page sideways — measured at 521px on /holdings
          before the same fix (F27, F30). */}
      <div
        role="region"
        aria-label="Trade history, scrollable"
        tabIndex={0}
        className="relative overflow-x-auto rounded-xs focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <table className="w-full min-w-[880px] text-body-sm">
          <caption className="sr-only">
            Every completed trade, newest first, with its charges and the realised P&amp;L it
            recorded.
          </caption>
          <thead>
            <tr className="text-caption text-muted">
              <th scope="col" className="pb-2 text-left font-medium">
                When
              </th>
              <th scope="col" className="pb-2 text-left font-medium">
                Symbol
              </th>
              <th scope="col" className="pb-2 text-left font-medium">
                Type
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Qty
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Price
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Value
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Charges
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Realised P&amp;L
              </th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id} className="border-t border-hairline align-top">
                <td className="py-2 text-left text-muted tabular-nums">
                  {formatWhen(trade.tradedAt)}
                </td>

                <th scope="row" className="py-2 text-left font-normal">
                  <Link href={`/stocks/${trade.symbol}`} className="text-ink hover:underline">
                    {trade.symbol}
                  </Link>
                  <span className="block text-caption text-muted">{trade.name}</span>
                </th>

                <td className="py-2 text-left">
                  <span
                    className={cn('font-medium', trade.side === 'BUY' ? 'text-up' : 'text-down')}
                  >
                    {trade.side}
                  </span>
                  <span className="block text-caption text-muted">
                    {trade.product} · {trade.orderType}
                    {/* §10: a 15:20 exit is not a decision the user made, and
                        Reports is where that distinction is meant to be
                        visible. */}
                    {trade.isAutoSquareoff && (
                      <span className="block text-muted-strong">Auto square-off</span>
                    )}
                  </span>
                </td>

                <td className="py-2 text-right text-ink tabular-nums">{trade.quantity}</td>
                <td className="py-2 text-right text-ink tabular-nums">
                  {formatCurrency(trade.price)}
                </td>
                <td className="py-2 text-right text-ink tabular-nums">
                  {formatCurrency(trade.value)}
                </td>

                <td className="py-2 text-right">
                  <ChargeBreakdown charges={trade.charges} breakdown={trade.chargeBreakdown} />
                </td>

                {/* §9: 0.00 on every opening leg, never null — so a zero here
                    means "this leg opened a position", not "this trade broke
                    even". The caption below the table says so. */}
                <td
                  className={cn(
                    'py-2 text-right tabular-nums',
                    trade.realisedPnl > 0 && 'text-up',
                    trade.realisedPnl < 0 && 'text-down',
                    trade.realisedPnl === 0 && 'text-muted'
                  )}
                >
                  {trade.realisedPnl === 0 ? '—' : formatSignedCurrency(trade.realisedPnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-caption text-muted">
        An em dash under Realised P&amp;L means the trade opened a position rather than closing one.
        Realised P&amp;L is recorded on the closing leg only, net of that leg&apos;s charges.
      </p>

      <Pager query={query} pages={pages} total={total} />
    </>
  )
}

/**
 * One trade's charges, expandable to the components that make them up.
 *
 * §12.6 makes the components sum to `charges` exactly — a CHECK constraint, not
 * a convention — so this renders the stored figures and adds nothing up itself.
 */
function ChargeBreakdown({
  charges,
  breakdown,
}: {
  charges: number
  breakdown: Record<string, number>
}) {
  return (
    <details className="group inline-block text-right">
      {/* `py-1.5` and the marker suppression are what give this a tap target
          over WCAG 2.2's 24px minimum — F07 shipped 20px summaries and only
          measuring caught it. */}
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-xs py-1.5 text-ink tabular-nums focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        {formatCurrency(charges)}
        <span
          aria-hidden
          className="text-caption text-muted transition-transform group-open:rotate-180"
        >
          ▾
        </span>
        <span className="sr-only">Show charge breakdown</span>
      </summary>

      <dl className="mt-1 min-w-[180px] rounded-xs border border-hairline bg-surface-elevated p-2 text-left text-caption">
        {CHARGE_LINES.map(({ key, label }) => (
          <div key={key} className="flex justify-between gap-4 py-0.5">
            <dt className="text-muted">{label}</dt>
            <dd className="text-ink tabular-nums">{formatCurrency(breakdown[key] ?? 0)}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

/**
 * The stored `charge_breakdown` keys, in the order `/pricing` presents them.
 *
 * Snake_case because that is what the `jsonb` holds; the conversion to display
 * copy happens here, at the boundary, rather than by renaming keys on the way
 * out. §3 fixes the set — every component is present, absent ones stored as `0`.
 */
const CHARGE_LINES: readonly { key: string; label: string }[] = [
  { key: 'brokerage', label: 'Brokerage' },
  { key: 'stt', label: 'STT' },
  { key: 'exchange_txn', label: 'Exchange transaction' },
  { key: 'sebi_turnover', label: 'SEBI turnover fee' },
  { key: 'stamp_duty', label: 'Stamp duty' },
  { key: 'dp_charge', label: 'DP charge' },
  { key: 'gst', label: 'GST' },
]

/**
 * Previous and next as plain links, so paging survives a disabled-JavaScript
 * session and every page has its own URL (F32).
 */
function Pager({ query, pages, total }: { query: ReportsQuery; pages: number; total: number }) {
  const hasPrevious = query.page > 1
  const hasNext = query.page < pages

  return (
    <nav
      aria-label="Trade history pages"
      className="mt-3 flex items-center justify-between text-caption text-muted"
    >
      <p>
        Page {query.page} of {pages} · {total} {total === 1 ? 'trade' : 'trades'}
      </p>

      <span className="flex gap-2">
        {/* Text rather than a disabled link at the ends: a link to nowhere is
            reachable by keyboard and announces itself as a link. */}
        {hasPrevious ? (
          <Link
            href={reportsHref({ ...query, page: query.page - 1 })}
            className="rounded-xs px-2 py-1 text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            ← Previous
          </Link>
        ) : (
          <span className="px-2 py-1 text-muted">← Previous</span>
        )}

        {hasNext ? (
          <Link
            href={reportsHref({ ...query, page: query.page + 1 })}
            className="rounded-xs px-2 py-1 text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            Next →
          </Link>
        ) : (
          <span className="px-2 py-1 text-muted">Next →</span>
        )}
      </span>
    </nav>
  )
}

/**
 * IST, because every other timestamp in this terminal is — the market's clock is
 * the one the user is reasoning in (F32).
 */
const whenFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatWhen(iso: string): string {
  return whenFormatter.format(new Date(iso))
}
