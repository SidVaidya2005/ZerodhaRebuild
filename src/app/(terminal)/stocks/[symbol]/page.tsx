import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { OrderChannel } from '@/components/terminal/OrderChannel'
import { StockActions } from '@/components/terminal/StockActions'
import { StockChartCard } from '@/components/terminal/StockChartCard'
import { StockHeader } from '@/components/terminal/StockHeader'
import { StockPosition } from '@/components/terminal/StockPosition'
import { StockStats } from '@/components/terminal/StockStats'
import { getCandles } from '@/lib/market/candles/service'
import { type CandleRange } from '@/lib/market/candles/types'
import { createClient } from '@/lib/supabase/server'

type StockPageProps = {
  params: Promise<{ symbol: string }>
  searchParams: Promise<{ range?: string }>
}

/** `?range=` is user input; anything unrecognised falls back rather than throwing. */
function parseRange(value: string | undefined): CandleRange {
  return value === '1D' || value === '1W' || value === '1M' || value === '1Y' ? value : '1M'
}

export async function generateMetadata({ params }: StockPageProps): Promise<Metadata> {
  const { symbol } = await params
  return { title: `${symbol.toUpperCase()} — ZerodhaRebuild` }
}

/**
 * `/stocks/[symbol]` — the instrument page.
 *
 * Dynamic and with no index: there is no useful page listing 200 instruments, so
 * this is reached by search or by clicking a symbol. **The symbol is validated
 * against `instruments`** rather than echoed, so a typed URL 404s instead of
 * rendering a heading for a stock that does not exist.
 *
 * **The candle read runs as the service role, the rest as the user.** `candles`
 * and `candle_sync` grant nothing to `authenticated` (F10), so `getCandles` uses
 * the admin client internally; every user-owned read below stays on the
 * RLS-scoped client, where `auth.uid()` is the security boundary.
 *
 * **No quote subscription of its own.** The terminal layout's `QuoteChannel`
 * already carries the watchlist and held symbols; `OrderChannel` is here for a
 * different reason — a fill changes the exposure card below, and that is server
 * state that never enters Zustand.
 */
export default async function StockPage({ params, searchParams }: StockPageProps) {
  const [{ symbol: raw }, { range: rawRange }] = await Promise.all([params, searchParams])
  const symbol = raw.toUpperCase()
  const range = parseRange(rawRange)

  const supabase = await createClient()

  const [
    {
      data: { user },
    },
    { data: instrument },
    { data: quote },
    { data: holding },
    { data: position },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('instruments')
      .select('symbol, name, exchange')
      .eq('symbol', symbol)
      .maybeSingle(),
    supabase
      .from('quotes')
      .select('ltp, prev_close, provider, provider_ts, fetched_at')
      .eq('symbol', symbol)
      .maybeSingle(),
    supabase
      .from('portfolio_holdings')
      .select('quantity, average_price')
      .eq('symbol', symbol)
      .maybeSingle(),
    supabase
      .from('portfolio_positions')
      .select('net_quantity, average_price')
      .eq('symbol', symbol)
      .maybeSingle(),
  ])

  if (!instrument) notFound()

  // Awaited after the instrument check, so a 404 costs no provider work and no
  // cache write for a symbol that does not exist.
  const series = await getCandles(symbol, range)

  // The 52-week range needs a *year* of dailies, so the reuse test is the
  // window, not the interval. `1M` is also `ONE_DAY` but `getCandles` has
  // already trimmed it to 22 bars — reusing it there reported the one-month
  // high and low as the 52-week range on the default view of every stock page.
  // (Phase 5 checkpoint)
  const daily = range === '1Y' ? series : await getCandles(symbol, '1Y')

  return (
    <div className="space-y-4">
      {user && <OrderChannel userId={user.id} />}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <StockHeader
          symbol={instrument.symbol}
          name={instrument.name ?? symbol}
          exchange={instrument.exchange ?? 'NSE'}
          quote={{
            ltp: quote?.ltp ?? null,
            prevClose: quote?.prev_close ?? null,
            provider: quote?.provider ?? null,
            providerTs: quote?.provider_ts ?? null,
            fetchedAt: quote?.fetched_at ?? null,
          }}
        />
        <StockActions symbol={symbol} />
      </div>

      <StockChartCard
        symbol={symbol}
        range={range}
        interval={series.interval}
        candles={series.candles}
        staleSince={series.isStale ? series.fetchedAt : null}
      />

      <StockStats today={daily.candles.at(-1) ?? null} daily={daily.candles} />

      <StockPosition
        holding={
          holding && holding.quantity !== null && holding.average_price !== null
            ? { quantity: holding.quantity, averagePrice: holding.average_price }
            : null
        }
        position={
          position && position.net_quantity !== null && position.average_price !== null
            ? { quantity: position.net_quantity, averagePrice: position.average_price }
            : null
        }
      />
    </div>
  )
}
