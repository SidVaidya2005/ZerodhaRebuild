# Library Docs

> Role: How ZerodhaRebuild uses each external library.
> Read the relevant section before using a library.
> Relates to: the stack in `architecture.md`; the library authority order in `CLAUDE.md` applies.

This file explains the setup, examples and rules specific to ZerodhaRebuild. It is not a general
library manual. Code blocks illustrate a pattern; use the full implementations linked below where
noted. Versions and verification dates record what was checked during the build.

---

Follow the library authority order in `CLAUDE.md`/`AGENTS.md`: Context7 first, then applicable
skills, then this file, then official documentation through web search. Do not invent an API
shape (the functions, arguments and return values a library expects) from memory.

---

## @supabase/ssr + @supabase/supabase-js

Check first: Context7 `/supabase/supabase`, then https://supabase.com/docs/guides/auth/server-side/nextjs

Versions: `@supabase/ssr` 0.12.4, `@supabase/supabase-js` 2.112.3.

Supabase provides the database, sign-in and change subscriptions. SSR means server-side rendering:
the server prepares the page before sending it to the browser.

### Setup

There are four Supabase clients: browser, Server Component / Server Action, proxy and admin.
Each runs in a different place; do not substitute one for another. The admin client bypasses
row-level security (RLS), the database policies that restrict users to their own rows.

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

The React Server Component (RSC) / Server Action client and proxy client are in
`architecture/patterns.md` → Key Patterns. Copy those implementations exactly; the cookie
handling keeps the signed-in session in sync between the browser and server.

### Google OAuth sign-in

Sign-in starts on the server (F12). A plain `<form>` posts to a Server Action, so it works with
JavaScript disabled, as the F07B support form does. The same server client writes and later reads
the PKCE code verifier, a temporary value that ties the OAuth callback to the sign-in request.
On the server, `signInWithOAuth` returns a URL; the action must redirect the user to it.

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

Rules for this flow:

- The browser client (`lib/supabase/client.ts`) supports Realtime updates from F19 onwards. Start sign-in with the Server Action above.
- `redirect()` throws `NEXT_REDIRECT` to tell Next.js to navigate. Call it outside every `try`; catching that exception prevents the redirect.
- `redirectTo` is built from `NEXT_PUBLIC_SITE_URL`, not from the incoming request, because Supabase
  matches it against a configured allow-list.
- Validate `next` with `safeNext()` on both the login page and callback. It rejects absolute URLs, `//host` and `/\host`, preventing a sign-in link from redirecting to another site.

### Calling a database function

An RPC (remote procedure call) runs a named database function. Here the server asks Postgres to
place an order; the database owns the money calculations and writes.

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

A Realtime channel sends database changes to the browser, so a quote can update without reloading
the page. Filter delivery to the symbols currently visible.

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

Rules:

- Use the publishable-key environment variable (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). The docs and key rotation checked for this build use publishable/secret naming rather than `ANON_KEY`.
- In `src/proxy.ts`, keep `createServerClient(...)` immediately before `supabase.auth.getUser()` and return `supabaseResponse` unchanged. Other code between them, or a replacement response, can lose refreshed cookies and unexpectedly sign users out.
- Use `supabase.auth.getUser()` to verify identity on the server. Do not use `getSession()` to decide what a user may access: it reads a cookie the client can write.
- `createAdminClient()` may be imported only by `supabase/functions/**` equivalents and server-only modules. The `import 'server-only'` line makes a client import a build error — never remove it.
- Add each Realtime table to the `supabase_realtime` publication in a migration. A publication tells Postgres which tables may send changes; a TypeScript subscription alone receives nothing.
- Subscribe to `quotes` and `orders` only. Never open a Realtime channel on `funds`, `trades`, `holdings`, or `positions` — those refresh through Server Action revalidation.
- Filter subscriptions on the server so each subscriber receives only the symbols on screen. Filtering inside the callback still delivers every row and checks each subscriber's access to it. Rebuild the channel whenever the visible symbol set changes.
- Postgres Changes checks access for every event and subscriber. It suits this project's size. If symbol or user counts grow, move to Realtime Broadcast rather than making the filter broader.
- Call `supabase.removeChannel(channel)` when the React effect cleans up. Otherwise channels remain open after navigation and can exhaust the free-tier connection limit.
- Context7 verification at the Phase 4 checkpoint (2026-09-09) confirmed that the raw `symbol=in.(…)` filter string above remained documented. Supabase also provided `postgresChangesFilter().in('symbol', [...])`; this was an alternative, not a replacement. Supported operators were `eq, neq, lt, lte, gt, gte, in, like, ilike, is, match, imatch, isdistinct`. Prefix any with `not.` to negate it; commas combine conditions as AND.
- Regenerate `src/types/database.ts` with `pnpm supabase gen types typescript --linked > src/types/database.ts` after every migration.

