> **One phase of `context/build-plan.md`.** That index carries the Core Principle and the phase list.
> **Read only the phase you are building.** A finished phase is history — its still-binding decisions
> live in `constraints.md`, its narrative in `build-journal.md`, and re-reading it here costs tokens for nothing.

## Phase 1 — Foundation & Public Site

### 01 Project scaffold and tooling



Create the Next.js application and every piece of tooling the rest of the build assumes.
**No Supabase login, link, or migration happens here** — provisioning moves to Phase 2, where
feature 10 already calls for it. This feature is done when every command in `CLAUDE.md` → Commands
that does not need a database exits zero.

**Logic:**

- `pnpm create next-app` with TypeScript, App Router, `src/` directory, and the `@/*` path alias — scaffolded into a temp directory and copied in, because `create-next-app` refuses a folder containing `context/`, `CLAUDE.md` or `AGENTS.md`, and its template would overwrite `README.md`. Git init disabled; the repo already exists.
- Every dependency **pinned exactly**, no caret ranges, matching the version table in `architecture.md`.
- Tailwind CSS v4 via `@tailwindcss/postcss`; `globals.css` with `@import "tailwindcss"`; no `tailwind.config.js` anywhere.
- ESLint 10 flat config (`eslint.config.mjs`), Prettier with `prettier-plugin-tailwindcss` pointed at `globals.css` via the v4 stylesheet option, and the strict `tsconfig.json` flags from `code-standards.md` — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- Vitest configured for `src/**/*.test.ts`: node environment, no jsdom and no Testing Library (neither is an approved dependency, and tier 1 covers pure logic only), with the `@/` alias resolved explicitly.
- Scripts limited to the ones this feature can make real — `dev`, `build`, `start`, `lint`, `typecheck`, `test`. The database and race scripts land in feature 09 alongside the harness they invoke, rather than shipping as broken stubs.
- Folder skeleton exactly as `architecture.md` describes, with `.gitkeep` where empty, including `supabase/` even though nothing connects to it yet.
- `.env.example` listing every variable in `code-standards.md` → Environment Variables, with dummy values; `.env*.local` in `.gitignore`.
- **Environment validation is split in two.** `src/lib/env.ts` validates the three `NEXT_PUBLIC_*` variables and is safe to import anywhere; `src/lib/env.server.ts` carries `import 'server-only'` and validates `SUPABASE_SERVICE_ROLE_KEY` plus the optional `TWELVE_DATA_API_KEY` and `TEST_DATABASE_URL`. A client-side import of the secrets becomes a build error rather than a runtime throw — the same guard `architecture.md` already mandates for `admin.ts`. `code-standards.md` → Environment Variables is updated in the same commit, since it names a single `env.ts`.
- `src/instrumentation.ts` exporting `register()`, calling both validators inside a `NEXT_RUNTIME === 'nodejs'` guard. Next.js runs this once per server instance before it serves a request, and deliberately skips it during `next build` — so a bad env breaks `dev` and `start` by name while `build` stays green without secrets present.
- The `supabase` CLI as a dev dependency so `pnpm supabase` resolves, but never logged in or linked.

**Verify:**

