# Architecture — Data Flow & Key Patterns

> Read this part of `context/architecture.md` when working on Server Actions, Postgres
> functions, Supabase clients, subscriptions, or the tick job. The core architecture's
> invariants take precedence if an example here disagrees with them.

## Data Flow

These diagrams show where work happens and how data reaches the screen. Read them with the
invariants and `trading-contract.md`; they summarise the flow without spelling out every branch.

### Quote refresh (scheduled, every minute during market hours)

Postgres starts the job; the web server does not need to be awake. The broad cron window limits
cost, while the session check decides whether any market work is allowed.

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
        │    ├─ (no external provider) → out of scope by decision; the chain is a
        │                              seam with nothing above the simulator (6.00.05)
        │    └─ SimulatorProvider    → last resort, cannot fail; walks from the last
        │                              quote, else instruments.prev_close (F15)
        ├─ upsert quotes (ltp, prev_close, ohlc, volume, provider, provider_ts, fetched_at)
        ├─ match_open_orders()   → matches eligible open limit orders (F28)
        └─ square_off_mis()      → closes due MIS positions (F29)

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

The browser submits an instruction. A Server Action validates it, and Postgres reserves margin
and executes the order in one transaction. The database owns every stored money calculation.

```
Order ticket (Client Component)
  └─> Server Action `placeOrder` ('use server')
        ├─ Zod parse of the input
        ├─ createClient() from lib/supabase/server → session-scoped, RLS applies
        └─ rpc('place_order', {...})            ── Postgres, one transaction ──
              ├─ insert orders row (status OPEN)
              ├─ reserve_margin(order_id) → available_cash to used_margin;
              │    stamps orders.blocked_margin using §6:
              │      buy → opening quantity's value + whole-order estimated charges
              │      sell covered by a long → no reservation
              │      sell opening a short → shorting-excess collateral + charges
              │    failed reservation → REJECTED, no cash or ledger change
              ├─ if MARKET → execute_order(order_id)
              │     ├─ SELECT ... FOR UPDATE on orders row
              │     ├─ status still 'OPEN'? if not, return without writing
              │     ├─ SELECT ... FOR UPDATE on funds row
              │     ├─ verify quote freshness and limit eligibility
              │     ├─ calculate whole-order charges once; determine closing/opening legs
              │     ├─ BUY opening leg only: compare available_cash + blocked_margin
              │     │    with opening value + charges; insufficient → release_margin(),
              │     │    then REJECTED. A pure cover skips this gate.
              │     ├─ one subtransaction:
              │     │    ├─ SELL closing a long → post SELL_CREDIT first
              │     │    └─ retire the order reservation exactly once:
              │     │         opens a short → transfer_margin_to_position(id, price, charges)
              │     │         otherwise → release_margin()
              │     │    shortfall → undo this attempt, release original reservation,
              │     │    then REJECTED; no trade, position change or sale credit survives
              │     ├─ BUY closing a short → recompute_position_collateral(user, symbol,
              │     │    new_qty, order) BEFORE writing the new quantity;
              │     │    derive cash settlement from gross entry_reference_price
              │     ├─ reported closing P&L uses net average_price and closing charges
              │     ├─ post one whole-order CHARGES row, unless the transfer already did
              │     ├─ BUY opening a long → post BUY_DEBIT before settling any cover
              │     ├─ settle BUY's closing leg, using SIMULATION_ADJUSTMENT if needed
              │     │    so cash floors at zero while reported P&L retains the true loss
              │     ├─ upsert holdings (CNC) or positions (MIS), or delete at zero;
              │     │    capitalise opening charges upward for longs, downward for shorts;
              │     │    persist the collateral and gross basis returned by the transfer
              │     ├─ insert one trades row
              │     └─ update orders → COMPLETE (average_price, filled_quantity)
              │       Cash changes and ledger rows are paired within the relevant steps.
              └─ else leave OPEN — margin stays reserved until fill or cancel
        ▲
        └── returns { ok: true, data: { orderId, status } } | { ok: false, error: { code, message } }
```

### Candle fetch (on demand, cached)

The stock page requests the range it needs. Stored candles satisfy fresh requests; a refresh
updates the cache and its provenance together. Cached fallback data keeps its real age.

```
Stock detail page (Server Component)
  └─> getCandles(symbol, range)
        ├─ map range → interval  (1D→FIVE_MIN, 1W→THIRTY_MIN, 1M/1Y→ONE_DAY)
        ├─ candle_sync fresh for (symbol, interval)?  → read candles, done
        └─ stale or missing:
              ├─ CandleProvider chain → simulator  (the only provider; the
              │    limiter and circuit breaker stay unbuilt seams, since a
              │    bucket in front of a local simulator caps nothing — F15,
              │    made permanent 6.00.05)
              ├─ upsert candles, update candle_sync (fetched_at, provider)
              └─ on total failure: serve the stale rows we already have,
                 badged with their real age — never an empty chart, never a fabricated one
```

### Reading portfolio state (page load)

The server reads through the user session, so RLS determines which portfolio rows are visible.
The client can then update price displays from the shared quote store.

```
Terminal page (Server Component)
  └─> createClient() from lib/supabase/server
        └─> select from holdings / positions / orders   (RLS scopes to auth.uid())
              └─> joined with quotes for LTP
                    └─> rendered server-side, then hydrated by the Zustand store for live ticks
```

### Support form submission

The public form works without JavaScript. Validation and the honeypot run on the server before
the insert; the public caller receives no read access to stored messages.

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

Create the server client in the shared Supabase module. It reads session cookies for the request.
A Server Component cannot write refreshed cookies, so the proxy handles that case.

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

The proxy uses `createProxyClient` from `src/lib/supabase/proxy.ts`; only that shared module
constructs the Supabase client and handles cookie writes. It redirects signed-out visitors to
login with their intended destination, preserving any cookies refreshed or cleared during the
check. Database RLS remains the authorisation boundary.

```ts
// src/proxy.ts
import { NextResponse, type NextRequest } from 'next/server'

import { LOGIN_PATH, isTerminalPath } from '@/lib/auth/routes'
import { createProxyClient } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  const { supabase, response } = createProxyClient(request)

  // Do not put code between client construction and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && isTerminalPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = LOGIN_PATH
    url.search = ''
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)

    // Preserve refreshed or cleared cookies on the redirect too.
    const redirect = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie)
    }
    return redirect
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

### Server Action shape

Parse input first, then call the database using the session client. A rejected order is a normal
database result; a database fault follows the separate error path. Both return safe application copy.

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

Subscribe only to the symbols in view and keep each anchor with its provenance inputs. Derive
freshness when rendering, since time can make a quote stale without changing its row. This shortened
example omits the session setup: await `getSession()` and `realtime.setAuth(token)` before subscribing,
and supply a status callback, as `constraints/market-data.md` requires.

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

Try available providers in order, skipping an open circuit and recording attempts. In this build
the simulator is the only wired provider. The chain remains available for a future scope change;
its failure counts currently last only for the request, as `constraints/market-data.md` explains.

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

When all providers decline, the chain returns `{ provider: null }` and lets the tick decide
what to do. It does not throw. The earlier example threw "every provider failed, including the
simulator", which treated an empty symbol list like a broken upstream. The shipped chain keeps
those cases distinguishable. (F15)

---
