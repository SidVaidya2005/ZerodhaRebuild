import type { Metadata } from 'next'

import { OrderChannel } from '@/components/terminal/OrderChannel'
import { ReportsFilter } from '@/components/terminal/ReportsFilter'
import { ReportsSummaryCards } from '@/components/terminal/ReportsSummaryCards'
import { TradeHistoryTable } from '@/components/terminal/TradeHistoryTable'
import { compositeSource } from '@/lib/market/screen-provenance'
import { exportHref, parseReportsQuery, reportsPresets, toRange } from '@/lib/reports/query'
import { TRADE_HISTORY_COLUMNS, toTradeRow } from '@/lib/reports/rows'
import type { ReportsSummary, UnrealisedSummary } from '@/lib/reports/types'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Reports — ZerodhaRebuild',
}

/**
 * The completed-trade statement.
 *
 * **Two scopes on one page, kept visibly apart.** The trade history and its
 * totals describe the *filtered* set; unrealised P&L describes the portfolio
 * right now and obeys no filter. `ReportsSummaryCards` renders them as separate
 * sections for that reason — merging them would imply a date range unrealised
 * does not have.
 *
 * **Every money figure is computed by Postgres.** `reports_summary` does the
 * filtered sums and `portfolio_summary` the unrealised one, per `CLAUDE.md`'s
 * money rule. This component selects and narrows; it adds no two numbers
 * together.
 *
 * **The filter is written once for the rows.** PostgREST's `count: 'exact'`
 * returns the row count under the same clause the rows came from, and
 * `reports_summary` derives its own `trade_count` independently — the pager
 * shows one and the summary the other, so a disagreement would be visible rather
 * than silent. `19-reports.sql` asserts they agree.
 *
 * A Server Component with no quote subscription: the trades are settled facts.
 * `OrderChannel` is mounted because a fill writes a trade, and trades are server
 * state that never enters Zustand (F27).
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = parseReportsQuery(await searchParams)
  const { from, to } = toRange(query.page)
  const now = new Date()

  const supabase = await createClient()

  // Built before awaiting so the filter reaches the count as well as the rows —
  // a count of every trade beside a filtered page would report pages that do not
  // exist (F32).
  let historyQuery = supabase
    .from('trade_history')
    .select(TRADE_HISTORY_COLUMNS, { count: 'exact' })
    // `.range()` is 0-based and inclusive and needs a companion order, or the
    // page boundaries are non-deterministic. `clock_timestamp()` already
    // separates rows within one fill; the id breaks any remaining tie.
    .order('traded_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to)

  if (query.from !== null) historyQuery = historyQuery.gte('traded_on', query.from)
  if (query.to !== null) historyQuery = historyQuery.lte('traded_on', query.to)
  if (query.symbol !== null) historyQuery = historyQuery.eq('symbol', query.symbol)

  const [
    {
      data: { user },
    },
    { data: tradeRows, error: historyError, count },
    { data: summaryRows, error: summaryError },
    { data: symbolRows, error: symbolsError },
    { data: portfolioRow, error: portfolioError },
    { data: holdingRows, error: holdingsError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    historyQuery,
    supabase.rpc('reports_summary', {
      p_from: query.from ?? undefined,
      p_to: query.to ?? undefined,
      p_symbol: query.symbol ?? undefined,
    }),
    supabase.from('traded_symbols').select('symbol, name').order('symbol'),
    supabase
      .from('portfolio_summary')
      .select('overall_pnl, holding_count, unpriced_count')
      .maybeSingle(),
    // Only the provenance inputs: the figure itself comes from the view above,
    // and reading the rows to re-derive it would put a money sum here.
    supabase.from('portfolio_holdings').select('provider, provider_ts').not('ltp', 'is', null),
  ])

  // Logged rather than thrown. An empty statement and a failed query render
  // identically, which is exactly how a broken read hides behind a plausible
  // empty state (F30, F32).
  //
  // **PGRST103 is expected, not a fault.** PostgREST refuses an offset past the
  // end of the set — a bookmarked `?page=3` that outlives its trades — and
  // returns null rows *and a null count*. That is why the pager's total comes
  // from `reports_summary` below rather than from this query: a total that
  // vanishes exactly when the page is out of range cannot tell "past the end"
  // apart from "never traded".
  if (historyError && historyError.code !== 'PGRST103') {
    console.error('[reports] trade_history', historyError)
  }
  if (summaryError) console.error('[reports] reports_summary', summaryError)
  if (symbolsError) console.error('[reports] traded_symbols', symbolsError)
  if (portfolioError) console.error('[reports] portfolio_summary', portfolioError)
  if (holdingsError) console.error('[reports] portfolio_holdings', holdingsError)

  const trades = (tradeRows ?? []).map(toTradeRow)

  // The function returns a set; one row, or none if the read failed.
  const summaryRow = summaryRows?.[0]
  const summary: ReportsSummary = {
    tradeCount: Number(summaryRow?.trade_count ?? 0),
    realisedPnl: Number(summaryRow?.realised_pnl ?? 0),
    chargesTotal: Number(summaryRow?.charges_total ?? 0),
    buyValue: Number(summaryRow?.buy_value ?? 0),
    sellValue: Number(summaryRow?.sell_value ?? 0),
  }

  // The two counts are derived independently — PostgREST counts the rows it
  // returned under its own filter clause, `reports_summary` counts under the
  // function's. They must agree, and a disagreement means the two filters have
  // drifted apart, which would put a pager on screen that does not describe the
  // set the totals above it are summing. Null is not a disagreement: it is the
  // PGRST103 case above.
  if (count !== null && count !== summary.tradeCount) {
    console.error('[reports] filter drift', { postgrest: count, summary: summary.tradeCount })
  }

  // Paired pessimistically, as F20's index strip is: every provider is assessed
  // against the oldest timestamp among them, so the claim can under-state its
  // freshness but never over-state it.
  const priced = holdingRows ?? []
  const providers = priced
    .map((row) => row.provider)
    .filter((p): p is NonNullable<typeof p> => p !== null)
  const timestamps = priced
    .map((row) => row.provider_ts)
    .filter((ts): ts is string => ts !== null)
    .sort()
  const oldestProviderTs = timestamps[0] ?? null

  const unrealised: UnrealisedSummary = {
    unrealisedPnl: Number(portfolioRow?.overall_pnl ?? 0),
    holdingCount: Number(portfolioRow?.holding_count ?? 0),
    unpricedCount: Number(portfolioRow?.unpriced_count ?? 0),
    source: compositeSource(
      providers,
      oldestProviderTs === null ? null : new Date(oldestProviderTs),
      now
    ),
    oldestProviderTs,
  }

  const isFiltered = query.from !== null || query.to !== null || query.symbol !== null
  const symbols = (symbolRows ?? []).map((row) => ({
    symbol: row.symbol ?? '',
    name: row.name ?? '',
  }))

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-title text-ink">Reports</h1>
          <p className="mt-1 text-body-sm text-muted">
            Every completed trade, what it cost, and the profit it realised.
          </p>
        </div>

        {/* A plain anchor, not `next/link`: the target is a route handler that
            returns a file, and a client navigation to it would replace the page
            rather than download. */}
        {summary.tradeCount > 0 && (
          <a
            href={exportHref(query)}
            className="rounded-xs border border-hairline px-3 py-2 text-body-sm text-ink hover:bg-surface-elevated focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
          >
            Export CSV
            <span className="sr-only"> — downloads every trade matching the current filters</span>
          </a>
        )}
      </div>

      {/* Renders nothing. Re-renders this page when a fill writes a trade. */}
      {user ? <OrderChannel userId={user.id} /> : null}

      <div className="mt-6">
        <ReportsFilter
          query={query}
          presets={reportsPresets(now)}
          symbols={symbols}
          disabled={symbols.length === 0 && !isFiltered}
        />
      </div>

      <div className="mt-6">
        <ReportsSummaryCards summary={summary} unrealised={unrealised} filtered={isFiltered} />
      </div>

      <section className="mt-8" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-title-sm font-semibold text-ink">
          Trade history
        </h2>

        <div className="mt-4">
          {/* The total comes from Postgres, not from the row query's count,
              which is null whenever the requested page is past the end. */}
          <TradeHistoryTable trades={trades} total={summary.tradeCount} query={query} />
        </div>
      </section>
    </div>
  )
}