---

## Supabase Cron (`pg_cron` + `pg_net`)

Check first: Context7 `/supabase/supabase`, then https://supabase.com/docs/guides/cron

`pg_cron` runs database work on a schedule. `pg_net` sends the HTTP request to the Edge Function,
the hosted server function that performs each market tick.

### Setup

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

### Scheduling the market tick

The block below is the earlier scheduling example, not the complete deployed authentication
setup. It shows the UTC schedule and Vault lookup pattern. Before using it, apply the mandatory
two-header contract below: Vault secrets `service_role_key` and `scheduler_secret` provide
`Authorization` and `x-scheduler-secret`. The older `scheduler_credential` name in this snippet
is retained as reference, not the current deployment instruction.

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

Rules:

- One minute is the recorded minimum interval for `pg_cron` in this project. Between ticks, the browser interpolates prices (adds small visual movements); do not use a faster schedule to create that effect.
- Keep concurrent jobs below 8 and each run below 10 seconds. This project should have exactly one scheduled job.
- Store the project URL and scheduler credentials in Vault (`vault.decrypted_secrets`), Supabase's secret store. Never put a key value in a migration: migrations are committed to the repository.

Scheduler authentication: `market-tick` writes quotes, fills orders and squares off positions
(closes intraday trades automatically). Knowing its URL must not grant permission to run it.

- Keep JSON Web Token (JWT) verification enabled. Do not set `verify_jwt = false` in `config.toml` for this function. The URL is guessable; assuming that only cron will call it provides no access control.
- `pg_cron` sends `Authorization: Bearer <credential>` read from Vault, so the platform gateway rejects unauthenticated callers before any of our code runs.
- F16 measured the deployed function's gateway responses. The recorded results were:

  | Request                             | Result                                                                                       |
  | ----------------------------------- | -------------------------------------------------------------------------------------------- |
  | No `Authorization` header           | `401 UNAUTHORIZED_NO_AUTH_HEADER` — the platform's error shape, so it never reached our code |
  | `Bearer sb_secret_…` (service role) | 200                                                                                          |
  | `Bearer sb_publishable_…`           | 200                                                                                          |

  The gateway accepted both the newer non-JWT `sb_secret_…` key and the `sb_publishable_…` key shipped in browser JavaScript. On this project, `verify_jwt` therefore established only that the caller knew a project key. It did not restrict writes, order fills or square-offs to the scheduler.

- Both checks are mandatory. Keep JWT verification to reject requests without a bearer credential. Before any database work, the handler must also compare `x-scheduler-secret` with the Vault value using a constant-time comparison, whose duration does not reveal which characters match. If the configured secret is missing, refuse the request. This second check prevents anyone with the public browser key from running the tick.
- `pg_cron` sends both: `Authorization: Bearer` from a Vault secret named `service_role_key`, and `x-scheduler-secret` from one named `scheduler_secret`. Neither literal appears in a migration, because migrations are committed.
- A 401 in `cron.job_run_details` means the credential is wrong, not that the function is broken. Check there first.
- Write `pg_cron` schedules in the database timezone, UTC, and comment the IST equivalent. Check the conversion: `3-10` includes every minute from 03:00 through 10:59 UTC, not just through 10:00.
- The cron window saves quota overnight; it does not establish that the market is open. Before any quote write, limit match or square-off, `isTradingSession()` must check the IST clock and NSE holiday calendar. The cron expression cannot encode trading holidays and would otherwise allow work on Republic Day.
- Keep the holiday list in a `market_holidays` table rather than a hardcoded array — NSE publishes it annually and it changes every year.
- Check `cron.job_run_details` when a job appears not to fire; `pg_net` failures are recorded there, not in the Edge Function logs.
- Unschedule with `cron.unschedule('market-tick')` inside a migration — never leave a stale job pointing at a deleted function.

