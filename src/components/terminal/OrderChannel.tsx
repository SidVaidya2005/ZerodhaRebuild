'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { createClient } from '@/lib/supabase/client'

/**
 * Keeps the Orders page current while the matcher works.
 *
 * Renders nothing, and deliberately holds no state: on any change to the user's
 * orders it calls `router.refresh()` and lets the server re-render. Orders are
 * server state and never enter Zustand — and a fill moves cash, margin, holdings
 * and positions as well as the row, so patching the row on the client would
 * leave the header's available cash stale beside an order that had just updated.
 *
 * Separate from `QuoteChannel`, which is mounted by the layout and lives for the
 * whole session. This one is mounted by the page, because it is only the Orders
 * page that renders orders; the two channels are independent connections and
 * neither is a singleton the other has to share.
 */
export function OrderChannel({ userId }: { userId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    // Realtime authorises each subscriber against RLS with its own JWT, and the
    // cookie session loads asynchronously — subscribing before the token exists
    // opens a socket that reports SUBSCRIBED and then delivers nothing, forever,
    // with no error. The same trap `QuoteChannel` documents.
    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) await supabase.realtime.setAuth(data.session.access_token)
      if (cancelled) return

      channel = supabase
        .channel('orders-live')
        .on(
          'postgres_changes',
          {
            // Not UPDATE alone: an order placed from another tab arrives as an
            // INSERT, and the quotes channel's UPDATE-only filter is exactly why
            // a symbol's first quote never reaches an open browser.
            event: '*',
            schema: 'public',
            table: 'orders',
            // Filtered server-side even though RLS already scopes delivery: an
            // unfiltered subscription still has every row delivered to and
            // authorised for every subscriber.
            filter: `user_id=eq.${userId}`,
          },
          () => {
            router.refresh()
          }
        )
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.error('[orders.channel]', status, error)
          } else {
            console.info('[orders.channel]', status)
          }
        })
    })()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [userId, router])

  return null
}
