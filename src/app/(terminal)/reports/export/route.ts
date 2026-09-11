import { NextResponse, type NextRequest } from 'next/server'

import { csvFilename, tradesToCsv } from '@/lib/reports/csv'
import { parseReportsQuery } from '@/lib/reports/query'
import { TRADE_HISTORY_COLUMNS, toTradeRow } from '@/lib/reports/rows'
import { createClient } from '@/lib/supabase/server'

/**
 * The trade history as a downloadable CSV.
 *
 * **A route handler rather than a Server Action, and `code-standards.md` names
 * it as the third one.** The Server Action rule governs *mutations*; this is a
 * read that produces a file, and expressing it as a URL is what buys a native
 * browser download, a link that works with JavaScript disabled, and an export
 * that is not squeezed through an action payload. The page links to it with a
 * plain `<a>`, never `next/link`, which would attempt a client navigation.
 *
 * **The export covers the filtered set, not the page on screen** — the same
 * three filters as `/reports`, parsed by the same function, with no `.range()`.
 * Filtering to a year and receiving fifty rows is not an export anyone wants.
 *
 * Everything here except the read is pure and tested at tier 1: no tier can
 * drive a route handler holding a session cookie, so the CSV itself is
 * falsifiable in `csv.test.ts` and this file stays thin enough to read.
 */
export async function GET(request: NextRequest) {
  const query = parseReportsQuery(Object.fromEntries(request.nextUrl.searchParams.entries()))

  const supabase = await createClient()

  // RLS would return an empty set to an unauthenticated caller, and an empty
  // CSV reads as "you have no trades" rather than "you are not signed in".
  // Refusing is the honest answer, and the proxy already guards `/reports/`.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 })
  }

  let historyQuery = supabase
    .from('trade_history')
    .select(TRADE_HISTORY_COLUMNS)
    .order('traded_at', { ascending: false })
    .order('id', { ascending: false })

  if (query.from !== null) historyQuery = historyQuery.gte('traded_on', query.from)
  if (query.to !== null) historyQuery = historyQuery.lte('traded_on', query.to)
  if (query.symbol !== null) historyQuery = historyQuery.eq('symbol', query.symbol)

  const { data, error } = await historyQuery

  // A failed read must not download as an empty file: a spreadsheet with only a
  // header is indistinguishable from an account that has never traded, and the
  // user would file it as a true record of nothing.
  if (error) {
    console.error('[reports.export] trade_history', error)
    return NextResponse.json({ error: 'EXPORT_FAILED' }, { status: 500 })
  }

  const trades = (data ?? []).map(toTradeRow)

  return new NextResponse(tradesToCsv(trades), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${csvFilename(query)}"`,
      // One user's trade history: never cached by a proxy, and not worth
      // caching in the browser either, since a fill changes it.
      'cache-control': 'no-store, private',
    },
  })
}