---

## Next.js 16

Check first: Context7 `/vercel/next.js`, then https://nextjs.org/docs

Version 16.3.1.

### Error and loading boundaries

Checked against Context7, 2026-09-12 (F36).

`error.tsx` receives three props: `error`, `reset` and `retry`. A boundary is the component that displays a fallback when a child fails:

```tsx
'use client' // error boundaries must be Client Components

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return <button onClick={() => retry()}>Try again</button>
}
```

- `reset()` only resets the boundary. `retry()` calls `router.refresh()` first, then resets. After a server data read fails, `reset` reuses the failed payload, so its button appears to do nothing. Use `retry` for this project's server read failures.
- A boundary catches errors from children, not its own segment's `layout.tsx`. A failure in `(terminal)/layout.tsx` reaches the boundary above it, `src/app/error.tsx`, without the terminal header or sidebar.
- `global-error.tsx` replaces the root layout, so it must declare its own `<html>` and `<body>` and import `globals.css` itself. It cannot reach `next/font` variables or any provider the root layout renders.
- `loading.tsx` wraps the segment in a `<Suspense>` boundary automatically; each nested segment gets its own, so siblings stream independently.
- During static generation (rendering pages at build time), `handleISRError` rethrows an error caught by `error.tsx`, causing the build to fail. The fallback renders normally during a request or ISR revalidation (refreshing a cached page). Terminal routes render dynamically, but a boundary still cannot hide a build-time rendering failure.

### Proxy (formerly middleware)

```bash
# Migrating an older middleware.ts:
npx @next/codemod@canary middleware-to-proxy .
```

Use `src/proxy.ts` with an export named `proxy`. This code runs before the request reaches a page.
The full implementation is in `architecture/patterns.md` → Key Patterns.

Rules:

- `middleware.ts` is deprecated in Next.js 16 — this project uses `proxy.ts` only, with a named `proxy` export.
- The proxy runs on Node.js. This is not configurable, and the edge runtime is unavailable there. Do not add a `runtime` export.
- `cookies()`, `headers()`, `params`, and `searchParams` are all async — `await` every one.
- Route handlers are limited to `/auth/callback`, `/api/health` and the read-only `/reports/export` file download (F34). Application mutations use Server Actions; the explicit exceptions are listed in `code-standards.md`.

---

## Tailwind CSS v4

Check first: Context7 `/tailwindlabs/tailwindcss.com`, then https://tailwindcss.com/docs/installation/framework-guides/nextjs

Version 4.3.3. This project configures Tailwind v4 in CSS, with no `tailwind.config.js`.
Design tokens are named CSS values that generate utilities such as `bg-surface`.

### Setup

The CSS example below records the original token set. The app's complete token definitions are
in `src/app/globals.css`; use those when implementing UI. Later accessibility changes (F38)
add theme-aware `--color-up-text` / `--color-down-text` and light-theme muted tones. The fixed
`--color-up` / `--color-down` values below remain valid for fills, not price text. Read the rules
and adaptations after the example before copying it.

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

Rules:

