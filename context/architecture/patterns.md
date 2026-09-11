# Architecture — Data Flow & Key Patterns

> **Reference half of `context/architecture.md`.** The invariants, stack, boundaries and auth
> rules live there and are read every session; this is looked up when the work reaches it.
> **Where this file and the invariants disagree, the invariants win.**

## Data Flow

### Quote refresh (scheduled, every minute during market hours)

```
pg_cron ('* 3-10 * * 1-5' — UTC, ≈ 08:30–16:29 IST; a coarse cost window, NOT the gate)
  └─> net.http_post → Edge Function `market-tick`
        ├─ isTradingSession() — IST clock + NSE holiday calendar
        │    └─ closed? return { ok: true, skipped: 'MARKET_CLOSED' } and write nothing
        ├─ roll_previous_close()  — first tick of a session carries each stale
        │    quote's ltp into its prev_close, so the day change and the
        │    simulator's ±5% band measure from the previous session, not from
        │    the bhavcopy seed. Derived from fetched_at, so a missed tick repairs
        │    itself and it cannot double-apply (F16).
        ├─ select_demanded_symbols(MAX_SYMBOLS_PER_TICK)  — a SQL function, so pgTAP
        │    can test the union directly. OPEN orders ∪ holdings ∪ positions ∪
        │    symbol_demand ∪ watchlists, deduplicated, ranked, capped. Watchlists
        │    are in it because symbol_demand has no write path until F18 (F16).
        ├─ QuoteService.getQuotes(symbols)
        │    ├─ YahooProvider        → not built yet; deferred to the end (F14)
        │    └─ SimulatorProvider    → last resort, cannot fail; walks from the last
        │                              quote, else instruments.prev_close (F15)
        ├─ upsert quotes (ltp, prev_close, ohlc, volume, provider, provider_ts, fetched_at)
        ├─ match_open_orders()   → F28 wires this in; not called yet
        └─ square_off_mis()      → F29 wires this in; not called yet

  The token-bucket limiter is deliberately absent: it caps nothing in front of a
  local simulator, and waits for a provider that makes outbound requests (F15).
              │
              ▼
      Postgres Changes on `quotes` and `orders`
              │
              ▼
      Supabase Realtime → subscribed browsers → Zustand quote store
              │
              ▼
      requestAnimationFrame interpolation → LTP ticks + green/red flash
```

### Placing an order (user mutation)

```
Order ticket (Client Component)
  └─> Server Action `placeOrder` ('use server')
        ├─ Zod parse of the input
        ├─ createClient() from lib/supabase/server → session-scoped, RLS applies
        └─ rpc('place_order', {...})            ── Postgres, one transaction ──
              ├─ insert orders row (status OPEN)
              ├─ reserve_margin(order_id)  → moves the requirement from
              │        available_cash into used_margin, stamps orders.blocked_margin.
              │        A buy reserves notional + charges; a short reserves its
              │        collateral (§6), so a clean fill needs no top-up
              ├─ if MARKET → execute_order(order_id)
              │     ├─ SELECT ... FOR UPDATE on orders row
              │     ├─ status still 'OPEN'? if not, return — a concurrent run got here first
              │     ├─ SELECT ... FOR UPDATE on funds row
              │     ├─ compute charges (numeric)
              │     ├─ margin check against (available_cash + blocked_margin)
              │     │     └─ insufficient → REJECTED + release_margin(), return
              │     ├─ retire the reservation, exactly once, BEFORE writing
              │     │  the trade or the position:
              │     │     ├─ fill opens a short →
              │     │     │    transfer_margin_to_position(id, price, charges)
              │     │     │      └─ ok=false → REJECTED, nothing else written
              │     │     └─ otherwise         → release_margin()
              │     ├─ insert trades row
              │     ├─ upsert holdings (CNC) or positions (MIS),
              │     │    averaging charges up for a long, down for a short;
              │     │    a short writes back the collateral and
              │     │    entry_reference_price the transfer returned
              │     ├─ a fill that reduces a short →
              │     │    recompute_position_collateral(user, symbol, new_qty, order),
              │     │    BEFORE the new quantity is written
              │     ├─ update funds (available_cash, used_margin)
              │     ├─ insert fund_ledger rows
              │     └─ update orders → COMPLETE (average_price, filled_quantity)
              └─ else leave OPEN — margin stays reserved until fill or cancel
        ▲
        └── returns { ok: true, data: { orderId, status } } | { ok: false, error: { code, message } }
```

### Candle fetch (on demand, cached)

```
Stock detail page (Server Component)
  └─> getCandles(symbol, range)
        ├─ map range → interval  (1D→FIVE_MIN, 1W→THIRTY_MIN, 1M/1Y→ONE_DAY)
        ├─ candle_sync fresh for (symbol, interval)?  → read candles, done
        └─ stale or missing:
              ├─ token-bucket limiter + circuit breaker (shared with quotes)
              ├─ CandleProvider chain → Yahoo → simulator
              ├─ upsert candles, update candle_sync (fetched_at, provider)
              └─ on total failure: serve the stale rows we already have,
                 badged with their real age — never an empty chart, never a fabricated one
```

### Reading portfolio state (page load)

```
Terminal page (Server Component)
  └─> createClient() from lib/supabase/server
        └─> select from holdings / positions / orders   (RLS scopes to auth.uid())
              └─> joined with quotes for LTP
                    └─> rendered server-side, then hydrated by the Zustand store for live ticks
```

