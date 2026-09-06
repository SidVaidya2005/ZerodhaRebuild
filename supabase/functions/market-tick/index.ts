import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2.49.4'

import { MAX_SYMBOLS_PER_TICK } from '../_shared/market-constants.ts'
import { isTradingSession } from '../_shared/market-hours.ts'
import { createSimulatorProvider } from '../_shared/simulator.ts'
import { createQuoteService } from '../_shared/quote-service.ts'
import type { SymbolAnchor } from '../_shared/provider-types.ts'

/**
 * The scheduled market tick: gate → select demanded symbols → fetch → upsert.
 *
 * **Not a public endpoint, and the gateway alone does not make it one.** JWT
 * verification stays enabled (no `verify_jwt = false` in `config.toml`) and it
 * does reject a caller with no `Authorization` header — but F16 measured what it
 * accepts, and the answer is *any* valid project key, **including the
 * publishable one that ships in the browser bundle**. Anyone who reads the
 * JavaScript could otherwise invoke this.
 *
 * So the gateway is the outer layer and the shared secret below is the real one:
 * a scheduler credential held in Vault, sent by `pg_cron`, and compared here
 * before anything touches the database. `library-docs.md` describes this as the
 * fallback for when no credential satisfies the gateway; it turns out to be
 * necessary for the opposite reason.
 *
 * It is the only writer of `quotes` and the only caller of `match_open_orders`
 * (F28) and `square_off_mis` (F29).
 */

type TickResult =
  | { ok: true; skipped: 'MARKET_CLOSED'; at: string }
  | {
      ok: true
      refreshed: number
      provider: string | null
      matched: number
      faulted: number
      squared: number
      at: string
    }
  | { ok: false; error: string }

/**
 * The anchors the simulator walks from: the last observed price, and the close
 * its ±5% band is measured against.
 *
 * **`quotes.prev_close` wins over `instruments.prev_close`.** The former is
 * rolled at each session open by `roll_previous_close`; the latter is the
 * bhavcopy seed and never moves. Reading the seed here is what trapped every
 * simulated price within 5% of the day the universe was seeded. The seed is
 * still the fallback, because on a cold start it is the only close there is.
 */
async function loadAnchors(
  supabase: SupabaseClient,
  symbols: readonly string[]
): Promise<SymbolAnchor[]> {
  const [instruments, quotes] = await Promise.all([
    supabase.from('instruments').select('symbol, prev_close').in('symbol', symbols),
    supabase.from('quotes').select('symbol, ltp, prev_close').in('symbol', symbols),
  ])

  if (instruments.error) throw instruments.error
  if (quotes.error) throw quotes.error

  const stored = new Map<string, { ltp: number; prevClose: number | null }>(
    (quotes.data ?? []).map((row: { symbol: string; ltp: number; prev_close: number | null }) => [
      row.symbol,
      { ltp: Number(row.ltp), prevClose: row.prev_close === null ? null : Number(row.prev_close) },
    ])
  )

  return (instruments.data ?? []).map((row: { symbol: string; prev_close: number | null }) => {
    const seeded = row.prev_close === null ? null : Number(row.prev_close)
    const quote = stored.get(row.symbol)
    return {
      symbol: row.symbol,
      lastPrice: quote?.ltp ?? null,
      prevClose: quote?.prevClose ?? seeded,
    }
  })
}

