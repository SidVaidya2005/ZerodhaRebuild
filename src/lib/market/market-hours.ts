/**
 * The app's door onto the session logic.
 *
 * Everything here is implemented in `supabase/functions/_shared/market-hours.ts`
 * and re-exported: the Edge Function runs on Deno and cannot import from `src/`,
 * so the one implementation lives where both runtimes can reach it. App code
 * still imports from `@/lib/market/market-hours`, which keeps the `@shared`
 * detail out of feature code and satisfies `code-standards.md` → Import
 * Conventions.
 *
 * There is nothing to keep in step, because there is nothing duplicated. The
 * gate the tick asks and the gate the terminal renders are the same function.
 */

export {
  getMarketStatus,
  isTradingDay,
  isTradingSession,
  isTradingSessionAt,
  loadHolidays,
  marketStatusAt,
  type HolidayReader,
  type HolidaySet,
  type MarketState,
  type MarketStatus,
} from '@shared/market-hours.ts'