- Never create `tailwind.config.js`. Any request to "add a colour to the config" means adding a token under `@theme` in `globals.css`.
- `@import "tailwindcss"` replaces the three `@tailwind` directives; never write `@tailwind base`.
- Dark values are the default on `:root`, defined through `@theme`. `.light` overrides them. `next-themes` uses `attribute="class"` and `defaultTheme="dark"`. Use tokens that change with the theme. The project provides `light:` for explicit exceptions; do not write `dark:` colour utilities.
- `next-themes` reads the browser's `localStorage` and writes through `setTheme`; it does not accept a server-supplied theme. `ThemeSync` therefore applies the account preference after mounting, once per full page load. Separately, `ProfileAvatar` must not set `next/image`'s `unoptimized`: that option skips the default loader and its `remotePatterns` allowlist check. (F35)
- Every colour in a component comes from a `--color-*` token (`bg-surface`, `text-muted`, `border-hairline`). No raw hex in `className`, ever — the theme swap depends entirely on tokens.
- Keep price-direction meanings consistent: gains use `text-up-text`, losses use `text-down-text`. The earlier `text-up` / `text-down` foreground mapping was replaced in F38 because its contrast failed. `--color-up` / `--color-down` remain the fixed fill colours for candles, filled trading buttons and status dots. Never use them for decoration, chart categories or another meaning. The primary action remains `bg-brand text-on-brand`.
- Use one brand accent. Create visual hierarchy with lighter surfaces, muted text or thin borders rather than adding a second brand colour.
- Use `font-numeric` with `tabular-nums` for prices, quantities, profit and loss (P&L), percentages and statistics. Equal-width digits align in columns. Use `font-sans` for reading text.
- Separate surfaces with flat colour blocks and 1px borders. The only shadow is the keyboard focus ring, `0 0 0 2px --color-info` at 50% alpha. Do not add blurred translucent panels (glassmorphism) or gradient surfaces.
- Radius: `--radius-sm` for dense in-table buttons, `--radius-md` for standard CTAs and inputs, `--radius-lg` for cards and search, `--radius-xl` for elevated containers. Pill radius (`rounded-full`) is reserved for the top-of-page sign-up action and nothing else.
- Keep vertical spacing between marketing sections uniform at `--spacing-section` (80px). Use colour contrast to separate them.

### Adapting the system to this project

`context/DESIGN.md` describes the reference system. ZerodhaRebuild adapts it as follows:

- Use ZerodhaRebuild branding. Adopt the colours, type sizes, spacing, surface levels and component shapes, but not Binance's wordmark, product names, marketing copy or claims. The project made the same choice for Zerodha to avoid presenting another company's brand as its own on a public portfolio site.
- Substitute Inter for BinanceNova and IBM Plex Sans for BinancePlex, as allowed by DESIGN.md. Load both from Google Fonts through `next/font`. IBM Plex Sans has more natural letter proportions than JetBrains Mono for dense P&L cards; `tabular-nums` still aligns digits. Reduce display line-height by ~3% from DESIGN.md to match BinanceNova's tighter capital-letter height.
- Default both the marketing site and terminal to dark. DESIGN.md changes theme by page type; this project instead stores the user's light/dark preference in `profiles.theme`.
- Accessibility changes override reference styling. Price figures use `--color-up-text` / `--color-down-text`, which change by theme; the original green/red remain fills. Inline links in text blocks have a persistent underline (F04). Brand-yellow text uses `text-brand light:text-ink` except on decorative `aria-hidden` glyphs; `--color-info` is a focus-ring colour, not a normal text colour. Muted tones change in `.light`, and paragraph copy uses `--color-body`, not `--color-muted`. See `constraints.md` → Theming for the measured contrast rules (F38).

---

## shadcn/ui

Check first: https://ui.shadcn.com/docs — CLI version 4.18.0.

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

`init` writes `components.json`, creates `src/lib/utils.ts`, replaces `globals.css` and adds Geist
to the root layout. Revert the last two changes to preserve this project's tokens and fonts.

Keep `shadcn` as a runtime dependency, not just a command-line tool (CLI). `globals.css` imports
`shadcn/tailwind.css` for the components' scroll-fade, shimmer and no-scrollbar utilities. That
stylesheet defines no colour tokens, so it does not conflict with the palette.

Rules:

