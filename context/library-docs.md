# Library Docs

> **Role:** Project-specific usage patterns for each third-party library.
> **Read the relevant section** before using a library.
> **Relates to:** covers the integrations in `architecture.md`; defers to MCP servers and skills first.

Project-specific usage patterns for every third party library in this project.
This file only covers how we use each library in **this** specific project —
rules, patterns, and constraints specific to ZerodhaRebuild.

Read the relevant section before implementing any feature that touches these libraries.

---

The library authority order — and the rule against writing an API shape from memory
— is stated in the project's agent file (`CLAUDE.md`/`AGENTS.md`),
which is already loaded. This file is the project-rules step in that order.

---

## @supabase/ssr + @supabase/supabase-js

**Check first:** Context7 `/supabase/supabase`, then https://supabase.com/docs/guides/auth/server-side/nextjs

Versions: `@supabase/ssr` 0.12.4, `@supabase/supabase-js` 2.112.3.

### Setup

Three clients, three call sites. They are not interchangeable.

```ts
// src/lib/supabase/client.ts — browser only
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

```ts
// src/lib/supabase/admin.ts — server only, bypasses RLS
import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
```

The RSC/Server-Action client and the proxy client are the golden patterns in
`architecture/patterns.md` → Key Patterns. Copy them verbatim; do not re-derive the cookie handling.

### Google OAuth sign-in

**Sign-in is started server-side** (F12), not from the browser client. A plain `<form>` posts to a
Server Action, so it works with JavaScript disabled — the standard F07B set for the support form —
and the PKCE code verifier is written by the same server client that reads it back in the callback.
On the server `signInWithOAuth` performs no redirect of its own; it returns the URL to send the user to.

```ts
// src/server/actions/auth.ts
'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get('next')?.toString())

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (error || !data.url) {
    console.error('[auth.signInWithGoogle]', error)
    redirect('/auth/login?error=auth')
  }

  redirect(data.url)  // outside any try — redirect() works by throwing
}
```

```ts
// src/app/auth/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { safeNext } from '@/lib/auth/routes'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  // Never `searchParams.get('next') ?? '/dashboard'`: that value reaches a
  // redirect, so `//evil.com` would walk straight through it.
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Render terminates TLS at a load balancer, so `origin` is the internal host there.
      const forwardedHost = request.headers.get('x-forwarded-host')
      const base =
        process.env.NODE_ENV === 'development' || !forwardedHost
          ? origin
          : `https://${forwardedHost}`
      return NextResponse.redirect(`${base}${next}`)
    }
    console.error('[auth.callback]', error)
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth`)
}
```

**Rules for this flow:**

- The browser client (`lib/supabase/client.ts`) is **not** how sign-in starts. It exists for the
  Realtime surfaces from F19 onwards.
- `redirect()` throws `NEXT_REDIRECT` by design. Call it outside every `try`, or the redirect is
  swallowed and the user sits on a page that silently did nothing.
- `redirectTo` is built from `NEXT_PUBLIC_SITE_URL`, not from the incoming request, because Supabase
  matches it against a configured allow-list.
- Any `next` parameter is re-validated by `safeNext()` at **both** ends — the login page and the
  callback. It rejects absolute URLs, `//host` and `/\host`.

### Calling a database function

```ts
const { data, error } = await supabase.rpc('place_order', {
  p_symbol: 'RELIANCE',
  p_side: 'BUY',
  p_order_type: 'MARKET',
  p_product: 'CNC',
  p_quantity: 10,
  p_limit_price: null,
})
```

### Realtime — Postgres Changes

```ts
const channel = supabase
  .channel('quotes-live')
  .on(
    'postgres_changes',
    // Scope delivery server-side to the symbols on screen.
    { event: 'UPDATE', schema: 'public', table: 'quotes', filter: `symbol=in.(${symbols.join(',')})` },
    (payload) => applyQuote(payload.new)
  )
  .subscribe()

// React cleanup
return () => {
  supabase.removeChannel(channel)
}
```

**Rules:**

