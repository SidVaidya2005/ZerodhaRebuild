import Link from 'next/link'

import { PriceChart, type ChartCandle } from '@/components/terminal/PriceChart'
import type { CandleInterval, CandleRange } from '@/lib/market/candles/types'
import { cn } from '@/lib/utils'

/**
 * The chart and its range switcher.
 *
 * **A Server Component.** Range switching goes through `?range=`, so each range
 * is a server render rather than a client fetch: the URL is shareable, the back
 * button works, and the switcher operates with no JavaScript. Only the canvas
 * below hydrates.
 *
 * 1M and 1Y both resolve to `ONE_DAY` and are two windows over the one stored
 * series, so moving between them reaches no provider at all.
 */

const RANGES: CandleRange[] = ['1D', '1W', '1M', '1Y']

export type StockChartCardProps = {
  symbol: string
  range: CandleRange
  interval: CandleInterval
  candles: readonly ChartCandle[]
  /** Shown when the refresh failed and these rows are older than the TTL allows. */
  staleSince: Date | null
}

export function StockChartCard({
  symbol,
  range,
  interval,
  candles,
  staleSince,
}: StockChartCardProps) {
  return (
    <section
      aria-label={`Price chart for ${symbol}`}
      className="rounded-lg border border-hairline bg-surface p-4"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Chart range" className="flex gap-1">
          {RANGES.map((option) => {
            const active = option === range
            return (
              <Link
                key={option}
                href={`/stocks/${symbol}?range=${option}`}
                // The page is long enough to scroll; jumping to the top on a
                // range switch would lose the reader's place in it.
                scroll={false}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'rounded px-3 py-1 text-body-sm tabular-nums transition-colors',
                  active
                    ? 'bg-surface-elevated text-ink'
                    : 'text-muted hover:bg-surface-elevated hover:text-ink'
                )}
              >
                {option}
              </Link>
            )
          })}
        </nav>

        {/* The real age, never hidden. An empty chart beside a live header would
            be the dishonest option — `library-docs.md` is explicit that stale
            rows are served with their age rather than replaced by nothing. */}
        {staleSince !== null && (
          <p className="text-caption text-muted">
            Could not refresh. Showing data from{' '}
            <time dateTime={staleSince.toISOString()}>
              {staleSince.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            </time>
            .
          </p>
        )}
      </div>

      {candles.length === 0 ? (
        <div className="flex h-[320px] items-center justify-center sm:h-[400px]">
          <p className="max-w-sm text-center text-body-sm text-muted">
            No price history is available for {symbol} over this range yet. It appears once the
            instrument has traded in a session we have recorded.
          </p>
        </div>
      ) : (
        <PriceChart candles={candles} interval={interval} symbol={symbol} />
      )}
    </section>
  )
}