- Components are copied into `src/components/ui/` and belong to this project. Restyle them for the compact layout: `--text-body` (14px), `--radius-md` corners, 1px `--color-hairline` borders and 40px control height.
- Change styles without changing the component's public props. A `Button` accepting different props from the upstream version breaks future `shadcn add` updates.
- No domain logic and no Supabase imports inside `src/components/ui/`. Trading components compose these primitives from `src/components/terminal/`.
- The order ticket is a `Dialog`; stock search is `Command`; Orders page tabs are `Tabs`; notifications are `sonner`, not the deprecated shadcn toast.

### The token bridge — run this on every `shadcn add`

shadcn components expect different token names. The `@theme inline` block in `globals.css`
maps those names to this project's palette. After every add, make the class and custom-property
changes below; skipping them can produce incorrect styling without an error:

| Found in an added component | Rewrite to                      | Why                                                                                                                                                                                                                                                                               |
| --------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dark:*` (any utility)      | delete it                       | Tailwind v4 binds `dark:` to `prefers-color-scheme`. This project's dark is the _base_ and `.light` overrides, so a `dark:` class would follow the visitor's OS instead of the theme. The variant is also redefined to match nothing, so these are inert — but they must still go |
| `bg-muted`, `bg-muted/50`   | `bg-surface-elevated`           | shadcn means a _surface_ by `muted`; this project means the _text_ grey. `--color-muted` is deliberately absent from the bridge for exactly this reason                                                                                                                           |
| `var(--secondary)`          | `var(--color-surface-elevated)` | Bare custom properties are not defined here. Our tokens are `--color-*` via `@theme`, so each of these resolves to nothing                                                                                                                                                        |
| `var(--foreground)`         | `var(--color-body)`             | as above                                                                                                                                                                                                                                                                          |
| `var(--popover)`            | `var(--color-surface)`          | as above                                                                                                                                                                                                                                                                          |
| `var(--popover-foreground)` | `var(--color-body)`             | as above                                                                                                                                                                                                                                                                          |
| `var(--border)`             | `var(--color-hairline)`         | as above                                                                                                                                                                                                                                                                          |
| `var(--radius)`             | `var(--radius-lg)`              | this project defines `--radius-xs…xl`, never a bare `--radius`                                                                                                                                                                                                                    |

`var(--radius-md)` and friends are defined and need no rewrite.

Density pass on controls: `h-8`/`h-9` → `h-10` (40px), `rounded-lg` → `rounded-md` (6px),
`border-input` → `border-hairline`.

Limit any bulk rewrite to double-quoted string literals. A whitespace-based regular expression
applied to the whole file can damage code around the class strings; that previously required
regenerating the components.

- `text-muted-foreground` needs no rewrite: the bridge aliases it to this project's `--color-muted`.
- Match the prefix when overriding a conditional class. For example, `sheet` uses `data-[side=right]:w-3/4`. A plain `w-full` in `className` does not override it: the conditional rule is more specific, and `tailwind-merge` retains both. Use `data-[side=right]:w-full`, then check the displayed width. The class list alone cannot prove the override worked. (F03)

---

## Zustand

Check first: Context7 `/pmndrs/zustand` — version 5.0.15.

Zustand stores the browser's current quote values and lets components subscribe to the values they need.
It does not own account balances or other database state.

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

Rules:

- Always pass a selector to `useQuoteStore()` in a component. A selector chooses the part of the store that component watches. Without one, each of the several updates per second re-renders the whole terminal.
- Wrap selectors that return a new object or array in `useShallow`. It compares the selected values rather than the newly created container. Zustand v5 requires this to avoid repeated or infinite rendering here.
- The store holds current quote values only. Orders, holdings, funds and positions are server state and never enter Zustand.
- `ltp` (last traded price) may include browser interpolation; `anchor` always remains the last server price. The order ticket, confirmation, stock-detail header and every monetary total read `anchor`. Only the watchlist reads the moving `ltp` for visual updates. Dashboard summary tiles are monetary totals and therefore use `anchor`; F21 resolved the earlier architecture contradiction in favour of that invariant.
- Compute `source` while rendering with `deriveSource(provider, providerTs, new Date())`; do not store it. Quote freshness changes as time passes, even when the store has not received another update.
- Run the interpolation loop in one `requestAnimationFrame` driver, mounted once in the terminal layout. Do not create a loop for each row.
- Read outside React with `useQuoteStore.getState()`; never subscribe from a non-component module.

---

## Quote providers

Check first: these public endpoints are undocumented. Before writing a parser, inspect a live response with `curl`; repeat that check if parsing fails. The external-provider examples below are retained reference only. The shipped chain uses the simulator alone (6.00.05).

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

Rules:

- Request one symbol at a time. The batched `v7/finance/quote` and `v7/finance/spark` endpoints returned `429` and require Yahoo's session verification (a "crumb"); do not use them.
- Yahoo limits requests by IP address: a burst of 8 sequential requests produced seven `429`s. If this provider is ever enabled, stagger requests, cap each tick at `MAX_SYMBOLS_PER_TICK`, and open the circuit breaker for 5 minutes after the first `429`. The breaker temporarily stops requests to a failing provider.
- Send a realistic browser `User-Agent`; requests without one are refused more often.
- Use `instruments.yahoo_symbol` to map NSE symbols to Yahoo symbols for both quotes and candles. Do not append `.NS` in code; some symbols use a different pattern.

### Yahoo Finance — historical candles

The same `v8/finance/chart` endpoint returns OHLC (open, high, low, close) price series when given `interval` and `range`. One request
per symbol per interval, subject to the same rate limiter and circuit breaker as quotes.

| UI range | `interval` | `range` | Stored as    |
| -------- | ---------- | ------- | ------------ |
| 1D       | `5m`       | `1d`    | `FIVE_MIN`   |
| 1W       | `30m`      | `5d`    | `THIRTY_MIN` |
| 1M       | `1d`       | `1y`    | `ONE_DAY`    |
| 1Y       | `1d`       | `1y`    | `ONE_DAY`    |

1M and 1Y are served from one stored daily series — fetch `range=1y` once and window it, rather than
issuing two requests for overlapping data.

Rules:

- TODO: verify the candle response with a live request before implementing a parser. The expected shape is `chart.result[0].timestamp[]` with parallel `open`, `high`, `low`, `close`, `volume` arrays in `chart.result[0].indicators.quote[0]`. Three verification attempts received HTTP 429, so this shape remains unverified. Write the Zod schema from an observed response rather than this table.
- Candle arrays use matching indexes for each timestamp, but may contain `null` during gaps or trading halts. Drop any index with a null `close`; do not fill it with the previous value and invent a candle.
- Times are unix seconds. Lightweight Charts wants seconds for intraday and `'YYYY-MM-DD'` strings for daily; convert at the boundary, per the Lightweight Charts rules below.
- If a candle request fails or is rate-limited, show cached rows and their true age. Keep stale data visible instead of an empty chart. Do not invent candles to patch gaps in a real series; the simulator supplies a whole series or none.
- NSE's own API (`nseindia.com/api/equity-stockIndices`) is behind an Akamai bot wall and returned `403` even with cookie priming. Do not build against it.

### Twelve Data — optional secondary

Live verification on 2026-08-21 with a free-tier key found that the free plan provides no NSE symbols:

```
GET https://api.twelvedata.com/quote?symbol=AAPL&apikey=…
  → 200  {"symbol":"AAPL","exchange":"NASDAQ","currency":"USD","close":"308.205", …}