- Use the **publishable key** env var name (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Supabase's current docs and key rotation use publishable/secret naming, not `ANON_KEY`.
- In `src/proxy.ts`, never place any code between `createServerClient(...)` and `supabase.auth.getUser()`, and always return the `supabaseResponse` object unmodified. Breaking either rule logs users out at random.
- Trust `supabase.auth.getUser()` on the server; never trust `getSession()` for authorisation, because the session comes from a cookie the client can write.
- `createAdminClient()` may be imported only by `supabase/functions/**` equivalents and server-only modules. The `import 'server-only'` line makes a client import a build error — never remove it.
- Realtime requires the table be added to the `supabase_realtime` publication in a migration; adding the subscription in TypeScript alone silently receives nothing.
- Subscribe to `quotes` and `orders` only. Never open a Realtime channel on `funds`, `trades`, `holdings`, or `positions` — those refresh through Server Action revalidation.
- **Always filter server-side.** Subscribing to a whole table and filtering in the callback still has every row delivered to and authorized for every subscriber, which defeats the demand-driven model the quote pipeline is justified by. Rebuild the channel when the visible symbol set changes.
- Postgres Changes authorizes per event per subscriber and does not scale indefinitely. It is the right choice at this project's size; if the symbol set or user count grows, move to Realtime Broadcast rather than widening the filter.
- Always `supabase.removeChannel(channel)` in the effect cleanup; unremoved channels leak across navigations and hit the free-tier concurrent connection cap.
- **Re-checked against Context7 at the Phase 4 checkpoint (2026-09-09): the raw `symbol=in.(…)` filter string above is still current and documented.** Supabase has since *added* a builder form, `postgresChangesFilter().in('symbol', [...])`, alongside it — an addition, not a replacement, so the code needs no change. The supported operator set is wider than this file implies: `eq, neq, lt, lte, gt, gte, in, like, ilike, is, match, imatch, isdistinct`, any of them negatable with `not.`, and commas combining conditions as AND.
- Regenerate `src/types/database.ts` with `pnpm supabase gen types typescript --linked > src/types/database.ts` after every migration.

---

## Supabase Cron (`pg_cron` + `pg_net`)

**Check first:** Context7 `/supabase/supabase`, then https://supabase.com/docs/guides/cron

### Setup

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

### Scheduling the market tick

```sql
-- Every minute of UTC hours 03–10 on weekdays ≈ 08:30–16:29 IST.
-- This window is deliberately WIDER than the 09:15–15:30 IST session: a cron hour
-- range cannot express 09:15–15:30, and no cron expression can encode NSE's ~15
-- annual trading holidays. The real gate is isTradingSession() inside the function.
select cron.schedule(
  'market-tick',
  '* 3-10 * * 1-5',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/market-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- The scheduler credential. `apikey` alone does NOT satisfy Edge Function JWT
      -- verification; without a bearer credential the invocation is rejected, and
      -- turning verification off would make the tick a public endpoint.
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_credential'
      )
    ),
    body := jsonb_build_object('trigger', 'cron', 'at', now()),
    timeout_milliseconds := 8000
  ) as request_id;
  $$
);
```

**Rules:**

- One minute is the finest interval `pg_cron` supports; sub-minute liveliness comes from client-side interpolation, never from a faster schedule.
- Keep total concurrent jobs under 8 and every run under 10 seconds — this project should need exactly one scheduled job.
- Store the project URL and the scheduler credential in Vault (`vault.decrypted_secrets`); never paste a key literal into a migration, because migrations are committed.

**Scheduler authentication contract.** `market-tick` writes quotes, fills orders and squares off
positions. It must not be callable by anyone who merely knows the URL.

- **JWT verification stays enabled** for this function. Do not add `verify_jwt = false` to `config.toml` for it. "Only cron calls it" is not an access control — the URL is guessable and the function is unauthenticated the moment verification is off.
- `pg_cron` sends `Authorization: Bearer <credential>` read from Vault, so the platform gateway rejects unauthenticated callers before any of our code runs.
- **Answered by measurement in F16, and the answer is worse than expected.** Invoking the deployed function four ways on this project:

  | Request | Result |
  | ------- | ------ |
  | No `Authorization` header | `401 UNAUTHORIZED_NO_AUTH_HEADER` — the platform's error shape, so it never reached our code |
  | `Bearer sb_secret_…` (service role) | **200** |
  | `Bearer sb_publishable_…` | **200** |

  So the newer non-JWT `sb_secret_…` keys **do** satisfy the gateway — but so does the **publishable key, which ships in the browser bundle**. `verify_jwt` proves only that the caller knows *some* project key. It is not, on its own, access control for a function that writes quotes, fills orders and squares off positions.

- **Therefore both layers are mandatory, and the shared secret is the real one.** JWT verification stays enabled — it is what rejects a caller with no header at all — *and* the handler compares an `x-scheduler-secret` header against a Vault-held value before touching the database, with a constant-time comparison. A missing secret makes the function refuse rather than fall open; otherwise a misconfiguration silently downgrades it to "whoever reads the JavaScript may run the tick".
- `pg_cron` sends both: `Authorization: Bearer` from a Vault secret named `service_role_key`, and `x-scheduler-secret` from one named `scheduler_secret`. Neither literal appears in a migration, because migrations are committed.
- A 401 in `cron.job_run_details` means the credential is wrong, not that the function is broken. Check there first.
- `pg_cron` schedules in the database's timezone (UTC). Write the expression in UTC and put the IST equivalent in a comment beside it, as above — and **check the arithmetic**: an hours field like `3-10` covers every minute of hours 3 through 10 inclusive (03:00–10:59 UTC), not 03:00–10:00.
- **The cron window is never the market-hours check.** It exists to stop the job burning quota overnight. Whether the market is actually open is decided by `isTradingSession()` inside the function, against an IST clock and an NSE holiday calendar, before any quote write, limit match, or square-off. A cron expression cannot encode trading holidays, so trusting one guarantees the job trades on Republic Day.
- Keep the holiday list in a `market_holidays` table rather than a hardcoded array — NSE publishes it annually and it changes every year.
- Check `cron.job_run_details` when a job appears not to fire; `pg_net` failures are recorded there, not in the Edge Function logs.
- Unschedule with `cron.unschedule('market-tick')` inside a migration — never leave a stale job pointing at a deleted function.

---

## Next.js 16

**Check first:** Context7 `/vercel/next.js`, then https://nextjs.org/docs

Version 16.3.1.

### Proxy (formerly middleware)

```bash
# Migrating an older middleware.ts:
npx @next/codemod@canary middleware-to-proxy .
```

The file is `src/proxy.ts`, the export is `proxy`, and the full implementation is the golden pattern in
`architecture/patterns.md` → Key Patterns.

**Rules:**

- `middleware.ts` is deprecated in Next.js 16 — this project uses `proxy.ts` only, with a named `proxy` export.
- The proxy runs on the **Node.js runtime and that is not configurable**; the edge runtime is unavailable there. Do not add a `runtime` export to it.
- `cookies()`, `headers()`, `params`, and `searchParams` are all async — `await` every one.
- Route handlers exist only at `/auth/callback` and `/api/health`. Everything else that mutates is a Server Action.

---

## Tailwind CSS v4

**Check first:** Context7 `/tailwindlabs/tailwindcss.com`, then https://tailwindcss.com/docs/installation/framework-guides/nextjs

Version 4.3.3. There is **no `tailwind.config.js`** in v4 — configuration is CSS.

### Setup

```js
// postcss.config.mjs
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
export default config
```

```css
/* src/app/globals.css */
@import "tailwindcss";

/* Dark is the base theme; `.light` overrides it. See the theme note below. */
@custom-variant light (&:where(.light, .light *));

@theme {
  /* ── Brand ── one accent carries every primary action. There is no second brand colour. */
  --color-brand: #fcd535;
  --color-brand-active: #f0b90b;   /* hover / press */
  --color-brand-disabled: #3a3a1f; /* desaturated, dark-canvas only */
  --color-on-brand: #181a20;       /* black on yellow — the system's signature pairing */

  /* ── Trading semantics ── fixed meaning everywhere, never decorative */
  --color-up: #0ecb81;
  --color-down: #f6465d;

  /* ── Surfaces (dark = default) ── */
  --color-canvas: #0b0e11;           /* page floor; near-black, never pure black */
  --color-surface: #1e2329;          /* cards, dropdowns, table panels */
  --color-surface-elevated: #2b3139; /* nested cards, hovered rows, chart panels */
  --color-hairline: #2b3139;         /* 1px borders — same value as elevated: borders are surface steps, not ink */

  /* ── Text ── */
  --color-ink: #ffffff;         /* high-contrast headlines */
  --color-body: #eaecef;        /* running text; deliberately not pure white */
  --color-muted: #707a8a;       /* captions, column headers, footer links */
  --color-muted-strong: #929aa5;

  /* ── Info / focus ── */
  --color-info: #3b82f6;

  /* ── Chart categorical ramp ── see the Recharts rules for why up/down are excluded */
  --color-chart-1: #d6be5c;
  --color-chart-2: #1212f3;
  --color-chart-3: #225159;
  --color-chart-4: #cb0b98;
  --color-chart-5: #ab812b;
  --color-chart-6: #a5bd0a;
  --color-chart-7: #849fbd;
  --color-chart-8: #91087f;
  --color-chart-9: #d68d5c;
  --color-chart-10: #eda682;

  /* ── Type ── Inter substitutes BinanceNova, IBM Plex Sans substitutes BinancePlex */
  --font-sans: var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-numeric: var(--font-plex), var(--font-inter), sans-serif;

  --text-caption: 0.75rem;        /* 12 / 500 */
  --text-body-sm: 0.8125rem;      /* 13 / 400 */
  --text-body: 0.875rem;          /* 14 / 400 — default running text */
  --text-number-sm: 0.875rem;     /* 14 / 500 — inline prices, % change */
  --text-number: 1rem;            /* 16 / 500 — table prices */
  --text-title-sm: 1rem;          /* 16 / 600 */
  --text-title: 1.25rem;          /* 20 / 600 */
  --text-title-lg: 1.5rem;        /* 24 / 600 */
  --text-display-sm: 2rem;        /* 32 / 600 */
  --text-display: 2.5rem;         /* 40 / 600 */
  --text-display-lg: 3rem;        /* 48 / 700 */
  --text-hero: 4rem;              /* 64 / 700, tracking -1px */
  --text-number-display: 2.5rem;  /* 40 / 700 — big stat figures */

  /* ── Radius ── tighter than typical; most surfaces sit at 6–12px */
  --radius-xs: 2px;
  --radius-sm: 4px;   /* dense trading buttons */
  --radius-md: 6px;   /* standard CTA, inputs */
  --radius-lg: 8px;   /* search input, content cards */
  --radius-xl: 12px;  /* elevated card containers */

  /* ── Rhythm ── 4px base matches Tailwind's default scale; only the band needs a token */
  --spacing-section: 80px;
}

/* Light theme. Only canvas, surface and text tones flip — brand yellow and
   trading green/red are byte-identical in both modes, by design. */
.light {
  --color-canvas: #ffffff;
  --color-surface: #fafafa;
  --color-surface-elevated: #f5f5f5;
  --color-hairline: #eaecef;
  --color-ink: #181a20;
  --color-body: #181a20;
}

/* Prices must align in columns. */
.font-numeric { font-variant-numeric: tabular-nums; }
```

```tsx
// src/app/layout.tsx — font wiring
import { Inter, IBM_Plex_Sans } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
  display: 'swap',
})
```

**Rules:**

- Never create `tailwind.config.js`. Any request to "add a colour to the config" means adding a token under `@theme` in `globals.css`.
- `@import "tailwindcss"` replaces the three `@tailwind` directives; never write `@tailwind base`.
- **Dark is the base theme, not a variant.** The dark values live on bare `:root` via `@theme`, and `.light` overrides them. `next-themes` runs with `attribute="class"` and `defaultTheme="dark"`. Because of this inversion there is a `light:` variant and **no `dark:` variant** — components must not write `dark:` colour utilities. They use tokens, and the tokens flip.
- Every colour in a component comes from a `--color-*` token (`bg-surface`, `text-muted`, `border-hairline`). **No raw hex in `className`, ever** — the theme swap depends entirely on tokens.
- **Fixed semantic mappings, identical across the whole app:** gain / up-tick is `text-up`, loss / down-tick is `text-down`, and the primary action of any screen is `bg-brand text-on-brand`. Never repurpose `--color-up` or `--color-down` for decoration, category encoding, or a non-price meaning.
- **One accent only.** There is no secondary brand colour. If a design seems to need one, it needs hierarchy instead — surface elevation, muted text, or a hairline.
- Numbers render in `font-numeric` with `tabular-nums`: prices, quantities, P&L, percentages, stat counters. Editorial text renders in `font-sans`. Mixing them is not optional — the split is what gives the interface its trading-terminal character.
- Depth comes from **flat colour blocks and 1px hairlines**, not shadows. The only shadow in the system is the focus ring, `0 0 0 2px --color-info` at 50% alpha. No glassmorphism, no gradient surfaces.
- Radius: `--radius-sm` for dense in-table buttons, `--radius-md` for standard CTAs and inputs, `--radius-lg` for cards and search, `--radius-xl` for elevated containers. Pill radius (`rounded-full`) is reserved for the top-of-page sign-up action and nothing else.
- Vertical rhythm between marketing bands is `--spacing-section` (80px), uniform — the system uses contrast rather than variable whitespace to separate sections.

### Adapting the system to this project

`context/DESIGN.md` is the source system. Three deliberate deviations, each with a reason:

- **Branding is ZerodhaRebuild's, not Binance's.** Tokens, type scale, spacing, elevation and component shapes are adopted; the wordmark, product names, marketing copy and claims are not. Reproducing another company's live brand on a public portfolio site is a trademark problem, and the same call was already made for Zerodha.
- **Fonts are substituted**, per DESIGN.md's own substitution note: **Inter** for BinanceNova, **IBM Plex Sans** for BinancePlex. Both are on Google Fonts and load through `next/font`. Plex is chosen over JetBrains Mono because dense P&L cards read better in humanist proportions than in monospace, and `tabular-nums` recovers the column alignment. Reduce display line-height by ~3% against the DESIGN.md figures to match BinanceNova's tighter cap height.
- **Both the marketing site and the terminal default to dark.** DESIGN.md maps marketing to dark and transactional surfaces to light; a trading terminal belongs on the dark canvas, so light becomes a user preference stored in `profiles.theme` rather than a per-surface rule.

---

## shadcn/ui

**Check first:** https://ui.shadcn.com/docs — CLI version 4.18.0.

### Setup

```bash
# Verified working 2026-08-21 with shadcn 4.18.0. The CLI now picks a component
# base (Base UI / Radix / React Aria) and prompts for a style preset that -y does
# NOT skip, so both are passed explicitly. architecture.md specifies Radix.
pnpm dlx shadcn@4.18.0 init -b radix -t next -p nova --css-variables -y
pnpm dlx shadcn@4.18.0 add button dialog dropdown-menu tabs input select command table skeleton sonner -y
# `sheet` was added later, for the public mobile nav (F03). `-y` does NOT skip the
# "file already exists, overwrite?" prompt for shared files like button.tsx, so pipe
# `n` rather than passing -y once anything is already in components/ui/:
#   yes n | pnpm dlx shadcn@4.18.0 add sheet
```

`init` writes `components.json`, creates `src/lib/utils.ts`, **rewrites `globals.css`**, and
**injects Geist into the root layout** — the last two must be reverted, since this project's tokens
and fonts are its own.

`shadcn` is a **runtime dependency**, not only a CLI: `globals.css` imports `shadcn/tailwind.css`
for the scroll-fade, shimmer and no-scrollbar utilities its components use. It defines no colour
tokens, so it does not collide with the palette.

**Rules:**

- Components land in `src/components/ui/` and are **ours** — restyle them freely to match the system's density: `--text-body` (14px) defaults, `--radius-md` corners, 1px `--color-hairline` borders, 40px control height.
- Change styling, never a component's public API. A `Button` that takes different props than upstream breaks every future `shadcn add`.
- No domain logic and no Supabase imports inside `src/components/ui/`. Trading components compose these primitives from `src/components/terminal/`.
- The order ticket is a `Dialog`; stock search is `Command`; Orders page tabs are `Tabs`; notifications are `sonner`, not the deprecated shadcn toast.

### The token bridge — run this on every `shadcn add`

shadcn's components are written against their own token vocabulary. `globals.css` carries a
`@theme inline` bridge mapping it onto this project's palette, so most components work untouched.
Three things still need doing by hand after every add, and a component that skips them fails
silently rather than loudly:

| Found in an added component | Rewrite to | Why |
| --- | --- | --- |
| `dark:*` (any utility) | delete it | Tailwind v4 binds `dark:` to `prefers-color-scheme`. This project's dark is the *base* and `.light` overrides, so a `dark:` class would follow the visitor's OS instead of the theme. The variant is also redefined to match nothing, so these are inert — but they must still go |
| `bg-muted`, `bg-muted/50` | `bg-surface-elevated` | shadcn means a *surface* by `muted`; this project means the *text* grey. `--color-muted` is deliberately absent from the bridge for exactly this reason |
| `var(--secondary)` | `var(--color-surface-elevated)` | Bare custom properties are **not** defined here. Our tokens are `--color-*` via `@theme`, so each of these resolves to nothing |
| `var(--foreground)` | `var(--color-body)` | as above |
| `var(--popover)` | `var(--color-surface)` | as above |
| `var(--popover-foreground)` | `var(--color-body)` | as above |
| `var(--border)` | `var(--color-hairline)` | as above |
| `var(--radius)` | `var(--radius-lg)` | this project defines `--radius-xs…xl`, never a bare `--radius` |

`var(--radius-md)` and friends **are** defined and need no rewrite.

Density pass on controls: `h-8`/`h-9` → `h-10` (40px), `rounded-lg` → `rounded-md` (6px),
`border-input` → `border-hairline`.

**Scope any bulk rewrite to double-quoted string literals.** A whitespace regex run over a whole
source file mangles the code around the class strings — this cost a full regeneration once already.

- `text-muted-foreground` needs no rewrite: the bridge aliases it to this project's `--color-muted`.
- **Overriding a variant-prefixed class needs the same prefix.** Several primitives style themselves through attribute variants — `sheet` sizes itself with `data-[side=right]:w-3/4`. A plain `w-full` passed via `className` loses on specificity and is silently ignored, because `tailwind-merge` treats the two as different keys and keeps both. Write `data-[side=right]:w-full`. This fails visually rather than loudly, so check the rendered width, not the class list (F03).

---

## Zustand

**Check first:** Context7 `/pmndrs/zustand` — version 5.0.15.

### Setup

```ts
// src/lib/stores/quote-store.ts
import { create } from 'zustand'

export type LiveQuote = {
  ltp: number
  prevClose: number
  provider: 'YAHOO' | 'TWELVE_DATA' | 'SIMULATOR'
  providerTs: Date | null
  direction: 'up' | 'down' | 'flat'
  /** The last value the server actually sent. Decision surfaces render this. */
  anchor: number
  updatedAt: number
}

type QuoteState = {
  quotes: Record<string, LiveQuote>
  applyServerQuote: (
    symbol: string,
    ltp: number,
    meta: Pick<LiveQuote, 'provider' | 'providerTs'>
  ) => void
}

export const useQuoteStore = create<QuoteState>()((set) => ({
  quotes: {},
  applyServerQuote: (symbol, ltp, meta) =>
    set((state) => {
      const previous = state.quotes[symbol]
      return {
        quotes: {
          ...state.quotes,
          [symbol]: {
            ...previous,
            ltp,
            anchor: ltp,
            provider: meta.provider,
            providerTs: meta.providerTs,
            prevClose: previous?.prevClose ?? ltp,
            direction: !previous ? 'flat' : ltp > previous.ltp ? 'up' : ltp < previous.ltp ? 'down' : 'flat',
            updatedAt: Date.now(),
          },
        },
      }
    }),
}))
```

### Selecting without re-render storms

```tsx
// One symbol per subscriber — a watchlist row re-renders only when its own price moves.
const quote = useQuoteStore((state) => state.quotes[symbol])

// Multiple values need useShallow, or the new object identity re-renders every tick.
import { useShallow } from 'zustand/react/shallow'
const { ltp, direction } = useQuoteStore(
  useShallow((state) => ({ ltp: state.quotes[symbol]?.ltp, direction: state.quotes[symbol]?.direction }))
)
```

**Rules:**

- Never call `useQuoteStore()` with no selector in a component. The store updates several times a second; an unselected subscription re-renders the entire terminal on every tick.
- Selectors returning a new object or array **must** be wrapped in `useShallow` — this is a v5 requirement and the most common cause of infinite render loops here.
- The store holds live prices only. Orders, holdings, funds and positions are server state and never enter Zustand.
- **`ltp` may be interpolated; `anchor` never is.** The order ticket, order confirmation, stock detail header, and every monetary total read `anchor`. Only ambient surfaces read `ltp`, and today that is the watchlist alone. **The dashboard summary tiles are not among them** — they are monetary totals, and F21 resolved `architecture.md`'s contradiction on that point in the invariant's favour.
- Never store a derived `source` in the store. Compute it on render with `deriveSource(provider, providerTs, new Date())`; freshness changes with the clock, so a stored value goes wrong without any state change.
- The interpolation loop runs in exactly one `requestAnimationFrame` driver mounted once in the terminal layout — never one per row.
- Read outside React with `useQuoteStore.getState()`; never subscribe from a non-component module.

---

## Quote providers

**Check first:** these are undocumented public endpoints. Verify the live response shape with `curl` before writing a parser, and re-verify whenever parsing starts failing.

### Yahoo Finance — primary, keyless

Verified live on 2026-08-20:

```
GET https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?interval=1d&range=1d
```

Confirmed response fields under `chart.result[0].meta`:

```ts
// Parse with Zod — never index into this response directly.
const YahooChartSchema = z.object({
  chart: z.object({
    result: z.array(
      z.object({
        meta: z.object({
          symbol: z.string(),                    // "RELIANCE.NS"
          currency: z.string(),                  // "INR"
          regularMarketPrice: z.number(),        // LTP
          chartPreviousClose: z.number(),        // previous close
          regularMarketDayHigh: z.number().nullish(),
          regularMarketDayLow: z.number().nullish(),
          regularMarketVolume: z.number().nullish(),
          regularMarketTime: z.number(),         // unix seconds
          fiftyTwoWeekHigh: z.number().nullish(),
          fiftyTwoWeekLow: z.number().nullish(),
          longName: z.string().nullish(),
        }),
      })
    ).min(1),
  }),
})
```

**Rules:**

- **One symbol per request.** The batched `v7/finance/quote` and `v7/finance/spark` endpoints return `429` — they are crumb-walled and must not be used.
- Yahoo rate-limits aggressively per IP: a burst of 8 sequential requests returned seven `429`s. Stagger requests, cap each tick at `MAX_SYMBOLS_PER_TICK`, and trip the circuit breaker for 5 minutes on the first `429`.
- Send a realistic browser `User-Agent`; requests without one are refused more often.
- Map NSE symbols to Yahoo symbols through `instruments.yahoo_symbol`, never by appending `.NS` in code — some symbols do not follow the pattern.
- Map NSE symbols to Yahoo symbols through `instruments.yahoo_symbol` (see the rule above); the same mapping serves candles.

### Yahoo Finance — historical candles

The same `v8/finance/chart` endpoint returns OHLC series when given `interval` and `range`. One request
per symbol per interval, subject to the same rate limiter and circuit breaker as quotes.

| UI range | `interval` | `range` | Stored as |
| -------- | ---------- | ------- | --------- |
| 1D | `5m` | `1d` | `FIVE_MIN` |
| 1W | `30m` | `5d` | `THIRTY_MIN` |
| 1M | `1d` | `1y` | `ONE_DAY` |
| 1Y | `1d` | `1y` | `ONE_DAY` |

1M and 1Y are served from one stored daily series — fetch `range=1y` once and window it, rather than
issuing two requests for overlapping data.

**Rules:**

- **TODO: verify the candle response shape with a live request before implementing the parser.** The expected location is `chart.result[0].timestamp[]` alongside parallel arrays in `chart.result[0].indicators.quote[0]` (`open`, `high`, `low`, `close`, `volume`), but **three attempts to confirm it were rate-limited (HTTP 429)** and nothing about this shape has been verified. Write the Zod schema from an observed response, not from this table.
- Candle arrays are **parallel and sparse**: entries can be `null` for gaps and halts. Drop any index where `close` is null rather than forward-filling — an invented candle is worse than a shorter series.
- Times are unix **seconds**. Lightweight Charts wants seconds for intraday and `'YYYY-MM-DD'` strings for daily; convert at the boundary, per the Lightweight Charts rules below.
- A failed or rate-limited candle fetch serves the existing cached rows with their true age shown. Never render an empty chart when stale data exists, and never synthesise candles to fill a gap in a real series — the simulator produces a whole series or nothing.
- NSE's own API (`nseindia.com/api/equity-stockIndices`) is behind an Akamai bot wall and returned `403` even with cookie priming. Do not build against it.

### Twelve Data — optional secondary

**Verified against the live API on 2026-08-21 with a real free-tier key, and the result is disqualifying: the free plan does not carry NSE symbols at all.**

```
GET https://api.twelvedata.com/quote?symbol=AAPL&apikey=…
  → 200  {"symbol":"AAPL","exchange":"NASDAQ","currency":"USD","close":"308.205", …}

GET https://api.twelvedata.com/quote?symbol=RELIANCE&exchange=NSE&apikey=…
  → 404  {"code":404,"message":"This symbol is available starting with the Grow or Venture plan…"}

GET https://api.twelvedata.com/quote?symbol=RELIANCE&apikey=…      → same 404
GET https://api.twelvedata.com/quote?symbol=RELIANCE.NS&apikey=…   → 404, invalid symbol format
```

The US control proves the key and the endpoint shape are fine, so this is a **plan entitlement**, not a symbol-format problem. Every instrument this project trades is on NSE, so a free-tier Twelve Data provider can serve **none** of them.

- **Rate limits, confirmed from the account and from response headers**: 8 requests per minute, 800 API credits per day. `/quote` costs 1 credit per symbol; responses carry `api-credits-used`, `api-credits-left` and `api-credits-request`. Even with NSE access, 800/day cannot sustain a one-minute tick across a ~375-minute session — that is ~2 requests per minute sustained, for ~200 symbols.
- **Consequence for the provider chain (open, decide in F15):** as things stand the chain is Yahoo → simulator, with the middle tier unavailable. `architecture.md`'s stack table still describes Twelve Data as a working fallback and needs reconciling once that call is made.
- The provider must report `isAvailable() === false` when `TWELVE_DATA_API_KEY` is unset, so the chain skips it silently. On the free plan it would also have to report false **with** a key set, since the key entitles nothing this project can use.

### Simulator — final fallback, always available

- **The walk's starting point and the band's anchor are two different things**, and conflating them removes the band. It *starts* from the last known `quotes.ltp`, falling back to `instruments.prev_close`; it is *clamped* to ±5% of `quotes.prev_close`, falling back to that same seed only on a cold start.
- "Per session" is load-bearing. `quotes.prev_close` is rolled at the first in-session tick by `roll_previous_close()`, so each session's band is measured from the previous session's close. Anchoring on `instruments.prev_close` instead — which never moves — pins every price within 5% of the day the universe was seeded, forever; anchoring on the *last price* removes the bound altogether, because the band then re-centres on the walk every tick.
- A symbol with no previous close at all is **declined**, not walked unbounded. `isAvailable` reports false for it.
- Always writes `provider = 'SIMULATOR'` and a null `provider_ts`, which `deriveSource()` renders as `SIMULATED`. Never label simulated data as anything else — the badge is the project's honesty guarantee.

---

## Zod

**Check first:** Context7 `/colinhacks/zod` — version 4.4.3.

### Setup

```ts
// src/lib/trading/schemas.ts
import { z } from 'zod'

export const placeOrderSchema = z
  .object({
    symbol: z.string().min(1).max(20),
    side: z.enum(['BUY', 'SELL']),
    orderType: z.enum(['MARKET', 'LIMIT']),
    product: z.enum(['CNC', 'MIS']),
    quantity: z.coerce.number().int().positive().max(100000),
    limitPrice: z.coerce.number().positive().nullable().optional(),
  })
  .refine((v) => v.orderType !== 'LIMIT' || v.limitPrice != null, {
    message: 'A limit order needs a limit price.',
    path: ['limitPrice'],
  })

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>
```

**Rules:**

- Server Actions use `safeParse` and return the standard error shape. Never `parse` in an action — a throw becomes an opaque production digest.
- Form number fields need `z.coerce.number()`; HTML inputs hand over strings.
- Cross-field rules (limit price required for limit orders) belong in `.refine()` on the schema, not in the component.
- Every upstream API response gets a schema. A provider whose shape drifted must fail its parse and fall through the chain, not write garbage into `quotes`.

---

## react-hook-form + @hookform/resolvers

**Check first:** Context7 `/react-hook-form/resolvers` — `react-hook-form` 7.85.0, `@hookform/resolvers` 5.9.1.

### Setup

```tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { placeOrderSchema, type PlaceOrderInput } from '@/lib/trading/schemas'

export function OrderTicket({ symbol }: { symbol: string }) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PlaceOrderInput>({
    resolver: zodResolver(placeOrderSchema),
    defaultValues: { symbol, side: 'BUY', orderType: 'MARKET', product: 'CNC', quantity: 1 },
  })

  const onSubmit = handleSubmit(async (values) => {
    const result = await placeOrder(values)
    if (!result.ok) toast.error(result.error.message)
  })

  return <form onSubmit={onSubmit}>{/* … */}</form>
}
```

**Rules:**

- `@hookform/resolvers` v5 detects Zod 4 schemas automatically — keep using `zodResolver` from `@hookform/resolvers/zod`. (`standardSchemaResolver` from `@hookform/resolvers/standard-schema` also works; do not mix both in one codebase.)
- Register numeric inputs with `{ valueAsNumber: true }` or let `z.coerce.number()` handle it — never both, or the field becomes `NaN`.
- Client validation is convenience only. The Server Action re-validates with the same schema, and the database re-checks margin. Never treat a passing form as authorisation.
- Disable the submit button on `isSubmitting` — a double-submitted market order would place two real orders.

---

## Recharts

**Check first:** Context7 `/recharts/recharts` — version 3.10.1.

### Top-10 holdings donut

```tsx
'use client'
import { PieChart, Pie, Sector, ResponsiveContainer, Tooltip, type PieSectorShapeProps } from 'recharts'

// Categorical ramp from @theme. Deliberately excludes --color-up / --color-down:
// those two carry a fixed price-direction meaning, and a green holdings slice
// would read as "this position is up" when it means nothing of the sort.
const SLICE_COLORS = [
  'var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)',
  'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-chart-6)',
  'var(--color-chart-7)', 'var(--color-chart-8)', 'var(--color-chart-9)',
  'var(--color-chart-10)',
] as const

const HoldingSlice = (props: PieSectorShapeProps) => (
  <Sector {...props} fill={SLICE_COLORS[props.index % SLICE_COLORS.length]} />
)

export function HoldingsDonut({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} shape={HoldingSlice} />
        {/* Recharts 3 types the formatter's value as ValueType | undefined. Annotating
            the parameter `number` does not compile — narrow inside instead. */}
        <Tooltip formatter={(value) => (typeof value === 'number' ? formatCurrency(value) : '—')} />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

**Rules:**

- Use the `shape` prop with a `PieSectorShapeProps` component for per-slice colour. `<Cell>` is the legacy approach in Recharts 3 and is being replaced. `props.index` is optional on that type — default it before indexing the ramp.
- **`<Tooltip formatter={(value: number) => …}>` does not typecheck**, though an earlier draft of this file showed it that way. Recharts 3 types the value as `ValueType | undefined`; narrow inside the callback. (F21)
- `ResponsiveContainer` needs a parent with a definite height; give the wrapper an explicit `h-[280px]`, or the chart collapses to zero.
- Every Recharts component is client-side — the chart file carries `'use client'`, and the page passes it plain serialisable data.
- Compute the top ten and the "Others" bucket on the server; the chart component never aggregates.
- Colours come from the `--color-chart-*` tokens, not literals, so the donut re-themes with the app.
- **Never colour a categorical chart with `--color-up` or `--color-down`.** They mean "price rose" and "price fell" everywhere else in the app; borrowing them for slice identity breaks that contract. Only a chart that genuinely encodes gain versus loss — the P&L breakdown bar — may use them.
- The ramp is an extension of `DESIGN.md`, which defines no categorical palette. **It was measured before the dashboard shipped and replaced (F21)** — the original ramp failed. Two findings worth keeping:
  - **`#3b82f6` and `#8b5cf6` were 0.8 apart under a deuteranopia simulation**, which is to say indistinguishable. Blue and violet collapse onto the same point for a deuteranope; the ramp had three colours in that family. The replacement's worst pair is 23.9.
  - **Hue cannot separate ten categories for a deuteranope** — the discriminable axis is roughly blue↔yellow, and ten hues do not fit on it. The ramp therefore steps *lightness* as well, which is why it holds two blues and two magentas at different depths instead of ten distinct hues.
- **The binding contrast requirement is against `--color-surface`, not `--color-canvas`.** WCAG 1.4.11's 3:1 applies to graphics *required to understand the content*, and the donut is paired with a data table listing every holding, its value and its share — remove all colour and nothing is lost. What must hold is that no arc dissolves into the card it is drawn on, in either theme, which is a ~1.7:1 floor. Requiring 3:1 against both a white and a near-black canvas forces every colour into one narrow luminance band, which is what pushed an earlier attempt at this ramp into five near-identical oranges.
- **Never use green or red in this ramp** — not merely `--color-up` and `--color-down` themselves. Any green reads as "up" and any red as "down" to someone scanning a trading screen, whatever the exact hex.

---

## Lightweight Charts

**Check first:** Context7 `/websites/tradingview_github_io_lightweight-charts_5_0` — version 5.2.1.

### Setup

```tsx
'use client'
import { useEffect, useRef } from 'react'
import { createChart, CandlestickSeries, type IChartApi } from 'lightweight-charts'

export function PriceChart({ candles }: { candles: CandleData[] }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart: IChartApi = createChart(containerRef.current, {
      // Canvas cannot read CSS variables — resolve tokens once and pass values in.
      layout: { background: { color: 'transparent' }, textColor: theme.muted },
      grid: { vertLines: { visible: false }, horzLines: { color: theme.hairline } },
      autoSize: true,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: theme.up,        // --color-up   #0ecb81
      downColor: theme.down,    // --color-down #f6465d
      borderVisible: false,
      wickUpColor: theme.up,
      wickDownColor: theme.down,
    })

    series.setData(candles)
    chart.timeScale().fitContent()

    return () => {
      chart.remove()
    }
  }, [candles])

  return <div ref={containerRef} className="h-[360px] w-full" />
}
```

**Rules:**

- v5 uses `chart.addSeries(CandlestickSeries, options)`. The v4 helpers (`chart.addCandlestickSeries(...)`) no longer exist — do not copy v4 examples.
- Always `chart.remove()` in the effect cleanup. The chart is a canvas outside React's tree and leaks on every navigation otherwise.
- Set `autoSize: true` rather than wiring a manual `ResizeObserver`; the library handles it.
- The container needs an explicit height class — the chart fills its parent and renders nothing in a zero-height box.
- `time` is unix **seconds** for intraday and `'YYYY-MM-DD'` strings for daily. Mixing the two in one series silently drops points.
- Theme colours are passed in as resolved values from a `'use client'` wrapper that reads `next-themes` and calls `getComputedStyle(document.documentElement).getPropertyValue('--color-up')` — the chart draws to canvas and cannot resolve CSS variables itself.
- Re-create or re-apply options when the theme toggles; a chart built under dark tokens keeps them after a switch to light otherwise.
- Candles use `--color-up` and `--color-down` — this is the one place those tokens are load-bearing rather than semantic decoration.

---