- `pnpm dev` serves the default page at `localhost:3000` — `curl -sI localhost:3000` returns 200 and the dev server output carries no warnings.
- `pnpm build` exits zero.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` all exit zero, and `test` runs at least one real assertion rather than passing on `passWithNoTests`.
- Deleting a required variable from `.env.local` makes startup fail with a named error, not a runtime `undefined`: remove `NEXT_PUBLIC_SUPABASE_URL`, run `pnpm dev`, and read that the error names that variable.
- **The service-role secret cannot reach the browser:** temporarily import `env.server.ts` from a `'use client'` file and confirm `pnpm build` *fails* with the `server-only` error, then revert. A guard never observed failing is not a guard.
- `ls tailwind.config.*` returns nothing — configuration is CSS, per `library-docs.md` → Tailwind CSS v4.
- `grep -E '"\^' package.json` returns nothing; every version is exactly pinned.
- `find src supabase tests -type d | sort` matches the tree in `architecture.md` → Folder Structure.
- `git status --porcelain` shows no modification to `CLAUDE.md`, `AGENTS.md`, `LICENSE`, `README.md` or `context/`.
- Creating `.env.local` and `.env.test.local` leaves `git status --porcelain` listing neither.

### 02 Design system and theme tokens



Establish the visual language before any page is built, so nothing needs restyling later.
shadcn's token vocabulary is **bridged onto** this project's, never allowed to replace it.

**UI:**

- The full `@theme` token set from `library-docs.md` → Tailwind: brand, trading semantics, surfaces, text, chart ramp, type scale, radius.
- Dark values on `:root` with `.light` overriding them, plus `@custom-variant light`. There is no `dark:` variant in this project.
- A `@theme inline` **bridge block** mapping the token names shadcn's components expect onto this project's palette — `--color-background` → `var(--color-canvas)`, `--color-primary` → `var(--color-brand)`, `--color-border` → `var(--color-hairline)`, and so on. Bridge tokens exist so `shadcn add` keeps working; **project code never uses them** and keeps using `bg-canvas`, `text-muted`, `border-hairline`.
- **`--color-muted` stays this project's text grey.** shadcn uses that same name for a *surface* and puts the text colour in `--color-muted-foreground` — the same name with the opposite role, and the one genuine collision in the set. `--color-muted-foreground` is defined to the same value, so `text-muted` and `text-muted-foreground` both resolve correctly and only `bg-muted` is left wrong; that is hand-fixed to `bg-surface-elevated` on add. The full mapping is recorded in `library-docs.md` → shadcn/ui so every future `shadcn add` is mechanical.
- `next-themes` provider in the root layout, `attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}` so the OS cannot override the intended default, `disableTransitionOnChange`, and `suppressHydrationWarning` on `<html>`. Theme persists to `localStorage` only — `profiles.theme` is feature 35's job.
- Fonts wired through `next/font`: Inter as `--font-inter`, IBM Plex Sans as `--font-plex`, with `tabular-nums` on the numeric class and display line-heights reduced ~3% per `DESIGN.md`'s substitution note.
- shadcn/ui initialised and the base primitives added — `button dialog dropdown-menu tabs input select command table skeleton sonner` — restyled to the system's density: 14px body, 6px radius, 1px hairlines, 40px controls. Styling changes freely; **component APIs do not**.
- **Every `dark:` utility is stripped from added components, not left inert.** Tailwind v4 ships a built-in `dark:` variant bound to `prefers-color-scheme`, so a leftover `dark:bg-input/30` responds to the visitor's OS rather than this project's theme class. That is a live bug, not dead code.
- A `/dev/styleguide` page rendering every token, button variant, and table density in both themes, plus a right-aligned numeric column proving tabular alignment. It calls `notFound()` in production: it sits outside both route groups, so `proxy.ts` will never guard it.

**Logic:**

- `src/lib/utils.ts` with `cn()` and the `formatCurrency` / `formatSignedCurrency` / `formatPercent` / `formatQuantity` helpers using `en-IN` locale and the ₹ symbol. `Intl.NumberFormat` produces Indian digit grouping natively — verified — so no hand-rolled grouping.
- `formatCurrency` always renders the symbol and 2dp; `formatSignedCurrency` renders an explicit `+` or `−` for figures whose sign carries meaning, giving feature 38's "sign must be visible, not only colour" requirement a dedicated home.
- `src/components/theme-provider.tsx` — app-level chrome, so not in `ui/`, `marketing/`, `terminal/` or `charts/`.

**Verify:**

- Brand and trading colours are byte-identical in both themes, asserted mechanically rather than by eye: a test parses `globals.css` and confirms the `.light` block redefines **none** of `--color-brand`, `--color-brand-active`, `--color-on-brand`, `--color-up`, `--color-down`, and **does** redefine canvas, surface and ink.
- `formatCurrency(1234567.5)` returns `₹12,34,567.50` and `formatCurrency(100000)` returns `₹1,00,000.00`, asserted in a test.
- `formatSignedCurrency(-1234.5)` leads with `−` and `formatSignedCurrency(1234.5)` with `+`, asserted in a test.
- Grepping `src/` for `#` hex literals inside `className` returns nothing.
- `grep -rn 'dark:' src` returns nothing — the guard against the `prefers-color-scheme` bug above.
- `grep -rn 'bg-background\|text-foreground\|bg-primary\|text-muted-foreground' src --include=*.tsx` returns hits only under `src/components/ui/`; no bridge name has leaked into project code.
- `grep -rn 'bg-muted' src/components/ui` returns nothing.
- `/dev/styleguide` renders every token swatch in both themes; toggling changes all of them with none left behind, and a reload keeps the choice with no flash of the wrong theme.
- Numbers render in `--font-plex` with `tabular-nums` and align in a right-aligned column of varying-width prices; body copy renders in `--font-inter`.
- Built and served with `NODE_ENV=production`, `/dev/styleguide` returns HTTP 404.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all exit zero.

