import { istDate } from './slots'
import type { CandleInterval, ProviderCandle } from './types'

/**
 * The last `days` trading days of a stored series. 1M and 1Y differ only here.
 *
 * Pure and in its own module for the same reason `slots` and `freshness` are:
 * the trim is a claim about what a range *means*, and a claim worth checking at
 * tier 1 rather than only through `getCandles`, which needs a database.
 *
 * **Intraday series are trimmed by date, not left whole.** `readStored` selects
 * every row for the symbol and interval with no date bound, and `prune_candles`
 * runs at 00:00 IST deleting only the day before — so on day D+1 the table still
 * holds day D's 5-minute bars, and the chart labelled "1D" drew two sessions.
 *
 * Counting the distinct IST dates present, rather than asking the calendar,
 * keeps this honest with no holiday set to thread through: `candleSlots` only
 * ever generates bars on trading days, so a date present in the series *is* a
 * session. That also makes "1D on a Sunday" resolve to Friday for free.
 * (Phase 5 checkpoint)
 */
export function windowSeries(
  candles: readonly ProviderCandle[],
  interval: CandleInterval,
  days: number
): ProviderCandle[] {
  if (interval === 'ONE_DAY') return candles.slice(-days)

  const dates = [...new Set(candles.map((bar) => istDate(new Date(bar.ts))))]
  if (dates.length <= days) return [...candles]

  const keep = new Set(dates.slice(-days))
  return candles.filter((bar) => keep.has(istDate(new Date(bar.ts))))
}
