'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { useEffect } from 'react'

import { createClient } from '@/lib/supabase/client'
import { hasActiveTween, useQuoteStore, type ServerQuote } from '@/lib/stores/quote-store'

/**
 * The terminal's one live-price connection, and its one animation loop.
 *
 * Renders nothing. It is mounted once by the `(terminal)` layout because both
 * things it owns must be singletons: `library-docs.md` requires exactly one
 * Realtime channel and exactly one `requestAnimationFrame` driver, never one per
 * row. A per-row channel would also multiply the free tier's connection cap by
 * the length of the watchlist.
 */

type QuoteChannelProps = {
  /** The symbols on screen. The channel is filtered to these, server-side. */
  symbols: string[]
  /** Server-rendered prices, adopted as the initial anchors. */
  seed: ServerQuote[]
}

export function QuoteChannel({ symbols, seed }: QuoteChannelProps) {
  // Joined rather than passed as arrays: a new array identity on every render
  // would tear down and rebuild the subscription on every render.
  const symbolKey = symbols.join(',')
  const seedKey = seed.map((row) => `${row.symbol}:${row.ltp}`).join(',')

  useEffect(() => {
    useQuoteStore.getState().seedQuotes(seed)
    // `seedKey` is the real dependency; `seed` itself is a fresh array each
    // render. Seeding is idempotent and never overwrites a live anchor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey])

  useEffect(() => {
    if (symbolKey === '') return

    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    // Realtime authorises every subscriber against RLS using its own JWT, and
    // `quotes` is readable by `authenticated` only — `anon` holds no grant, by
    // design, because the publishable key ships in the browser bundle.
    //
    // The session lives in cookies and loads asynchronously, so subscribing
    // straight away opens the socket before the token is available: the channel
    // reports SUBSCRIBED, and then no event is ever delivered. Nothing errors.
    // The price simply never moves, which is indistinguishable from a quiet
    // market — so the token is fetched and handed to Realtime first.
    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) await supabase.realtime.setAuth(data.session.access_token)
      if (cancelled) return

      channel = supabase
        .channel('quotes-live')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'quotes',
            // Filtered server-side, always. Subscribing to the whole table and
            // filtering in the callback still has every row delivered to and
            // authorised for every subscriber, which defeats the demand-driven
            // model the entire quote pipeline is justified by.
            filter: `symbol=in.(${symbolKey})`,
          },
          (payload) => {
            const row = payload.new as {
              symbol: string
              ltp: number | string | null
              prev_close: number | string | null
              provider: ServerQuote['provider']
              provider_ts: string | null
              fetched_at: string | null
            }

            useQuoteStore.getState().applyServerQuote({
              symbol: row.symbol,
              ltp: row.ltp === null ? null : Number(row.ltp),
              prevClose: row.prev_close === null ? null : Number(row.prev_close),
              provider: row.provider,
              providerTs: row.provider_ts,
              fetchedAt: row.fetched_at,
            })
          }
        )
        // A channel that fails to subscribe otherwise does so in complete silence:
        // prices simply never move, which is indistinguishable from a quiet
        // market. Surfaced as a log rather than UI — F20 owns telling the visitor
        // that what they are looking at has stopped being fresh.
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error('[quotes.channel]', status, error)
          } else {
            console.info('[quotes.channel]', status)
          }
        })
    })()

    // An unremoved channel leaks across navigations and hits the free tier's
    // concurrent connection cap. `cancelled` covers the effect being torn down
    // while the token fetch above is still in flight.
    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [symbolKey])

  useEffect(() => {
    let frame = 0
    let running = false

    const step = () => {
      useQuoteStore.getState().advance(performance.now())
      // The loop stops itself once every price has arrived, rather than burning
      // a frame callback for the ~59 seconds a minute when nothing is moving.
      if (hasActiveTween(useQuoteStore.getState().quotes)) {
        frame = requestAnimationFrame(step)
      } else {
        running = false
      }
    }

    const start = () => {
      if (running) return
      running = true
      frame = requestAnimationFrame(step)
    }

    const unsubscribe = useQuoteStore.subscribe((state) => {
      if (hasActiveTween(state.quotes)) start()
    })

    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
    }
  }, [])

  return null
}
