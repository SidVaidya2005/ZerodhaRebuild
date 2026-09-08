import { z } from 'zod'

import { Constants } from '@/types/database'

/**
 * The Funds ledger's paging and filtering, as pure functions over the URL.
 *
 * Separate from the page so tier 1 can drive it: the boundaries are where an
 * off-by-one lives, and `.range()` is 0-based and **inclusive**, which is the
 * detail a page-level test would never isolate.
 *
 * **The filter's vocabulary is read from the generated types, not restated.**
 * `Constants.public.Enums.ledger_type` is the enum Postgres actually holds, so a
 * ninth `ledger_type` added in SQL widens this filter automatically instead of
 * silently going missing from it — the same reasoning F26 used for its rejection
 * codes.
 */

export const LEDGER_TYPES = Constants.public.Enums.ledger_type
export type LedgerType = (typeof LEDGER_TYPES)[number]

/**
 * What each row type is called on screen.
 *
 * A `Record<LedgerType, string>` rather than a lookup with a fallback, so a
 * ninth type added in SQL fails `pnpm typecheck` here instead of rendering as
 * `SIMULATION_ADJUSTMENT` to a user — the same closed-set discipline F26 applied
 * to its rejection codes.
 */
export const LEDGER_TYPE_LABEL: Record<LedgerType, string> = {
  SIGNUP_CREDIT: 'Opening credit',
  MARGIN_BLOCK: 'Margin blocked',
  MARGIN_RELEASE: 'Margin released',
  BUY_DEBIT: 'Buy',
  SELL_CREDIT: 'Sell',
  CHARGES: 'Charges',
  REALISED_PNL: 'Realised P&L',
  // §6's loss cap: the remainder written back when a cover would have driven
  // cash below zero. Named plainly because it is a divergence from a real
  // broker and /legal discloses it as one.
  SIMULATION_ADJUSTMENT: 'Simulation adjustment',
}

/**
 * Rows per page.
 *
 * Local rather than in `constants.ts`: that module holds the market and money
 * figures the Edge Function and Postgres also depend on, and a page size is
 * neither. Putting it there would imply the database cares.
 */
export const LEDGER_PAGE_SIZE = 50

export type LedgerQuery = {
  /** Null means unfiltered — every type. */
  type: LedgerType | null
  /** 1-based, as it appears in the URL. */
  page: number
}

const ledgerQuerySchema = z.object({
  type: z.enum(LEDGER_TYPES).nullable(),
  page: z.coerce.number().int().positive(),
})

const DEFAULT_QUERY: LedgerQuery = { type: null, page: 1 }

/**
 * Reads the ledger's view state out of `searchParams`.
 *
 * **Bad input falls back rather than throwing.** A hand-edited or stale URL —
 * `?page=abc`, `?page=0`, a `type` from a build where the enum differed — is a
 * request for a page that cannot be served, not a server error, and rendering an
 * error boundary over it would be worse than showing the first page. Each field
 * falls back independently so one bad parameter does not discard a good one.
 */
export function parseLedgerQuery(
  searchParams: Record<string, string | string[] | undefined>
): LedgerQuery {
  const type = first(searchParams.type)
  const page = first(searchParams.page)

  const parsedType = ledgerQuerySchema.shape.type.safeParse(type ?? null)
  const parsedPage = ledgerQuerySchema.shape.page.safeParse(page ?? DEFAULT_QUERY.page)

  return {
    type: parsedType.success ? parsedType.data : DEFAULT_QUERY.type,
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
 * Verified against Context7: `range(from, to)` sets `offset=from` and
 * `limit=to-from+1`, so page 2 of 50 is `range(50, 99)` and **not**
 * `range(50, 100)`, which would return 51 rows and leak one row of the next page
 * onto this one.
 */
export function toRange(
  page: number,
  size: number = LEDGER_PAGE_SIZE
): { from: number; to: number } {
  const from = (page - 1) * size
  return { from, to: from + size - 1 }
}

/**
 * How many pages a total spans. Always at least one, so an empty ledger renders
 * "page 1 of 1" rather than "page 1 of 0".
 */
export function pageCount(total: number, size: number = LEDGER_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}

/** The querystring for a given view, used by every filter and pager link. */
export function ledgerHref(query: LedgerQuery): string {
  const params = new URLSearchParams()
  if (query.type !== null) params.set('type', query.type)
  if (query.page !== 1) params.set('page', String(query.page))
  const search = params.toString()
  return search === '' ? '/funds' : `/funds?${search}`
}
