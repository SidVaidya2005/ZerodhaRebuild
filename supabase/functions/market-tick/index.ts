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
 * It is the only writer of `quotes`. `match_open_orders` and `square_off_mis`
 * are not called yet: they are built in F28 and F29, which wire them in here.
 */

type TickResult =
  | { ok: true; skipped: 'MARKET_CLOSED'; at: string }
  | { ok: true; refreshed: number; provider: string | null; at: string }
  | { ok: false; error: string }

/**
 * The anchors the simulator walks from: the last observed price, falling back to
 * the published NSE close seeded into `instruments.prev_close` (F15).
 */
async function loadAnchors(
  supabase: SupabaseClient,
  symbols: readonly string[]
): Promise<SymbolAnchor[]> {
  const [instruments, quotes] = await Promise.all([
    supabase.from('instruments').select('symbol, prev_close').in('symbol', symbols),
    supabase.from('quotes').select('symbol, ltp').in('symbol', symbols),
  ])

  if (instruments.error) throw instruments.error
  if (quotes.error) throw quotes.error

  const lastPrice = new Map<string, number>(
    (quotes.data ?? []).map((row: { symbol: string; ltp: number }) => [row.symbol, Number(row.ltp)])
  )

  return (instruments.data ?? []).map((row: { symbol: string; prev_close: number | null }) => ({
    symbol: row.symbol,
    lastPrice: lastPrice.get(row.symbol) ?? null,
    prevClose: row.prev_close === null ? null : Number(row.prev_close),
  }))
}

async function tick(supabase: SupabaseClient, now: Date): Promise<TickResult> {
  // The gate comes first, and nothing writes before it returns true. The
  // `pg_cron` window is a cost bound only: it cannot express 09:15–15:30 and
  // cannot encode a trading holiday, so trusting it would trade on Republic Day.
  if (!(await isTradingSession(supabase, now))) {
    return { ok: true, skipped: 'MARKET_CLOSED', at: now.toISOString() }
  }

  const { data: demanded, error: demandError } = await supabase.rpc('select_demanded_symbols', {
    p_limit: MAX_SYMBOLS_PER_TICK,
  })
  if (demandError) throw demandError

  const symbols = (demanded ?? []).map((row: { symbol: string }) => row.symbol)
  if (symbols.length === 0) {
    return { ok: true, refreshed: 0, provider: null, at: now.toISOString() }
  }

  const anchors = await loadAnchors(supabase, symbols)
  const service = createQuoteService({
    // Yahoo is deferred to the end of the project, so the simulator is the whole
    // chain today. The seam is what matters: a real provider goes in front of it
    // without changing anything here.
    providers: [createSimulatorProvider({ anchors })],
  })

  const { quotes, provider } = await service.getQuotes(symbols)
  if (quotes.length === 0) {
    return { ok: true, refreshed: 0, provider: null, at: now.toISOString() }
  }

  const { error: upsertError } = await supabase.from('quotes').upsert(
    quotes.map((quote) => ({
      symbol: quote.symbol,
      ltp: quote.ltp,
      prev_close: quote.prevClose,
      day_open: quote.dayOpen,
      day_high: quote.dayHigh,
      day_low: quote.dayLow,
      volume: quote.volume,
      provider,
      // Null for SIMULATOR, which has no upstream clock. The CHECK constraint on
      // `quotes` enforces that only the simulator may omit it.
      provider_ts: quote.providerTs?.toISOString() ?? null,
      fetched_at: now.toISOString(),
    })),
    { onConflict: 'symbol' }
  )
  if (upsertError) throw upsertError

  return { ok: true, refreshed: quotes.length, provider, at: now.toISOString() }
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
