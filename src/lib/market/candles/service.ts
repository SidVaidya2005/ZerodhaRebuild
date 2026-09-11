import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { loadHolidays, type HolidaySet } from '@shared/market-hours.ts'
import type { QuoteProviderName } from '@shared/provenance.ts'

import { isFresh } from './freshness'
import { createSimulatorCandleProvider } from './simulator'
import { candleSlots } from './slots'
import {
  RANGE_INTERVAL,
  RANGE_TRADING_DAYS,
  type CandleInterval,
  type CandleProvider,
  type CandleRange,
  type ProviderCandle,
} from './types'

/**
 * The candle read path.
 *
 * **It runs through `createAdminClient()`.** `candles` and `candle_sync` grant
 * nothing to `authenticated` and carry no write policy — F10 made the service
 * role the only writer deliberately, so a page that wants to *fill* the cache
 * cannot do it as the signed-in user. The `server-only` import above is what
 * keeps that from ever reaching a browser bundle.
 *
 * **Immutable history lives here, not in the simulator.** The generator is pure,
 * but the anchor a batch is bridged to moves as the day does; what actually
 * stops the chart rewriting its past is that this module only ever generates the
 * slots it does not already hold, plus the one still forming. Every earlier bar
 * is read back untouched.
 */

export type CandleSeries = {
  interval: CandleInterval
  candles: ProviderCandle[]
  /** Which provider produced the stored series. Null when nothing is stored. */
  provider: QuoteProviderName | null
  /** When the series was last refreshed. Null when nothing is stored. */
  fetchedAt: Date | null
  /**
   * True when the refresh was attempted and failed, so these rows are older than
   * the TTL allows. The page surfaces the real age rather than hiding it — an
   * empty chart beside a live header would be the dishonest option.
   */
  isStale: boolean
}