### Support form submission

```
Support form (React 19 form action + useActionState — no JavaScript required)
  └─> Server Action `submitSupportMessage(previousState, formData)`
        ├─ Zod parse of the FormData
        ├─ honeypot filled? report success, insert nothing
        └─ insert support_messages   (RLS: anon INSERT granted; no select policy for any role)
```

---

## Key Patterns

### Supabase server client (RSC and Server Actions)

```ts
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component; src/proxy.ts refreshes the session instead.
          }
        },
      },
    }
  )
}
```

### Session refresh and route guard

```ts
// src/proxy.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const TERMINAL_PREFIXES = [
  '/dashboard', '/orders', '/holdings', '/positions',
  '/funds', '/reports', '/settings', '/stocks',
]

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not put code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isTerminal = TERMINAL_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))

  if (!user && isTerminal) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

### Server Action shape

```ts
// src/server/actions/orders.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { placeOrderSchema } from '@/lib/trading/schemas'
import type { ActionResult } from '@/types/domain'

export async function placeOrder(input: unknown): Promise<ActionResult<PlacedOrder>> {
  const parsed = placeOrderSchema.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_ERROR')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('place_order', {
    p_symbol: parsed.data.symbol,
    p_side: parsed.data.side,
    p_order_type: parsed.data.orderType,
    p_product: parsed.data.product,
    p_quantity: parsed.data.quantity,
    // Omitted, not null: the generated signature is `p_limit_price?: number`.
    p_limit_price: parsed.data.limitPrice ?? undefined,
  })

  // `error` means a *fault*. It does not mean the order was rejected: a
  // rejection is a normal return, because it writes a row §4 and the Orders
  // page both require, and raising would roll that row back.
  if (error) {
    // Log the raw Postgres error; return only a mapped code and safe copy.
    console.error('[orders.placeOrder]', error)
    return fail(toFaultCode(error))
  }

  // `returns table (order_id, status, rejection_reason)` arrives as an array.
  const row = data?.[0]
  if (!row) return fail('UNKNOWN')
  if (row.status === 'REJECTED') return fail(toRejectionCode(row.rejection_reason))

  // A fill moves cash, margin, holdings, positions and the dashboard totals —
  // all of which the terminal chrome renders, so the whole group revalidates.
  revalidateTerminal()
  return { ok: true, data: { orderId: row.order_id, status: row.status, ...details } }
}
```

### Live quote subscription

```ts
// src/lib/stores/quote-store.ts (subscription half)
import { createClient } from '@/lib/supabase/client'
import { useQuoteStore } from '@/lib/stores/quote-store'

export function subscribeToQuotes(symbols: string[]) {
  const supabase = createClient()

  const channel = supabase
    .channel('quotes-live')
    .on(
      'postgres_changes',
      // Filter server-side, not in the callback: a table-wide subscription still has
      // every row delivered to and authorized for every subscriber.
      { event: 'UPDATE', schema: 'public', table: 'quotes', filter: `symbol=in.(${symbols.join(',')})` },
      (payload) => {
        const row = payload.new as {
          symbol: string
          ltp: number
          provider: 'YAHOO' | 'TWELVE_DATA' | 'SIMULATOR'
          provider_ts: string | null
        }
        // Store the anchor and its provenance inputs. Freshness is derived on render,
        // not captured here — it changes with the clock, not with the row.
        useQuoteStore.getState().applyServerQuote(row.symbol, row.ltp, {
          provider: row.provider,
          providerTs: row.provider_ts ? new Date(row.provider_ts) : null,
        })
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}
```

### Quote provider chain

```ts
// supabase/functions/_shared/quote-service.ts — shared with the app via `@shared/*`.
// Deno cannot resolve `@/`, so this module imports only its sibling `.ts` files.
import type { ProviderQuote, QuoteProvider } from './provider-types.ts'

export function createQuoteService(options: QuoteServiceOptions) {
  // …failure counts and cool-off timestamps per provider…
  return {
    async getQuotes(symbols: readonly string[]): Promise<QuoteResult> {
      const attempted: QuoteResult['attempted'] = []

      for (const provider of options.providers) {
        if (circuitState(provider.name) === 'OPEN') {
          attempted.push({ name: provider.name, outcome: 'OPEN_CIRCUIT' })
          continue
        }
        try {
          // Declining is not failing: a provider with no key, or no anchor for
          // these symbols, must not count against its own circuit.
          if (!(await provider.isAvailable(symbols))) {
            attempted.push({ name: provider.name, outcome: 'UNAVAILABLE' })
            continue
          }
          const quotes = await provider.fetchQuotes(symbols)
          if (quotes.length === 0) { /* empty answer counts as a failure */ }
          failures.delete(provider.name) // consecutive failures, not lifetime
          return { quotes, provider: provider.name, attempted }
        } catch {
          // Swallowed deliberately: the upstream error is the chain's business,
          // not the caller's. The tick logs the attempt trail instead.
          attempted.push({ name: provider.name, outcome: 'FAILED' })
          recordFailure(provider.name)
        }
      }
      return { quotes: [], provider: null, attempted }
    },
  }
}
```

**It returns rather than throws when every provider declines.** An earlier draft
of this example threw "every provider failed, including the simulator"; the
shipped chain reports `{ provider: null }` and lets the tick decide, because the
simulator is the last resort and a throw would make an empty symbol list
indistinguishable from a broken upstream (F15).

---

