import type { Metadata } from 'next'

import { FundsCards } from '@/components/terminal/FundsCards'
import { LedgerFilter } from '@/components/terminal/LedgerFilter'
import { LedgerTable } from '@/components/terminal/LedgerTable'
import { OrderChannel } from '@/components/terminal/OrderChannel'
import { ResetAccountDialog } from '@/components/terminal/ResetAccountDialog'
import { parseLedgerQuery, toRange } from '@/lib/funds/ledger'
import type { FundsOverview, LedgerEntry } from '@/lib/funds/types'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Funds — ZerodhaRebuild',
}

/**
 * Cash, the ledger behind it, and account reset.
 *
 * **The one terminal page that reads no prices.** Every figure is a stored fact
 * or a sum over closed trades, so nothing ticks, nothing needs an anchor, and
 * nothing carries provenance — which is why the cards and the table are Server
 * Components with no client counterpart. Guard that property: adding unrealised
 * P&L here would pull in quotes, the anchor rule and the unpriced disclosure all
 * at once, to restate a figure Dashboard and Holdings already show.
 *
 * `funds_overview` does the sum and the counts, per `CLAUDE.md`'s money rule.
 *
 * `OrderChannel` is mounted because a fill moves cash and writes ledger rows,
 * and both are server state that never enters Zustand.
 */
export default async function FundsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseLedgerQuery(await searchParams)
  const { from, to } = toRange(query.page)

  const supabase = await createClient()

  // Built before awaiting so the filter is applied to the count as well as the
  // rows — a count of the whole ledger beside a filtered page would report
  // pages that do not exist.
  let ledgerQuery = supabase
    .from('fund_ledger')
    .select('id, type, amount, balance_after, note, created_at, orders(symbol, side, product)', {
      count: 'exact',
    })
    // `.range()` is 0-based and inclusive and needs a companion order, or the
    // page boundaries are non-deterministic. `clock_timestamp()` already
    // separates rows within one fill; the id breaks any remaining tie.
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to)

  if (query.type !== null) ledgerQuery = ledgerQuery.eq('type', query.type)

  const [
    {
      data: { user },
    },
    { data: overviewRow, error: overviewError },
    { data: ledgerRows, error: ledgerError, count },
  ] = await Promise.all([supabase.auth.getUser(), overviewSelect(supabase), ledgerQuery])

  // Logged rather than thrown. An empty ledger and a failed query render
  // identically, which is exactly how a broken read hides behind a plausible
  // empty state.
  if (overviewError) console.error('[funds] funds_overview', overviewError)
  if (ledgerError) console.error('[funds] fund_ledger', ledgerError)

  const overview: FundsOverview = {
    availableCash: Number(overviewRow?.available_cash ?? 0),
    usedMargin: Number(overviewRow?.used_margin ?? 0),
    openingBalance: Number(overviewRow?.opening_balance ?? 0),
    realisedPnl: Number(overviewRow?.realised_pnl ?? 0),
    orderCount: Number(overviewRow?.order_count ?? 0),
    tradeCount: Number(overviewRow?.trade_count ?? 0),
    holdingCount: Number(overviewRow?.holding_count ?? 0),
    positionCount: Number(overviewRow?.position_count ?? 0),
    ledgerCount: Number(overviewRow?.ledger_count ?? 0),
  }

  const entries: LedgerEntry[] = (ledgerRows ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    note: row.note,
    createdAt: row.created_at,
    // The embed returns the related row or null; a ledger row with no order is
    // normal, not missing data.
    order: row.orders
      ? {
          symbol: row.orders.symbol,
          side: row.orders.side,
          product: row.orders.product,
        }
      : null,
  }))

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-title text-ink">Funds</h1>
          <p className="mt-1 text-body-sm text-muted">
            Simulated cash, the margin held against it, and every movement between them.
          </p>
        </div>
        <ResetAccountDialog overview={overview} />
      </div>

      {user ? <OrderChannel userId={user.id} /> : null}

      <div className="mt-6">
        <FundsCards overview={overview} />
      </div>

      <section className="mt-8" aria-labelledby="ledger-heading">
        <h2 id="ledger-heading" className="text-title-sm font-semibold text-ink">
          Ledger
        </h2>
        <p className="mt-1 text-body-sm text-muted">
          Every row is one change to available cash, with the balance it left behind.
        </p>

        <div className="mt-4">
          <LedgerFilter query={query} disabled={overview.ledgerCount === 0} />
        </div>

        <div className="mt-4">
          <LedgerTable entries={entries} total={count ?? 0} query={query} />
        </div>
      </section>
    </div>
  )
}

/** Split out only to keep the `Promise.all` above readable. */
function overviewSelect(supabase: Awaited<ReturnType<typeof createClient>>) {
  return supabase
    .from('funds_overview')
    .select(
      'available_cash, used_margin, opening_balance, realised_pnl, order_count, trade_count, holding_count, position_count, ledger_count'
    )
    .maybeSingle()
}
