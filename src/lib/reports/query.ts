import { z } from 'zod'

import { istDateOf, shiftIstDate } from '@/lib/market/market-hours'

/**
 * The Reports page's filtering and paging, as pure functions over the URL.
 *
 * Separate from the page so tier 1 can drive it, the same split F32 made for the
 * ledger: the boundaries are where an off-by-one lives, and `.range()` is
 * 0-based and **inclusive**, which a page-level test would never isolate.
 *
 * **Dates here are IST calendar days, never instants.** `trade_history.traded_on`
 * is the IST date computed in SQL, so everything in this module is a
 * `YYYY-MM-DD` string handed straight to Postgres — no timezone arithmetic
 * happens in TypeScript at all, which is the property that stops a 23:45 IST
 * trade being filed on the previous day.
 */

/**
 * Rows per page.
 *
 * Local rather than in `constants.ts`, for the reason F32 recorded: that module
 * holds the market and money figures Postgres and the Edge Function also depend
 * on, and a page size is neither.
 */
export const REPORTS_PAGE_SIZE = 50

export type ReportsQuery = {
  /** Inclusive IST lower bound, `YYYY-MM-DD`. Null means unbounded. */
  from: string | null
  /** Inclusive IST upper bound, `YYYY-MM-DD`. Null means unbounded. */
  to: string | null
  /** Null means every symbol. */
  symbol: string | null
  /** 1-based, as it appears in the URL. */
  page: number
}

/**
 * `YYYY-MM-DD`, and a date that actually exists.
 *
 * The regex alone accepts `2026-02-31`, which Postgres then rejects as a `date`
 * — turning a hand-edited URL into a failed query rather than a fallback. The
 * round-trip through `toISOString` is what rules that out.
 */
const istDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate, { message: 'not a real calendar date' })

/**
 * True only for a date that exists.
 *
 * `2026-13-01` parses to an Invalid Date whose `toISOString()` **throws**, and
 * `2026-02-31` parses cleanly to 2026-03-03 — so the NaN guard and the
 * round-trip catch different halves of the same problem and both are needed.
 */
function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === value
}

/**
 * A symbol as the seeded universe spells them: upper-case letters, digits,
 * `&` and `-`. Bounded because it reaches a query, and shaped because an
 * unshaped string would let a stale URL ask for something no `<option>` offers.
 */
const symbolSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Z0-9&-]+$/)

const pageSchema = z.coerce.number().int().positive()

const DEFAULT_QUERY: ReportsQuery = { from: null, to: null, symbol: null, page: 1 }

/**
 * Reads the page's view state out of `searchParams`.
 *
 * **Bad input falls back rather than throwing**, per F32: a hand-edited or stale
 * URL is a request for a view that cannot be served, not a server error, and an
 * error boundary over it would be worse than the first page. Each field falls
 * back independently so one bad parameter does not discard a good one.
 *
 * **An inverted range falls back to unbounded rather than to an empty set.** A
 * `from` after its `to` matches nothing, and a Reports page showing nothing is
 * indistinguishable from an account that has never traded — the failure mode
 * F27 hit on Orders, where a filter silently swallowed rows that existed.
 */
export function parseReportsQuery(
  searchParams: Record<string, string | string[] | undefined>
): ReportsQuery {
  const parsedFrom = istDateSchema.safeParse(first(searchParams.from))
  const parsedTo = istDateSchema.safeParse(first(searchParams.to))
  const parsedSymbol = symbolSchema.safeParse(first(searchParams.symbol))
  const parsedPage = pageSchema.safeParse(first(searchParams.page) ?? DEFAULT_QUERY.page)

  let from = parsedFrom.success ? parsedFrom.data : null
  let to = parsedTo.success ? parsedTo.data : null
  if (from !== null && to !== null && from > to) {
    from = null
    to = null
  }

  return {
    from,
    to,
    symbol: parsedSymbol.success ? parsedSymbol.data : null,
    page: parsedPage.success ? parsedPage.data : DEFAULT_QUERY.page,
  }
}

/** Next.js hands a repeated parameter over as an array; the first wins. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * The 0-based, inclusive bounds `.range()` wants, from a 1-based page.
 *
 * `range(from, to)` sets `offset=from` and `limit=to-from+1`, so page 2 of 50 is
 * `range(50, 99)` and **not** `range(50, 100)`, which would return 51 rows and
 * leak one row of the next page onto this one. Verified against Context7 at F32.
 */
export function toRange(
  page: number,
  size: number = REPORTS_PAGE_SIZE
): { from: number; to: number } {
  const from = (page - 1) * size
  return { from, to: from + size - 1 }
}

/**
 * How many pages a total spans. Always at least one, so an empty statement reads
 * "page 1 of 1" rather than "page 1 of 0".
 */
export function pageCount(total: number, size: number = REPORTS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}

function toSearchParams(query: ReportsQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.from !== null) params.set('from', query.from)
  if (query.to !== null) params.set('to', query.to)
  if (query.symbol !== null) params.set('symbol', query.symbol)
  if (query.page !== 1) params.set('page', String(query.page))
  return params
}

/** The querystring for a given view, used by every filter link and pager link. */
export function reportsHref(query: ReportsQuery): string {
  const search = toSearchParams(query).toString()
  return search === '' ? '/reports' : `/reports?${search}`
}

/**
 * The export URL for a view.
 *
 * **`page` is deliberately dropped.** The CSV covers the filtered set, not the
 * page on screen — filtering to a year and receiving 50 rows is not an export
 * anyone wants.
 */
export function exportHref(query: ReportsQuery): string {
  const search = toSearchParams({ ...query, page: 1 }).toString()
  return search === '' ? '/reports/export' : `/reports/export?${search}`
}

export type ReportsPreset = {
  label: string
  query: ReportsQuery
}

/**
 * The quick ranges offered beside the date inputs, in IST.
 *
 * Built from `istDateOf`/`shiftIstDate` rather than local `Date` arithmetic, so
 * a user whose machine is in another timezone gets the same ranges as the
 * market — the whole point of the invariant that IST is decided in one place.
 *
 * **"This FY" is April to March**, the Indian financial year, because that is
 * the period a P&L statement is read against here.
 */
export function reportsPresets(now: Date): readonly ReportsPreset[] {
  const today = istDateOf(now)
  const [year, month] = today.split('-').map(Number) as [number, number, number]
  const fyStartYear = month >= 4 ? year : year - 1

  return [
    { label: 'All time', query: { ...DEFAULT_QUERY } },
    {
      label: 'Last 30 days',
      query: { from: shiftIstDate(today, -29), to: today, symbol: null, page: 1 },
    },
    {
      label: 'This month',
      query: {
        from: `${today.slice(0, 7)}-01`,
        to: today,
        symbol: null,
        page: 1,
      },
    },
    {
      label: 'This FY',
      query: { from: `${fyStartYear}-04-01`, to: today, symbol: null, page: 1 },
    },
  ]
}

/** True when a preset describes the view currently on screen. */
export function isActivePreset(preset: ReportsPreset, query: ReportsQuery): boolean {
  return preset.query.from === query.from && preset.query.to === query.to
}
