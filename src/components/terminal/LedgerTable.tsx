import Link from 'next/link'

import { LEDGER_TYPE_LABEL, ledgerHref, pageCount, type LedgerQuery } from '@/lib/funds/ledger'
import type { LedgerEntry } from '@/lib/funds/types'
import { cn, formatCurrency, formatSignedCurrency } from '@/lib/utils'

/**
 * Every movement of `available_cash`, newest first.
 *
 * **The ledger is the record of the balance** (§1): each row corresponds to
 * exactly one change in `available_cash`, and `balance_after` is the value after
 * it. That is what makes this table auditable without replaying it, and why
 * `balance_after` is rendered rather than a running sum computed here — a total
 * computed in TypeScript is exactly what `CLAUDE.md`'s money rule excludes.
 *
 * A Server Component: nothing on this page is a price, so nothing ticks.
 */
type LedgerTableProps = {
  entries: LedgerEntry[]
  total: number
  query: LedgerQuery
}

export function LedgerTable({ entries, total, query }: LedgerTableProps) {
  const pages = pageCount(total)

  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-hairline bg-surface p-6 text-center text-body-sm text-muted-strong">
        {query.type === null
          ? 'No ledger entries yet. Every movement of your cash will appear here.'
          : `No ${LEDGER_TYPE_LABEL[query.type].toLowerCase()} entries. Clear the filter to see the whole ledger.`}
      </p>
    )
  }

  return (
    <>
      {/* `relative` is load-bearing: `.sr-only` is `position: absolute`, so
          without a positioned ancestor the caption escapes this scroll region
          and drags the whole page sideways — measured at 521px on /holdings
          before the same fix. */}
      <div
        role="region"
        aria-label="Fund ledger, scrollable"
        tabIndex={0}
        className="relative overflow-x-auto rounded-xs focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
      >
        <table className="w-full min-w-[720px] text-body-sm">
          <caption className="sr-only">
            Every movement of your available cash, newest first, with the balance after each one.
          </caption>
          <thead>
            <tr className="text-caption text-muted">
              <th scope="col" className="pb-2 text-left font-medium">
                Type
              </th>
              <th scope="col" className="pb-2 text-left font-medium">
                Order
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Amount
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                Balance
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                When
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-t border-hairline">
                <th scope="row" className="py-2 text-left font-normal text-ink">
                  {LEDGER_TYPE_LABEL[entry.type]}
                  {entry.note && (
                    <span className="block text-caption text-muted">{entry.note}</span>
                  )}
                </th>

                {/* An em dash, not a blank: SIGNUP_CREDIT and
                    SIMULATION_ADJUSTMENT genuinely have no order behind them,
                    and an empty cell reads as missing data. */}
                <td className="py-2 text-left text-muted-strong">
                  {entry.order === null ? (
                    '—'
                  ) : (
                    <Link
                      href={`/stocks/${entry.order.symbol}`}
                      className="text-ink hover:underline"
                    >
                      {entry.order.symbol}
                    </Link>
                  )}
                  {entry.order && (
                    <span className="ml-2 text-caption text-muted">
                      {entry.order.side} · {entry.order.product}
                    </span>
                  )}
                </td>

                {/* Signed, because the sign is the whole meaning of the row —
                    §7 defines every ledger type by which way it moves cash. */}
                <td
                  className={cn(
                    'py-2 text-right tabular-nums',
                    entry.amount > 0 && 'text-up',
                    entry.amount < 0 && 'text-down',
                    entry.amount === 0 && 'text-ink'
                  )}
                >
                  {formatSignedCurrency(entry.amount)}
                </td>

                <td className="py-2 text-right text-ink tabular-nums">
                  {formatCurrency(entry.balanceAfter)}
                </td>

                <td className="py-2 text-right text-muted tabular-nums">
                  {formatWhen(entry.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pager query={query} pages={pages} total={total} />
    </>
  )
}

/**
 * Previous and next as plain links, so paging survives a disabled-JavaScript
 * session and every page has its own URL.
 */
function Pager({ query, pages, total }: { query: LedgerQuery; pages: number; total: number }) {
  const hasPrevious = query.page > 1
  const hasNext = query.page < pages

  return (
    <nav
      aria-label="Ledger pages"
      className="mt-3 flex items-center justify-between text-caption text-muted"
    >
      <p>
        Page {query.page} of {pages} · {total} {total === 1 ? 'entry' : 'entries'}
      </p>

      <span className="flex gap-2">
        {/* Rendered as text rather than a disabled link at the ends: a link to
            nowhere is reachable by keyboard and announces itself as a link. */}
        {hasPrevious ? (
          <Link
            href={ledgerHref({ ...query, page: query.page - 1 })}
            className="rounded-xs px-2 py-1 text-ink hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            ← Previous
          </Link>
        ) : (
          <span className="px-2 py-1 text-muted">← Previous</span>
        )}

        {hasNext ? (
          <Link
            href={ledgerHref({ ...query, page: query.page + 1 })}
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
 * the one the user is reasoning in.
 */
const whenFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatWhen(iso: string): string {
  return whenFormatter.format(new Date(iso))
}