### 03 Public layout shell



The chrome every marketing page sits inside: disclaimer banner, top navigation, mobile sheet nav,
and footer, wrapped in the `(marketing)` route group layout. Every link target the shell points at
is stubbed here so nothing 404s, and each stub is replaced wholesale by the feature that owns it.

**UI:**

- `Sheet` added via `shadcn add sheet` and put through the bridge pass in `library-docs.md` → shadcn/ui — strip every `dark:`, `bg-muted` → `bg-surface-elevated`, bare `var(--foreground)` / `var(--border)` / `var(--radius)` rewritten to the `--color-*` / `--radius-lg` equivalents, controls to `h-10` and `rounded-md`. Sheet is Radix Dialog, already installed; no new dependency.
- `SiteHeader` — 64px tall on `bg-canvas`: text wordmark in `--color-brand` (no logo asset; the branding deviation in `library-docs.md` forbids reproducing anyone's mark), the four nav links (Home, About, Pricing, Support) hidden below `md`, and a right-side cluster carrying the theme toggle and a "Sign in with Google" CTA. The CTA is `bg-brand text-on-brand` and `rounded-full` — DESIGN.md reserves the pill radius for the top-of-page sign-up action and nothing else.
- `MobileNav` — client component, `Sheet`-backed, hamburger trigger visible only below `md`. Full-screen sheet with the same four links and the sign-in CTA anchored at the bottom, per DESIGN.md → Collapsing Strategy.
- `DisclaimerBanner` — the simulator disclaimer strip, **dismissible and remembered**. A blocking inline `<script>` in the root layout reads the `localStorage` key and stamps `data-disclaimer="dismissed"` on `<html>` before first paint; a `globals.css` rule hides the strip off that attribute. Same technique `next-themes` already runs here, so a returning visitor never sees it flash. Only the close button is a client island — the layout stays a Server Component.
- `SiteFooter` — `bg-surface` with a top hairline, columns 1-up on mobile and multi-column at `md`, project links carrying `rel="noreferrer"`, and the "not affiliated with Zerodha" disclaimer linking to `/legal`. **Not** DESIGN.md's literal always-light `#fafafa` footer: `--color-surface` already *is* `#fafafa` in the light theme, so the source value is reached through the token instead of hardcoded, and in dark it reads as the elevation step the flat-colour-block philosophy calls for. An always-light token pair would exist only to break the theme contract.
- `ThemeToggle` promoted out of `app/dev/styleguide/` to `src/components/ThemeToggle.tsx` — app-level chrome, so beside `theme-provider.tsx`, not in `ui/`. DESIGN.md's `top-nav-dark` lists the toggle in the right-side cluster, and the Phase 1 checkpoint walks every public route in both themes.

**Logic:**

- `(marketing)` route group layout composing banner → header → children → footer, content capped at 1280px and centred. **No `cookies()` call anywhere inside it**, so pages stay statically renderable.
- `src/app/page.tsx` moves to `src/app/(marketing)/page.tsx` — leaving both would make two files claim `/`.
- Stub pages so no link in the shell 404s: `(marketing)/about`, `(marketing)/pricing`, `(marketing)/support`, `(marketing)/legal`, and `auth/login` (outside the group, per `architecture.md` → Folder Structure). Each is a heading plus one line of honest copy, replaced wholesale by F05–F08 and F12.
- No `loading.tsx`: `code-standards.md` requires one only for segments that fetch data, and none of these do.

**Verify:**

- Every link target resolves: `pnpm build && pnpm start`, then `for p in / /about /pricing /support /legal /auth/login; do curl -s -o /dev/null -w "$p %{http_code}\n" localhost:3000$p; done` returns seven `200`s.
- The marketing layout is static and touches no Supabase: `pnpm build` marks `/`, `/about`, `/pricing`, `/support` and `/legal` as `○` (static), not `ƒ`; and `grep -rn "cookies()\|createClient\|supabase" "src/app/(marketing)" src/components/marketing` returns nothing.
- The banner survives dismissal with no flash: close it, reload, and confirm it never paints — throttle CPU 6× and watch that no strip appears at any point during load. Clear the key in DevTools, reload, confirm it returns.
- Header and footer are usable at 375px: the desktop links are hidden, the hamburger opens the sheet, all four links and the sign-in CTA are reachable, Escape closes it, focus is trapped while open, and `document.documentElement.scrollWidth === 375` — no horizontal overflow.
- Both themes render: toggling from the header on `/` flips banner, header, sheet and footer, with the sign-in CTA's yellow and its black label byte-identical across both.
- No token rule broken by the new files: `grep -rn 'dark:' src` returns nothing; `grep -rn 'bg-background\|text-foreground\|bg-primary\|text-muted-foreground' src --include=*.tsx` hits only under `src/components/ui/`; `grep -rn 'bg-muted' src/components/ui` returns nothing; no `#` hex literal inside any `className`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all exit zero.

### 04 Home page



The public landing page. Every band is a static Server Component inside the F03 shell.

**UI:**

- Hero: headline, subheadline, primary sign-in CTA. **Typographic — no mock terminal UI.** The build plan specifies type and a CTA, and F40 can drop in a screenshot of the finished terminal, which beats a hand-built fake and costs less total work than building one now and replacing it.
- `Section` band wrapper enforcing DESIGN.md's uniform `--spacing-section` (80px) rhythm and the centred 1280px cap. F05–F08 reuse it.
- "What you can do" feature grid, four tiles: **real NSE prices, honestly delayed**; real order types; simulated funds; portfolio analytics.
- CNC vs MIS in plain language: settlement versus same-day square-off at 15:20 IST, shorting allowed in MIS and never in CNC, and `trading-contract.md` §1's point that **neither product offers leverage** — the distinction is settlement, not margin multiples. **No charge rate is quoted here**; §3 still carries a TODO that every rate needs a dated source before F06, and a second copy on this page would be a second thing to keep in sync. Charges belong to `/pricing`.
- Data-honesty section documenting all four provenance states — `LIVE`, `DELAYED`, `SIMULATED`, `STALE` — and stating plainly that **this build never shows `LIVE`**, because none of the three providers streams ticks. Chips are presentational and marketing-only: the real badge is F20's, and `Provenance` / `deriveSource()` do not exist yet. Toned with brand / info / muted, **never** `--color-up` or `--color-down` — DESIGN.md forbids repurposing the trading colours for any non-price meaning, and a provenance state is not a price direction.
- Closing CTA.

**Logic:**

- Both CTAs reuse `SIGN_IN_HREF` from `components/marketing/nav-links.ts` rather than repeating the literal path.
- `OPENING_BALANCE` moves into `src/lib/constants.ts` and the page renders it through `formatCurrency`. `code-standards.md` names that constant and forbids inlining it, so the copy cannot carry the figure literally even though the engine that consumes it is four phases away.
- Page-level `metadata` export — the first in Phase 1.
- `lighthouse` added as an exactly-pinned dev dependency with a `pnpm audit:a11y` script, recorded in `code-standards.md` → Dependencies and `CLAUDE.md` → Commands in the same commit. F38 needs the tooling regardless; landing it here means every Phase 1 page is audited as it ships.
- No `loading.tsx` and no `error.tsx`: `code-standards.md` requires the first only for segments that fetch data and the second only for terminal segments. F08 owns the error boundary.
- **This feature corrects this section's own earlier wording.** It previously said "live NSE prices", which `architecture.md`'s invariant makes unreachable — `PROVIDER_IS_REALTIME` is `false` for all three providers, so a quote can only badge `DELAYED`, `SIMULATED` or `STALE`. Architecture invariants outrank a build-plan feature, and `project-overview.md`'s success criteria already require the badge not to overclaim.

**Verify:**

- Every CTA routes to `/auth/login`: in the served HTML for `/`, every `<a>` whose text contains "Sign in" has `href="/auth/login"`, and grepping the marketing components and pages shows the literal path only in `nav-links.ts`.
- The page is static with no client-side data fetching: `pnpm build` marks `/` as `○ (Static)`; grepping the new components for `use client`, `fetch(`, `useEffect` and `useState` returns nothing; and loading `/` records no XHR or fetch entry in `performance.getEntriesByType('resource')` beyond fonts, CSS and JS chunks.
- `pnpm audit:a11y` against the served production build scores **above 90** on accessibility, read out of the JSON — record the actual number in the journal, not "it passed".
- The page never claims prices are live: `grep -rin "live" src/components/marketing "src/app/(marketing)"` returns only the honesty section's explanation that `LIVE` is a state this build never enters.
- The opening balance is not hardcoded: change `OPENING_BALANCE` in `constants.ts`, confirm the figure rendered on `/` changes with it, revert.
- The CNC/MIS copy matches `trading-contract.md` read side by side — no leverage claim, CNC shorting stated as impossible, square-off stated as 15:20 IST, and no charge rate anywhere on the page.
- Both themes and 375px hold: toggling flips every band with none left behind, and `document.documentElement.scrollWidth === 375` at that width.
- The F02/F03 guards stay green: `dark:` in `.tsx`, bridge token names outside `ui/`, and hex literals inside `className` all return zero hits; `--color-up` and `--color-down` appear nowhere in the new components.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm format:check` all exit zero.

### 05 About page



Why the project exists, how it was built, and an honest inventory of what is real and what is faked.

**UI:**

- What the project is and why it exists, drawn from `project-overview.md` → The Problem It Solves.
- **Architecture summary in prose plus an ordered walk of the two paths that matter** — how a quote reaches the screen, and what happens when an order is placed — calling out the invariants worth seeing: money math in Postgres, fills only inside `execute_order`, RLS as the security boundary. No diagram: prose is responsive and accessible for free, it is the part a technical reader actually reads, and a drawn diagram can wait for F40 when the architecture has stopped moving.
- **Stack table** rendered from `src/lib/stack.ts` as a plain semantic `<table>`, **not** the `components/ui/table.tsx` primitive: that primitive is a Client Component, and importing it would put a hydrated client boundary on a static marketing page for row-hover states this table does not want. It sits in an `overflow-x-auto` container carrying `role="region"`, an `aria-label` and `tabIndex={0}` — a scrollable region that keyboard users cannot reach is unusable at 375px, where the table is 672px inside a 341px box. Lighthouse does not audit that; axe does.
- **Rows for packages not yet installed render as "planned"**, neither omitted nor given an invented version. A third of `architecture.md`'s stack lands in Phases 2–5; showing fake versions would be the same overclaim this project keeps refusing, and hiding the rows would misrepresent the design.
- Links to the repository, through a shared `ExternalLink`.
- **Real / Simulated inventory** — real: NSE prices, charge formulas, order mechanics, market hours; simulated: the money, the fills, the counterparty, settlement. This page carries the *inventory*; `/legal` carries the *consequences*, and About links to it. F08 needs to stand alone as a notice, and Home stays scoped to price provenance only, so none of the three duplicates another.

**Logic:**

- `src/lib/stack.ts` — typed entries mirroring `architecture.md` → Stack: layer, package, version, purpose, and an `installed` / `planned` marker. Non-package layers (hosted Postgres, `pg_cron`, Yahoo, Render, pgTAP) carry no version.
- `src/lib/stack.test.ts` — a **bidirectional** drift test against `package.json`: every `installed` row's version must equal the manifest's, and every `planned` row's package must be genuinely absent from it. Upgrading a dependency without touching the page fails the suite; so does installing a planned package without flipping its row. Same pattern as F04's `OPENING_BALANCE` and what F06 requires of `constants.ts`.
- `src/components/marketing/ExternalLink.tsx` — `target="_blank" rel="noreferrer"` plus an icon and an sr-only "opens in a new tab". `SiteFooter`'s two external links are refactored onto it, which reduces this feature's link criterion to a grep for raw `target="_blank"` outside that one file.
- Repository and author URLs come from `nav-links.ts`, which already holds `REPOSITORY_URL`. No second copy.
- Page-level `metadata`, following F04.
- `audit:a11y` takes a path argument so `/about` can be audited without editing the script.
- Content obeys the F04 constraints: running copy uses `text-body`, `--color-muted` only for captions and labels, inline prose links carry a persistent underline.
- No `loading.tsx` and no `error.tsx` — the page fetches nothing and is not a terminal segment.

**Verify:**

- **The stack table cannot go stale, proven by falsification.** `pnpm test` passes; bumping one `installed` row's version in `stack.ts` makes the test fail naming that package; flipping a `planned` row to `installed` fails it too. Revert both — a guard never observed failing is not a guard.
- Stack table content matches `architecture.md`, read side by side: every row in its Stack table appears with the same layer name and the same purpose in substance, and no row on the page is absent from the doc.
- Every external link is safe and announced: `grep -rn 'target="_blank"' src --include='*.tsx'` hits only `ExternalLink.tsx`, and in the served HTML for `/about` every `<a>` with an `http` href carries `rel="noreferrer"`.
- The page is static: `pnpm build` marks `/about` as `○ (Static)`, and grepping the new components for `use client`, `fetch(`, `useEffect` and `useState` returns nothing.
- `pnpm audit:a11y /about` scores above 90 — record the number — with no `link-in-text-block` failure and no contrast failure beyond the known `--color-muted` gap already filed against F38.
- The table scrolls rather than overflowing: at 375px `document.documentElement.scrollWidth === 375` while the table's own container reports `scrollWidth > clientWidth`.
- Both themes flip on `/about` with no band left behind.
- The F02–F04 guards stay green: `dark:` in `.tsx`, bridge names outside `ui/`, hex in `className`, and `--color-up` / `--color-down` in marketing all return zero hits.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm format:check` all exit zero.

### 06 Pricing page



The charge structure the order engine will actually apply — written before the engine so the engine
matches the page. **Rates confirmed against Zerodha's published charge list on 2026-08-21**, which
corrected three things `trading-contract.md` §3 had wrong; see Logic below.

**UI:**

- Plan card: ₹0 account opening, ₹0 delivery brokerage, ₹20 or 0.03% intraday (whichever is lower).
- Full charges table for CNC and MIS: brokerage, STT, exchange transaction, SEBI turnover fee, stamp duty, GST, DP charge.
- **The table shows the DP charge as ₹15.34 per scrip**, with a footnote that it is ₹13.00 plus ₹2.34 GST. The page speaks the number a user recognises from a contract note; `charge_breakdown` keeps GST consolidated. The footnote states the relationship, so neither representation misleads.
- **Worked example as a round trip** — a ₹50,000 CNC buy and a matching ₹50,000 CNC sell, so the figures isolate charges rather than mixing in a price move. A buy alone would leave DP charges and sell-side STT with no worked figure anywhere, and those are the rows people most often get wrong.
- The page labels its figures an **estimate**: `trading-contract.md` §1 permits a clearly-labelled TypeScript estimate and forbids only TypeScript producing a stored value.

**Logic:**

- **Three corrections to `trading-contract.md` §3**, all from the published list: NSE exchange transaction charge **0.00297% → 0.00307%** (stale); the DP charge is **₹15.34 inclusive of GST**, not "₹15.34 + 18% GST", which would have double-charged GST on every CNC sell; and DP is charged **once per sell order** here where Zerodha charges once per scrip per day.
- **The DP frequency divergence is deliberate and documented.** Per-scrip-per-day would make `execute_order` query the user's same-day trades for that symbol inside the locked transaction, and give account reset another thing to reason about. It is named in F08's "simulation simplifications" list rather than hidden.
- **`charge_breakdown` splits DP into `dp_charge` ₹13.00 with its ₹2.34 rolled into `gst`**, so every rupee of GST lives in one key. §3's GST rule becomes `gst = 18% × (brokerage + exchange + SEBI + dp_base)`.
- **GST is computed on unrounded sub-components and rounded once**, resolving an ambiguity §2 left open. Rounding once where the figure becomes money loses the least and keeps §2's "computed at full precision, then rounded" literally true for GST as for every other component. §2 gains a sentence saying so.
- Rates live in `src/lib/constants.ts` as decimal rates per `code-standards.md` (`0.0003`, not `0.03`), each carrying a source URL and the date confirmed.
- **`src/lib/trading/charges.ts` is built here**, not inlined on the page. `architecture.md` already reserves it for pure charge functions; building it now means the page renders from the real estimator, and F22 adds the Postgres equivalent plus the property test proving the two agree.
- **§13's sweep is extended to cover charge terms.** Its grep matches margin and P&L identifiers only, so it structurally cannot detect the drift a §3 *rate* edit causes — the exact kind of edit this feature makes.

**Verify:**

- **The example is computed, not typed:** `pnpm test` asserts buy ₹59.38, sell ₹67.22 and round trip **₹126.60** on ₹1,00,000 of turnover; then changing `EXCHANGE_TXN_RATE` in `constants.ts` and rebuilding moves the rendered total off ₹126.60. Revert.
- **The breakdown always reconciles:** a test asserts the rounded components sum exactly to the total across a sweep of quantities and prices — the property §2 exists to guarantee.
- **The ₹20 intraday cap is exercised at its boundary:** tests at turnover just below, at, and just above ₹66,666.67 confirm brokerage switches from 0.03% to a flat ₹20.
- Every rate carries a dated source in `constants.ts`, and `grep -n "TODO" context/trading-contract.md` no longer returns the rate TODO.
- **The §13 sweep is clean:** both greps run, every hit either agrees with the corrected §3 or was fixed — there is no third category.
- No rate is hardcoded in the page: grepping the marketing components and pages for `0.00307`, `15.34`, `0.0001` and `13.00` returns nothing outside a footnote string.
- `pnpm build` marks `/pricing` `○ (Static)`; `pnpm audit:a11y /pricing` scores above 90 — record the number — with no failure beyond the known `--color-muted` gap already filed against F38.
- At 375px `document.documentElement.scrollWidth === 375`, the charges table scrolls inside its own focusable `role="region"`, and both themes flip every band.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm format:check` all exit zero.

### 07 Support page and contact form



**Split into two slices.** This feature was placed in Phase 1 before anyone noticed the contact form
needs a database layer: `@supabase/ssr`, `src/lib/supabase/server.ts` (F12 owns it),
`src/types/database.ts` (F10 generates it), `react-hook-form`, and F09's harness for its RLS check.
The help content needs none of that, so it ships first. The checkbox in `progress-tracker.md` is
ticked only when **both** slices are done.

---

#### Slice A — help content *(Phase 1, no dependencies)*

**UI:**

- Four category cards — Account, Orders, Funds, Technical — each holding expandable FAQ entries.
- **Disclosure is native `<details>` / `<summary>`.** Zero JavaScript, works before hydration and with JS disabled, and keyboard operation, focus handling and screen-reader semantics come from the browser rather than being hand-written. `/support` stays static like every other public page, and F38 has nothing to audit here. Styling the marker is the only cost. `<summary>` gets an explicit `focus-visible` ring, since browser defaults vary.
- **No contact form in this slice.** Anything the FAQ does not answer routes to the repository's issue tracker through `ExternalLink`. A dead "coming soon" form is a worse experience than no form, and this way Slice B *adds* the form rather than replacing a placeholder.
- Answers are **grounded in the context docs, not invented** — order behaviour from `trading-contract.md`, price provenance from `architecture.md`, the free-hosting sleep from `CLAUDE.md`. Anything already stated on `/pricing` or `/legal` is **linked, not restated**, the same rule that keeps Home, About and Legal from duplicating one another.

**Verify:**

- The page is static and ships no JavaScript for the FAQ: `pnpm build` marks `/support` `○ (Static)`; grepping the Support components for `use client`, `useState` and `useEffect` returns nothing; and every FAQ answer appears in the `curl`-fetched HTML, proving the content exists without hydration.
- **Disclosure works with JavaScript disabled** — click a `<summary>` in a JS-disabled browser and the answer still expands.
- Every `<summary>` is keyboard reachable: Tab to one, confirm `document.activeElement` is the `summary`, Enter toggles `open`, and a visible focus ring is painted.
- `pnpm audit:a11y /support` scores **100** with zero contrast nodes — the bar is 100, not 90, since 1.00.01. Then **load the light theme for real** (never by toggling the class from script) and confirm no text element falls below AA.
- No answer contradicts its source: read side by side against `trading-contract.md` §3/§8/§10 and `architecture.md` → Quote Provenance. No charge rate is quoted anywhere (that is `/pricing`'s job), nothing claims prices are live, and CNC shorting is stated as impossible.
- `grep -rn 'target="_blank"' src --include='*.tsx'` still hits only `ExternalLink.tsx`, and every `http` anchor in the served `/support` carries `rel="noreferrer"`.
- At 375px `document.documentElement.scrollWidth === 375`; the `dark:`, bridge-name, hex-in-`className` and trading-colour guards all return zero.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm format:check` all exit zero.

---

#### Slice B — contact form *(Phase 2, after F09)*

**Unblocked:** F09 landed the tier-2 harness. This slice also lands
`src/lib/supabase/server.ts` and `src/types/database.ts` — not throwaway, F12 extends them.

**UI:**

- Contact form: name, email, category, message. Success and error states, disabled while submitting.
- **React 19 form action + `useActionState`, not react-hook-form.** The form submits and validates without JavaScript, matching the page it sits on where Slice A ships zero JS, and `useActionState` supplies the pending state the spec asks for with no new dependency. `code-standards.md` is corrected in the same change, since it names react-hook-form for this form; F25's order ticket is where react-hook-form actually earns its place — a dialog with live margin calculation.
- A **honeypot** field, hidden from sight and from assistive technology, which the action rejects when filled.

**Logic:**

- `support_messages` migration per `architecture.md`: `id`, `name`, `email`, `category`, `message`, `created_at`. RLS enabled with **anonymous `INSERT` permitted and no `SELECT` policy at all** — write-only from the public web.
- **`CHECK` constraints bounding every text column.** The publishable key ships in the browser bundle, so anyone can write to this table; length bounds mean a single request cannot store megabytes. Enforced in the database rather than only in Zod, because the database is the boundary that cannot be bypassed.
- **Volume abuse is deliberately unmitigated.** Real rate limiting needs another table, another policy and a cleanup job — unspecified scope for a portfolio project's contact form. Recorded here rather than left implicit.
- `submitSupportMessage` Server Action, Zod-validated, returning the standard `ActionResult`. It reads no session: an unauthenticated request runs as `anon`, which is exactly the role RLS must gate.
- `@supabase/ssr` and `@supabase/supabase-js` installed and their `stack.ts` rows flipped from `planned`.

**Verify:**

- A valid submission inserts exactly one row and the UI shows the success state.
- An invalid email shows a field error and inserts nothing — asserted by row count before and after, not by reading the screen.
- **The form works with JavaScript disabled**: submit it in a JS-disabled browser and confirm the row lands and the success state renders.
- A submission with the honeypot filled is rejected and inserts nothing.
- A message longer than the column bound is refused **by the database**, proven by inserting past the limit directly rather than through the form.
- **Signed out, a `select` against `support_messages` returns zero rows** — a tier-2 pgTAP case using `is_empty()` for the policy filter and `throws_ok(..., '42501', ...)` if the grant stops it first; `code-standards.md` requires both failure modes be distinguished.
- **The RLS policy is observed failing before it is trusted**: drop it, watch the test go red, restore it.
- `pnpm test:db` passes; `/support` still builds and the page's static half is unaffected by the form's client island.

### 08 Legal, error, and not-found pages



**UI:**

- `/legal` with the full disclaimer: unaffiliated, no real trading, no financial advice, data provenance.
- A "simulation simplifications" section naming the places this diverges from a real broker: intraday short losses are capped at collateral rather than triggering a margin call, prices are delayed rather than real-time, there is no counterparty order book, fills are all-or-nothing because there is nobody on the other side, and **the DP charge is applied once per sell order where a real broker charges once per scrip per day** (F06, `trading-contract.md` §3).
- **Branded `not-found.tsx`, carrying the full public chrome.** A mistyped URL is an ordinary navigation outcome and the useful thing to offer is the nav. It cannot inherit that chrome from the `(marketing)` layout — an unmatched URL never enters the route group — so the shell is extracted to `components/marketing/PublicShell.tsx` and shared by both.
- **Root `error.tsx` with a retry action, and deliberately no chrome.** An error means something in this subtree already failed, so the less machinery the fallback depends on, the better its odds of rendering; it also keeps the client bundle small rather than dragging the header across the boundary. It renders `error.digest`, never `error.message` — `code-standards.md` forbids raw errors in UI strings, and in production Next.js replaces the message with the digest anyway.
- `global-error.tsx` is **not** added: errors thrown by the root layout itself go uncaught. That is beyond what this feature specifies, and it would mean duplicating the fonts and theme provider.

**Verify:**

- A nonexistent path returns HTTP **404** and renders the branded page: the served HTML contains "This page does not exist" and **not** Next's "This page could not be found", with header, footer and nav links present.
- **Throwing inside a page renders the error boundary rather than a white screen** — proven with a temporary `force-dynamic` page that throws, then deleted. Note the SSR HTML is empty for a Server Component throw; the boundary renders on hydration, so this must be checked in a browser, not with `curl`.
- The boundary leaks nothing: the rendered DOM contains no error message, no stack frame and no filesystem path, and the `error.digest` shown matches the digest in the server log.
- **The 404 cannot be Lighthouse-audited** — Lighthouse returns `ERRORED_DOCUMENT_REQUEST` for any non-200 document and computes no score. Verify it structurally instead: one `h1`, header/main/footer landmarks, every `nav` labelled, and measured contrast in both themes.
- `pnpm audit:a11y /legal` scores above 90 — record the number — with no failure beyond the known muted-token gap.
- At 375px both `/legal` and the 404 report `scrollWidth === 375`, and both themes flip every surface.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm format:check` all exit zero.

### Phase checkpoint

Public site complete and deployable. Run lint, typecheck and tests; walk every public route in both themes at desktop and mobile widths.

---


