import { FIFTY_TWO_WEEK_MIN_SPAN_DAYS } from '@/lib/constants'
import type { ProviderCandle } from '@/lib/market/candles/types'
import { formatCurrency, formatQuantity } from '@/lib/utils'

/**
 * The day's OHLC and volume, plus the 52-week range.
 *
 * **The 52-week range is derived from the stored `ONE_DAY` series**, not from a
 * column and not from a second fetch: `quotes` has no 52-week columns, Yahoo is
 * deferred to the end of the project, and the daily series already spans exactly
 * that window. `prune_candles()` keeps 400 days rather than 365 so a prune
 * cannot race this read and shorten the range it reports.
 *
 * Every figure here is read or selected, never accumulated into anything stored
 * — this is display arithmetic over rows Postgres produced.
 */

export type StockStatsProps = {
  /** The most recent daily bar, which is the day's OHLC. Null when none exists. */
  today: ProviderCandle | null
  /** The stored daily series, for the 52-week extremes. */
  daily: readonly ProviderCandle[]
}

/** Exported for the tier-1 test: the window is a claim worth checking. */
export function fiftyTwoWeekRange(
  daily: readonly ProviderCandle[],
  now: Date
): { high: number; low: number } | null {
  const since = now.getTime() - 365 * 86_400_000
  const inWindow = daily.filter((bar) => bar.ts >= since)
  if (inWindow.length === 0) return null

  // **A short series must be refused, and counting bars cannot detect one.** The
  // guard here was `inWindow.length === 0`, which only ever caught an *empty*
  // series: 22 daily bars all fall inside 365 days, so the one-month high and
  // low were returned under a "52-week" label. The honest test is the span the
  // series actually covers. (Phase 5 checkpoint)
  const oldest = Math.min(...inWindow.map((bar) => bar.ts))
  if (now.getTime() - oldest < FIFTY_TWO_WEEK_MIN_SPAN_DAYS * 86_400_000) return null

  return {
    high: Math.max(...inWindow.map((bar) => bar.high)),
    low: Math.min(...inWindow.map((bar) => bar.low)),
  }
}

export function StockStats({ today, daily }: StockStatsProps) {
  const range = fiftyTwoWeekRange(daily, new Date())

  const cells: Array<{ label: string; value: string }> = [
    { label: 'Open', value: today ? formatCurrency(today.open) : '—' },
    { label: 'High', value: today ? formatCurrency(today.high) : '—' },
    { label: 'Low', value: today ? formatCurrency(today.low) : '—' },
    { label: 'Close', value: today ? formatCurrency(today.close) : '—' },
    {
      label: 'Volume',
      value: today?.volume === null || today === null ? '—' : formatQuantity(today.volume),
    },
    { label: '52-week high', value: range ? formatCurrency(range.high) : '—' },
    { label: '52-week low', value: range ? formatCurrency(range.low) : '—' },
  ]

  return (
    <section
      aria-label="Price statistics"
      className="rounded-lg border border-hairline bg-surface p-4"
    >
      {/* A description list, because each figure is a term and its value. The
          `div` grouping a dt/dd pair is what HTML5 permits inside a `dl`. */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {cells.map((cell) => (
          <div key={cell.label}>
            <dt className="text-caption text-muted">{cell.label}</dt>
            <dd className="text-number text-ink tabular-nums">{cell.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