async function tick(supabase: SupabaseClient, now: Date): Promise<TickResult> {
  // The gate comes first, and nothing writes before it returns true. The
  // `pg_cron` window is a cost bound only: it cannot express 09:15–15:30 and
  // cannot encode a trading holiday, so trusting it would trade on Republic Day.
  if (!(await isTradingSession(supabase, now))) {
    return { ok: true, skipped: 'MARKET_CLOSED', at: now.toISOString() }
  }

  // Before anything is read for pricing: if this is the first tick of a session,
  // carry each stale quote's last price into its `prev_close`. The day change and
  // the simulator's band are both measured from that column, so rolling it after
  // `loadAnchors` would anchor this whole tick to yesterday.
  const { error: rollError } = await supabase.rpc('roll_previous_close')
  if (rollError) throw rollError

  const { data: demanded, error: demandError } = await supabase.rpc('select_demanded_symbols', {
    p_limit: MAX_SYMBOLS_PER_TICK,
  })
  if (demandError) throw demandError

  const symbols = (demanded ?? []).map((row: { symbol: string }) => row.symbol)

  // **An empty batch skips the upsert and nothing else.** Both of these used to
  // return early, which took the two sweeps below with them — and neither sweep
  // needs a fresh quote to do real work. §5 keeps a quote fillable for
  // `QUOTE_STALE_AFTER_MS`, so the matcher can still fill against the previous
  // tick's prices, and `square_off_mis` is the case that actually bites: a
  // provider hiccup across the 15:20–15:30 window would leave every MIS position
  // open overnight, against §10 and identity 7, for want of a price it was not
  // going to use anyway. Skipping work the tick cannot do is right; skipping work
  // it can is what this avoids.
  let refreshed = 0
  let provider: string | null = null

  if (symbols.length > 0) {
    const anchors = await loadAnchors(supabase, symbols)
    const service = createQuoteService({
      // Yahoo is deferred to the end of the project, so the simulator is the whole
      // chain today. The seam is what matters: a real provider goes in front of it
      // without changing anything here.
      providers: [createSimulatorProvider({ anchors })],
    })

    const fetched = await service.getQuotes(symbols)

    if (fetched.quotes.length > 0) {
      const { error: upsertError } = await supabase.from('quotes').upsert(
        fetched.quotes.map((quote) => ({
          symbol: quote.symbol,
          ltp: quote.ltp,
          prev_close: quote.prevClose,
          day_open: quote.dayOpen,
          day_high: quote.dayHigh,
          day_low: quote.dayLow,
          volume: quote.volume,
          provider: fetched.provider,
          // Null for SIMULATOR, which has no upstream clock. The CHECK constraint on
          // `quotes` enforces that only the simulator may omit it.
          provider_ts: quote.providerTs?.toISOString() ?? null,
          fetched_at: now.toISOString(),
        })),
        { onConflict: 'symbol' }
      )
      if (upsertError) throw upsertError

      refreshed = fetched.quotes.length
      provider = fetched.provider
    }
  }

  // Strictly after the upsert. The matcher prices off `quotes`, so running it
  // first would match this tick's orders against last tick's prices — and a
  // limit order that crossed a minute ago would wait another minute.
  const { data: matched, error: matchError } = await supabase.rpc('match_open_orders')
  if (matchError) throw matchError

  // A `returns table (...)` function arrives as an array of one row.
  const run = matched?.[0] ?? { filled: 0, faulted: 0 }

  // After the matcher, not before: an order that crosses on this tick should
  // fill on this tick, and only then be squared off if it is intraday and the
  // clock has passed 15:20. Reversing the two would leave a position opened at
  // 15:21 alive until the next run. The function is its own no-op before then.
  const { data: squaredOff, error: squareOffError } = await supabase.rpc('square_off_mis')
  if (squareOffError) throw squareOffError
  const exits = squaredOff?.[0] ?? { squared: 0, faulted: 0 }

  return {
    ok: true,
    refreshed,
    provider,
    matched: run.filled,
    // Surfaced rather than logged only: a fault is an order the matcher could
    // not fill and will retry every minute, so it belongs where
    // `cron.job_run_details` will show it.
    faulted: run.faulted + exits.faulted,
    squared: exits.squared,
    at: now.toISOString(),
  }
}

/**
 * Constant-time comparison, so a timing difference cannot leak the secret one
 * byte at a time. Lengths are compared first because a mismatch there is not
 * secret — only the contents are.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false
  let difference = 0
  for (let i = 0; i < provided.length; i += 1) {
    difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return difference === 0
}

Deno.serve(async (request) => {
  const expected = Deno.env.get('SCHEDULER_SECRET')
  if (!expected) {
    // Refuse rather than fall open. A missing secret must not silently downgrade
    // this to "whoever holds the publishable key may run the tick".
    console.error('[market-tick] SCHEDULER_SECRET is not configured')
    return Response.json({ ok: false, error: 'NOT_CONFIGURED' } satisfies TickResult, {
      status: 500,
    })
  }

  if (!secretMatches(request.headers.get('x-scheduler-secret'), expected)) {
    // Nothing is read or written before this point.
    return Response.json({ ok: false, error: 'UNAUTHORIZED' } satisfies TickResult, { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  try {
    return Response.json(await tick(supabase, new Date()))
  } catch (error) {
    // The detail is logged; the body carries a code. `String(error)` here would
    // leak database text into an HTTP response, which the Error Handling rules
    // forbid with no endpoint-based exemption.
    console.error('[market-tick]', error)
    // 200 with ok:false is for handled failures; this is the unhandled path, so
    // it returns 500 and stands out in cron.job_run_details.
    return Response.json({ ok: false, error: 'TICK_FAILED' } satisfies TickResult, { status: 500 })
  }
})
