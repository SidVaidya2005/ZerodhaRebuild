'use client'

import { useTheme } from 'next-themes'
import { useEffect, useRef } from 'react'
import {
  CandlestickSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from 'lightweight-charts'

import { IST_OFFSET_MINUTES } from '@/lib/constants'
import type { CandleInterval } from '@/lib/market/candles/types'

/**
 * The candlestick chart.
 *
 * **It draws once per server render and does not tick.** The intraday series is
 * at best five minutes fresh — that is the `FIVE_MIN` TTL — so a rightmost bar
 * growing in real time would imply a precision the pipeline does not have. It
 * also keeps a canvas well clear of F19's trap, where subscribing to the quote
 * store re-renders a component roughly sixty times a second for the length of
 * the interpolation window. The header LTP still ticks; this does not.
 *
 * Every prop is plain and serialisable, so the whole component can be handed
 * data by a Server Component with nothing to hydrate but the canvas itself.
 */

export type ChartCandle = {
  ts: number
  open: number
  high: number
  low: number
  close: number
}

export type PriceChartProps = {
  candles: readonly ChartCandle[]
  interval: CandleInterval
  /** Named in the accessible description, since a canvas carries no text. */
  symbol: string
}

/**
 * Lightweight Charts wants unix **seconds** for an intraday series and
 * `'YYYY-MM-DD'` strings for a daily one. Mixing the two forms in one series
 * silently drops points rather than erroring, so the choice is made once here
 * off the interval rather than guessed per bar.
 *
 * **Both forms are shifted into IST, and that is the library's own prescription:**
 * it has no time-zone support and processes every value as UTC, so a session
 * running 09:15–15:30 IST drew an axis reading 03:45–10:00. Every other
 * timestamp in this terminal renders in Asia/Kolkata, and an intraday chart
 * labelled in UTC is simply wrong for an Indian market.
 *
 * The shifted value is a **wall-clock instant for rendering only** — it is never
 * read back, never stored, and never reaches a price or an order. `candles.ts`
 * holds the true UTC instant, which is what `prune_candles()` and the 52-week
 * window both work from.
 */
function toTime(ts: number, interval: CandleInterval): Time {
  const ist = ts + IST_OFFSET_MINUTES * 60_000
  if (interval !== 'ONE_DAY') return (ist / 1000) as Time
  // The bar is stamped at IST midnight; its calendar date is what the daily
  // scale keys on.
  return new Date(ist).toISOString().slice(0, 10) as Time
}

/**
 * Canvas cannot read CSS variables — it is drawn outside the cascade — so the
 * tokens are resolved to concrete values and handed to the library. Read from
 * the document rather than hardcoded, so the two themes stay the single source
 * `globals.css` already is.
 */
function resolveTokens() {
  const styles = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
  return {
    up: token('--color-up', '#0ecb81'),
    down: token('--color-down', '#f6465d'),
    hairline: token('--color-hairline', '#2b3139'),
    muted: token('--color-muted', '#929aa5'),
  }
}

export function PriceChart({ candles, interval, symbol }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const theme = resolveTokens()
    const chart = createChart(container, {
      layout: { background: { color: 'transparent' }, textColor: theme.muted },
      grid: { vertLines: { visible: false }, horzLines: { color: theme.hairline } },
      rightPriceScale: { borderColor: theme.hairline },
      timeScale: { borderColor: theme.hairline, timeVisible: interval !== 'ONE_DAY' },
      // The library owns its own ResizeObserver; wiring one by hand duplicates it.
      autoSize: true,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderVisible: false,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    })

    chartRef.current = chart
    seriesRef.current = series

    return () => {
      // The chart is a canvas outside React's tree and leaks on every
      // navigation without this.
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [interval])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) return
    series.setData(
      candles.map((bar): CandlestickData => ({
        time: toTime(bar.ts, interval),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }))
    )
    chartRef.current?.timeScale().fitContent()
  }, [candles, interval])

  // A chart built under dark tokens keeps them after a switch to light unless
  // the resolved values are re-applied — the canvas never re-reads the cascade.
  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return

    const theme = resolveTokens()
    chart.applyOptions({
      layout: { textColor: theme.muted },
      grid: { horzLines: { color: theme.hairline } },
      rightPriceScale: { borderColor: theme.hairline },
      timeScale: { borderColor: theme.hairline },
    })
    series.applyOptions({
      upColor: theme.up,
      downColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    })
  }, [resolvedTheme])

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Candlestick price chart for ${symbol}`}
      // The chart fills its parent and renders nothing at all in a zero-height
      // box, so the height is explicit rather than inherited.
      className="h-[320px] w-full sm:h-[400px]"
    />
  )
}