GET https://api.twelvedata.com/quote?symbol=RELIANCE&exchange=NSE&apikey=…
  → 404  {"code":404,"message":"This symbol is available starting with the Grow or Venture plan…"}

GET https://api.twelvedata.com/quote?symbol=RELIANCE&apikey=…      → same 404
GET https://api.twelvedata.com/quote?symbol=RELIANCE.NS&apikey=…   → 404, invalid symbol format
```

The successful US request confirmed that the key and endpoint worked. Access to NSE symbols depends on the paid plan, not the spelling of the symbol. Since this project trades only NSE instruments, the free tier serves none of them.

- Rate limits, confirmed from the account and from response headers: 8 requests per minute, 800 API credits per day. `/quote` costs 1 credit per symbol; responses carry `api-credits-used`, `api-credits-left` and `api-credits-request`. Even with NSE access, 800/day cannot sustain a one-minute tick across a ~375-minute session — that is ~2 requests per minute sustained, for ~200 symbols.
- The scope decision in 6.00.05 makes the simulator the entire quote chain. Twelve Data's free tier cannot serve NSE and Yahoo is out of scope. No external provider is connected; every quote displays `SIMULATED`. See the stack in `architecture.md` and scope in `project-overview.md`. External-provider material in this file remains reference for possible future work.
- The provider must report `isAvailable() === false` when `TWELVE_DATA_API_KEY` is unset, so the chain skips it silently. On the free plan it would also have to report false with a key set, since the key entitles nothing this project can use.

### Simulator — final fallback, always available

- The random walk starts from the last `quotes.ltp`, or `instruments.prev_close` if no quote exists. Its allowed range is separate: clamp it to ±5% of `quotes.prev_close`, using the same seed only on a cold start. Do not use the walk's changing starting price as the centre of that range.
- The range resets per trading session. `roll_previous_close()` updates `quotes.prev_close` at the first in-session tick, so the range uses the previous session's close. Using the fixed `instruments.prev_close` forever traps prices within 5% of the original seed. Using the latest price instead lets the range move every tick and removes the overall bound.
- If a symbol has no previous close, `isAvailable` reports false. Do not generate an unbounded price walk.
- Always write `provider = 'SIMULATOR'` and null `provider_ts`. `deriveSource()` displays that provenance (where the price came from) as `SIMULATED`. Never label it as another source.

---

## Zod

Check first: Context7 `/colinhacks/zod` — version 4.4.3.

A Zod schema defines the fields and valid values expected from a form or external response.
Validation checks the actual input against that definition before the app uses it.

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

Rules:

- Use `safeParse` in Server Actions and return the standard error shape. `parse` throws on invalid input; in production the user would receive an unreadable error identifier instead of a useful validation message.
- Form number fields need `z.coerce.number()`; HTML inputs hand over strings.
- Cross-field rules (limit price required for limit orders) belong in `.refine()` on the schema, not in the component.
- Validate every upstream API response with a schema. If a provider changes its response format, parsing must fail and the chain must try its next provider rather than write invalid data into `quotes`.

---

## react-hook-form + @hookform/resolvers

Check first: Context7 `/react-hook-form/resolvers` — `react-hook-form` 7.85.0, `@hookform/resolvers` 5.9.1.

`react-hook-form` tracks form fields, errors and submission state. The resolver connects it to
the Zod schema so both browser and server can use the same validation rules.

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

Rules:

- `@hookform/resolvers` v5 detects Zod 4 schemas automatically — keep using `zodResolver` from `@hookform/resolvers/zod`. (`standardSchemaResolver` from `@hookform/resolvers/standard-schema` also works; do not mix both in one codebase.)
- Register numeric inputs with `{ valueAsNumber: true }` or let `z.coerce.number()` handle it — never both, or the field becomes `NaN`.
- Browser validation helps the user fill out the form. The Server Action must validate again with the same schema, and the database must check margin. A valid form does not grant permission to trade.
- Disable the submit button while `isSubmitting`. Submitting twice would create two paper-trading orders.

---

## Recharts

Check first: Context7 `/recharts/recharts` — version 3.10.1.

Recharts renders summary charts from data supplied by the page. The holdings donut shows each
holding's share of the portfolio; it does not calculate the portfolio totals.

### Top-10 holdings donut

The example shows the chart's structure. Its `props.index` access is abbreviated: the type allows
`undefined`, so the implementation must supply a default before indexing, as the rules below require.

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

Rules:

- Use the `shape` prop with a `PieSectorShapeProps` component for per-slice colour. `<Cell>` is the legacy approach in Recharts 3 and is being replaced. `props.index` is optional on that type — default it before indexing the ramp.
- Do not write `<Tooltip formatter={(value: number) => …}>`. Recharts 3 passes `ValueType | undefined`; check the value's type inside the callback before formatting it. The earlier annotation failed typechecking. (F21)
- `ResponsiveContainer` needs a parent with a definite height; give the wrapper an explicit `h-[280px]`, or the chart collapses to zero.
- Every Recharts component is client-side — the chart file carries `'use client'`, and the page passes it plain serialisable data.
- Compute the top ten and the "Others" bucket on the server; the chart component never aggregates.
- Colours come from the `--color-chart-*` tokens, not literals, so the donut re-themes with the app.
- Use the categorical palette, which assigns a separate colour to each holding, rather than `--color-up` or `--color-down`. Those two mean "price rose" and "price fell". Only a chart showing gains and losses, such as the P&L breakdown bar, may use them.
- This colour ramp extends `DESIGN.md`, which has no palette for categories. Measurement before the dashboard shipped found that the original ramp failed, so F21 replaced it. Keep these findings in mind:
  - `#3b82f6` and `#8b5cf6` measured only 0.8 apart in a deuteranopia simulation (a form of red-green colour blindness), making them indistinguishable. The original ramp had three colours in that blue/violet family. The replacement's closest pair measures 23.9.
  - Hue alone does not separate ten categories for someone with deuteranopia: the useful colour difference is roughly blue↔yellow. The ramp also varies lightness, using two blues and two magentas at different brightness levels rather than relying on ten distinct hues.