/** The chain, in order. Yahoo goes in front of the simulator when it lands. */
function candleProviders(): CandleProvider[] {
  return [createSimulatorCandleProvider()]
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>

/** Rows out of `candles`, oldest first, as the generator and the chart want them. */
function toProviderCandles(
  rows: Array<{
    ts: string
    open: number
    high: number
    low: number
    close: number
    volume: number | null
  }>
): ProviderCandle[] {
  return rows
    .map((row) => ({
      ts: new Date(row.ts).getTime(),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: row.volume === null ? null : Number(row.volume),
    }))
    .sort((a, b) => a.ts - b.ts)
}

async function readStored(
  supabase: SupabaseAdmin,
  symbol: string,
  interval: CandleInterval
): Promise<ProviderCandle[]> {
  const { data, error } = await supabase
    .from('candles')
    .select('ts, open, high, low, close, volume')
    .eq('symbol', symbol)
    .eq('interval', interval)
    .order('ts', { ascending: true })

  if (error) {
    console.error('[candles] read', error)
    return []
  }
  return toProviderCandles(data ?? [])
}

/**
 * Fill the gap between what is stored and what the calendar says should exist.
 *
 * **Returns the merged series rather than a signal to go and re-read it.** A
 * second `readStored()` after the upsert looked obvious and was wrong: Next
 * memoizes identical GET fetches within one render pass, supabase-js is built on
 * `fetch`, so the post-write read replayed the pre-write result and the page
 * drew an empty chart over 276 rows it had just written. `cache: 'no-store'`
 * does not defeat that — memoization is not the Data Cache. Returning what we
 * generated removes the round trip and the dependency on read-after-write
 * semantics together.
 *
 * Null when every provider declined — which the caller turns into "serve what we
 * have, and say how old it is" rather than an empty chart.
 */
async function refresh(
  supabase: SupabaseAdmin,
  symbol: string,
  interval: CandleInterval,
  stored: ProviderCandle[],
  at: Date,
  holidays: HolidaySet
): Promise<{ provider: QuoteProviderName; candles: ProviderCandle[] } | null> {
  const slots = candleSlots(interval, at, holidays)
  if (slots.length === 0) return null

  const [{ data: instrument }, { data: quote }] = await Promise.all([
    supabase.from('instruments').select('tick_size, prev_close').eq('symbol', symbol).maybeSingle(),
    supabase.from('quotes').select('ltp, prev_close').eq('symbol', symbol).maybeSingle(),
  ])

  // The same preference `loadAnchors` makes in `market-tick` (F16): the rolled
  // close beats the bhavcopy seed, because reading the seed is what trapped every
  // simulated price within 5% of the day the universe was seeded. The seed is
  // still the fallback — on a cold start it is the only close there is.
  const endClose =
    interval === 'ONE_DAY'
      ? (quote?.prev_close ?? instrument?.prev_close ?? null)
      : (quote?.ltp ?? quote?.prev_close ?? instrument?.prev_close ?? null)

  // **The append-only rule.** Every slot already stored is left alone; only the
  // ones after it, plus the bar still forming, are generated. The forming bar is
  // the single exception, and it has to be: its close is the price the header is
  // showing, and that moves while the session runs.
  const latestStored = stored.length > 0 ? stored[stored.length - 1]!.ts : null
  const forming = slots[slots.length - 1]!
  const missing = slots.filter((ts) => latestStored === null || ts > latestStored || ts === forming)
  if (missing.length === 0) return null

  const before = stored.filter((bar) => bar.ts < missing[0]!)
  const startClose = before.length > 0 ? before[before.length - 1]!.close : null

  const request = {
    slots: missing,
    startClose,
    endClose,
    tickSize: Number(instrument?.tick_size ?? 0.05),
  }

  for (const provider of candleProviders()) {
    if (!(await provider.isAvailable())) continue

    let produced: ProviderCandle[]
    try {
      produced = await provider.fetchCandles(symbol, interval, request)
    } catch (error) {
      // A provider that throws is a provider that declined. Log the detail and
      // try the next one — never let it reach the page.
      console.error(`[candles] ${provider.name}`, error)
      continue
    }

    // A provider that returns nothing has not failed silently into an empty
    // chart: it has declined, and the next one gets its turn.
    if (produced.length === 0) continue

    const { error: writeError } = await supabase.from('candles').upsert(
      produced.map((bar) => ({
        symbol,
        interval,
        ts: new Date(bar.ts).toISOString(),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      })),
      { onConflict: 'symbol,interval,ts' }
    )
    if (writeError) {
      console.error('[candles] upsert', writeError)
      return null
    }

    const { error: syncError } = await supabase
      .from('candle_sync')
      .upsert(
        { symbol, interval, fetched_at: at.toISOString(), provider: provider.name },
        { onConflict: 'symbol,interval' }
      )
    if (syncError) console.error('[candles] candle_sync', syncError)

    // The produced bars win on a tie: the only slot that can collide is the one
    // still forming, and its fresh close is the point of regenerating it.
    const merged = new Map(stored.map((bar) => [bar.ts, bar]))
    for (const bar of produced) merged.set(bar.ts, bar)

    return {
      provider: provider.name,
      candles: [...merged.values()].sort((a, b) => a.ts - b.ts),
    }
  }

  return null
}

/** The last `days` trading days of a stored series. 1M and 1Y differ only here. */
function window(
  candles: ProviderCandle[],
  interval: CandleInterval,
  days: number
): ProviderCandle[] {
  if (interval !== 'ONE_DAY') return candles
  return candles.slice(-days)
}

export type GetCandlesOptions = {
  /** Injected by tests so every TTL boundary is reachable without waiting. */
  now?: Date
}

/**
 * The stock detail chart's data.
 *
 * 1M and 1Y both resolve to `ONE_DAY` and are two windows over the one stored
 * series, so switching between them costs no fetch at all.
 */
export async function getCandles(
  symbol: string,
  range: CandleRange,
  options: GetCandlesOptions = {}
): Promise<CandleSeries> {
  const at = options.now ?? new Date()
  const interval = RANGE_INTERVAL[range]
  const supabase = createAdminClient()

  let holidays: HolidaySet
  try {
    holidays = await loadHolidays(supabase)
  } catch (error) {
    // The calendar is the authority on which bars exist. Without it the honest
    // answer is whatever is already stored, not a series built on a guess that
    // every weekday trades.
    console.error('[candles] calendar', error)
    const stored = await readStored(supabase, symbol, interval)
    return {
      interval,
      candles: window(stored, interval, RANGE_TRADING_DAYS[range]),
      provider: null,
      fetchedAt: null,
      isStale: true,
    }
  }

  const { data: sync } = await supabase
    .from('candle_sync')
    .select('fetched_at, provider')
    .eq('symbol', symbol)
    .eq('interval', interval)
    .maybeSingle()

  const fetchedAt = sync ? new Date(sync.fetched_at) : null
  let provider = (sync?.provider as QuoteProviderName | undefined) ?? null
  let stale = false

  let stored = await readStored(supabase, symbol, interval)

  if (!isFresh(interval, fetchedAt, at, holidays)) {
    const result = await refresh(supabase, symbol, interval, stored, at, holidays)
    if (result) {
      provider = result.provider
      stored = result.candles
    } else {
      // Every provider declined. Serve what we have with its true age — never an
      // empty chart when stale rows exist, and never a fabricated bar to fill
      // the gap.
      stale = stored.length > 0
    }
  }

  return {
    interval,
    candles: window(stored, interval, RANGE_TRADING_DAYS[range]),
    provider,
    fetchedAt: stale || provider === null ? fetchedAt : at,
    isStale: stale,
  }
}