- Measure the donut against `--color-surface`, the card behind it, rather than `--color-canvas`. WCAG 1.4.11 requires 3:1 for graphics needed to understand content. Here a table also lists every holding, value and share, so the colours carry no information that the table lacks. The project requires each arc to remain visible on its card in both themes, with a ~1.7:1 floor. Requiring 3:1 against both white and near-black forced an earlier palette into a narrow brightness range and produced five almost identical oranges.
- Keep all greens and reds out of this category palette, not just `--color-up` and `--color-down`. On a trading screen those colours imply a gain or loss even when their hex values differ.

---

## Lightweight Charts

Check first: Context7 `/websites/tradingview_github_io_lightweight-charts_5_0` — version 5.2.1.

Lightweight Charts draws the stock price chart in a canvas, a browser drawing surface. Each
candlestick summarizes the opening, highest, lowest and closing prices for one interval.

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

Rules:

- v5 uses `chart.addSeries(CandlestickSeries, options)`. The v4 helpers (`chart.addCandlestickSeries(...)`) no longer exist — do not copy v4 examples.
- Always `chart.remove()` in the effect cleanup. The chart is a canvas outside React's tree and leaks on every navigation otherwise.
- Set `autoSize: true` rather than wiring a manual `ResizeObserver`; the library handles it.
- The container needs an explicit height class — the chart fills its parent and renders nothing in a zero-height box.
- `time` is unix seconds for intraday and `'YYYY-MM-DD'` strings for daily. Mixing the two in one series silently drops points.
- Shift both time formats into IST just before rendering. The library has no timezone support and treats values as UTC; its documented solution is to shift the data. Without that shift, an NSE session displayed 03:45–10:00 even in an `Asia/Calcutta` browser. Shift only the values used for chart labels; retain true UTC timestamps in `candles.ts`. (F33)
- Theme colours are passed in as resolved values from a `'use client'` wrapper that reads `next-themes` and calls `getComputedStyle(document.documentElement).getPropertyValue('--color-up')` — the chart draws to canvas and cannot resolve CSS variables itself.
- Re-create or re-apply options when the theme toggles; a chart built under dark tokens keeps them after a switch to light otherwise.
- Use `--color-up` and `--color-down` for candles, where colour directly represents the price direction. These are the fixed fill tokens, not the theme-aware price-text tokens.

---
