# Build Plan

> **Role:** The ordered plan — phases and numbered features to build, in sequence.
> **Read before starting a feature**; build one feature fully before the next.
> **Relates to:** features come from `project-overview.md`; status tracked in `progress-tracker.md`.

## Core Principle

**UI first with mock data, then wire the real logic, and never leave a step unverifiable.**
Every feature ships something you can open in a browser or assert in a test before the next one
starts. Money-moving logic is built bottom-up in the opposite direction — the Postgres function and
its tests come before the UI that calls it — because a wrong balance is invisible in a screenshot.

---


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


## Phase 2 — Data Foundation & Auth

### 09 Test harness

Stand up all three test tiers before the schema they will police exists, so no later feature can be
written without a way to prove it. Tiers and rules are defined in `code-standards.md` → Testing.

**The spike in this feature's original Verify block has been run, and it failed.**
`supabase test db --db-url` connects to the remote database and *then* dies with
`LegacyDockerRunError` — the CLI shells out to `pg_prove` in a container regardless of where the
database lives. The fallback that block pre-authorised is therefore mandatory, not optional. pgTAP
itself installed cleanly on the hosted database (1.3.3), so only the *runner* was ever the problem.

**Logic:**

- **Provisioning is already done** (2026-08-21): one project, `zerodha-rebuild-dev` / `kefggygenlprjzhiocai` / ap-south-1, linked, `.env.local` and `.env.test.local` written and both verified connecting. There is deliberately **no second project**.
- **First migration of the project:** `enable_pgtap` creating the extension in the `extensions` schema. Tracked rather than created ad hoc by the runner — an untracked extension the tests silently depend on is worse than a tracked one, because a fresh database looks fine until the suite runs and the migration history stops describing the database. pgTAP adds functions in a schema nothing else uses and no tables, so the cost to the single production project is close to zero.
- **`scripts/run-pgtap.mts` replaces `supabase test db`.** It reads `.env.test.local`, executes each `supabase/tests/*.sql` through `pg`, and collects the text rows the pgTAP functions return — `plan()` yields `1..n`, `ok()` yields `ok N - desc` or `not ok N - desc`, so those rows **are** the TAP stream and no reporter needs installing. It parses them, names the file and assertion on failure, and exits non-zero.
- **Written in TypeScript with no new runner dependency.** Node 26 strips types natively (verified), so `node scripts/run-pgtap.mts` runs directly; adding `tsx` for one script would be a dependency the stack does not need.
- **The runner must catch a plan mismatch, not only `not ok`.** A file declaring `plan(2)` that runs one assertion has to fail — that is the failure mode a naive grep misses.
- `tests/concurrency/helpers.ts`: client-pair factory, seeded fixtures under the `zr-race-` prefix, and `afterEach` cleanup that runs on failure as well as success.
- **Tier 3 is gated behind `ALLOW_RACE_TESTS` and must exit before opening a connection** when it is unset. It commits into the single production database; that guard is the thing standing between a routine `pnpm test:all` and real rows.
- `vitest.config.race.mts` scoped to `tests/concurrency/**`, because tier 1's config includes only `src/**/*.test.ts`. Scripts: `test:db`, `test:race`, `test:all`.
- **`pnpm db:push:test` is dropped.** One database means one push command, and `pnpm supabase db push` already is it. A second script reaching the same place by a different mechanism, named for a test project that no longer exists, is a trap. Removed from `CLAUDE.md` too.
- **Tier 2 ships a smoke test only.** No schema exists yet, so `01-rls.sql` and friends would assert nothing; they land with F10/F11, which create the tables they police. What this feature must prove is that the runner works — including that it fails correctly.
- `pg` and `@types/pg` added to the approved dependency list, dev-only and never imported by application code.

**Verify:**

- **The runner is observed failing before it is trusted.** Add a deliberate `select ok(false, …)`, run `pnpm test:db`, confirm it exits **non-zero** and names the file and the failing assertion; revert and confirm green. A harness that has only ever passed proves nothing.
- **A plan mismatch fails too**: declare `plan(2)` with one assertion and confirm the runner reports it rather than silently passing.
- Tier 2 genuinely reaches the database: `00-smoke.sql` asserts `has_extension('pgtap')`, which cannot pass without a real connection.
- Tier 2 leaves nothing behind: run `pnpm test:db` twice, confirm identical output and no new rows — the `begin/rollback` wrapper doing its job.
- **The tier-3 guard is observed refusing.** With `ALLOW_RACE_TESTS` unset, `pnpm test:race` exits **without opening a connection**, confirmed by its absence from `pg_stat_activity` rather than by it printing a skip message.
- Tier 3 opens two real backends: `pg_backend_pid()` returns two different values, and both connections close.
- Cleanup survives failure: make a race test throw mid-run and confirm `afterEach` still removed its `zr-race-` rows.
- `pnpm test` does not pick up tiers 2 or 3 — the tier-1 count is unchanged.
- `pnpm supabase db push` applies the migration cleanly and re-running is a no-op; migration history lists exactly one entry.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all exit zero, and `grep -rn "from 'pg'" src/` returns nothing.

### 10 Database schema: identity and market data

The first real schema migration: two enums, eight tables, their RLS policies and grants, one
shared `updated_at` trigger, the `quotes` Realtime publication entry, and the pgTAP suites that
prove the policies hold. No seed data (F14), no bootstrap trigger (F13), and no write path for
`symbol_demand` (F18) — this feature builds the shape, not the contents.

**Logic:**

- The project is already created and linked (2026-08-21, `zerodha-rebuild-dev`); this feature adds the migration, not the provisioning.
- **Only the two enums this feature's tables reference** — `quote_provider` and `candle_interval`. The other five belong to F11's tables and are created there, so each migration stays reviewable against the tables it creates.
- `public.touch_updated_at()`, a `before update` trigger function setting `new.updated_at = now()`, attached to `quotes` and reused by F11's `funds`, `holdings` and `positions`. **Postgres owns the column, not the writer**: a writer that forgets it stops Realtime firing silently, and that bug presents as "prices froze" while pointing nowhere near the upsert.
- Tables in dependency order — `instruments` first, then `quotes`, `candles`, `candle_sync`, `symbol_demand` and `market_holidays`; `profiles` before `watchlist_items`.
- `quotes` carries `provider` and `provider_ts` and **no `source` column** — freshness is derived at read time, per `architecture.md` → Quote Provenance.
- Constraints: `profiles.client_id` unique, `profiles.theme` `check (theme in ('light','dark'))`, `instruments.is_active` default true.
- **`profiles.theme` defaults to `'dark'`, not `'light'`.** `architecture.md` said light while `project-overview.md` specifies a dark-default terminal and `theme-provider.tsx` ships `defaultTheme="dark"`; the scope document wins and `architecture.md` is corrected in the same commit.
- Indexes: `watchlist_items_symbol_idx` on the non-leading foreign key — that table's primary key leads with `user_id`, so symbol lookups are not covered by it. Search indexes on `instruments` wait for F18, which writes the query they would serve.
- **RLS on all eight, with grants revoked and granted back** per the F07B posture. User-owned tables (`profiles`, `watchlist_items`) are scoped to the owner; the six reference tables get a `select` policy for `authenticated` and **no write policy for any role**.
- **Policies read `(select auth.uid())`, never bare `auth.uid()`** — the bare call is re-evaluated per row, the subselect once per query (Supabase's Postgres best-practices guide). Semantically identical, so `architecture.md`'s invariant still reads true.
- **No `anon` grant anywhere.** Every surface showing an instrument or a price is under `(terminal)`, and F04 already decided the marketing site quotes no prices; the publishable key sits in the browser bundle, so an `anon` grant would publish the whole instrument universe.
- `profiles` gets no `insert` grant — F13's bootstrap trigger runs as definer — and no `delete`, which cascades from `auth.users`.
- `quotes` added to the `supabase_realtime` publication, keeping **default replica identity**: `payload.new` is fully populated for `postgres_changes`, and `replica identity full` would roughly double WAL for an `old_record` nothing reads.
- `src/types/database.ts` regenerated.
- Two pgTAP suites keeping the established `01-rls-<area>.sql` convention: `01-rls-identity.sql` and `01-rls-market-data.sql`.

**Verify:**

- `pnpm supabase db push` applies cleanly, a second push reports up to date, and `pnpm supabase migration list` shows exactly three entries.
- Types regenerate and compile: `pnpm typecheck` exits 0 and `grep -n ': any' src/types/database.ts` returns nothing.
- The `quotes` table has no `source` column — pgTAP `throws_ok($$select source from public.quotes$$, '42703')`.
- Signed in as user A, `is_empty()` on both `profiles` and `watchlist_items` targeting user B's ids.
- As `authenticated`, insert, update and delete on `quotes`, `candles` and `candle_sync` each raise `42501` — a missing grant, not a policy filtering rows away.
- `anon` reaches nothing: `has_table_privilege('anon', …, 'select')` is false for all six reference tables.
- **The trigger sets `updated_at`, not the writer**: update a `quotes` row without naming the column and assert the new value exceeds the old.
- Realtime will actually fire: `pg_publication_tables` has one row for `pubname = 'supabase_realtime'` and `tablename = 'quotes'`.
- `explain` on a `watchlist_items` query filtering by `symbol` shows an Index Scan rather than a Seq Scan.
- **The suites are observed failing**: drop one policy and one grant, confirm the named assertion goes red, restore, confirm green.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` and `pnpm format:check` all exit 0.

### 11 Database schema: funds, orders, and portfolio

The money schema. `trading-contract.md` is authoritative for every column, constraint and default
here. Three of its §12 reconciliation identities are row-level and become **CHECK constraints**
rather than test assertions, so a violating row cannot be stored at all. No functions (F22–F24),
no bootstrap (F13), no seed.

**Logic:**

- Migration creating the five remaining enums — `order_side`, `order_type`, `product_type`, `order_status`, and `ledger_type` with all eight values including `SIMULATION_ADJUSTMENT` and **no `RESET`** (`trading-contract.md` §11) — then `funds`, `fund_ledger`, `orders`, `trades`, `holdings`, `positions` in dependency order.
- `orders.blocked_margin` and `positions.blocked_margin`, both `numeric(14,2) not null default 0`, plus `positions.entry_reference_price numeric(14,2)` — the gross collateral basis, null for longs and non-null for shorts.
- `trades.is_auto_squareoff boolean not null default false`, `trades.charge_breakdown jsonb not null`, and `trades.realised_pnl numeric(14,2) not null default 0` — `0.00` on every opening leg, never null (§9).
- **`charge_breakdown`'s keys are snake_case**: `brokerage`, `stt`, `exchange_txn`, `sebi_turnover`, `stamp_duty`, `dp_charge`, `gst`. Postgres is snake_case and TypeScript is camelCase (`code-standards.md`), so `charges.ts` keeps its own casing and F22's equality test converts at the boundary.
- **Three §12 identities encoded as CHECK constraints**, each commented with the clause it enforces:
  - Identity 8 — `check (status = 'OPEN' or blocked_margin = 0)`. Every order not `OPEN` holds no margin.
  - Identity 12 — `check (net_quantity < 0 or blocked_margin = 0)` and `check ((net_quantity < 0) = (entry_reference_price is not null))`. Longs hold no collateral and carry no reference price; shorts carry both.
  - Identity 6 — the seven `charge_breakdown` components sum exactly to `charges`. §2 makes `charges` the sum of already-rounded components, so the equality is exact and reconciliation cannot fail by a paisa.
- **A CHECK is not deferrable, and that constrains F23/F24.** Identity 8 fires per statement, so a function that sets `status = 'REJECTED'` and *then* calls `release_margin` fails on the first statement. `code-standards.md`'s `execute_order` example does exactly that and **is corrected in this feature's commit** — release the margin first, or write both columns in one statement.
- The contract's other row-level rules, likewise as CHECKs: `available_cash >= 0` (§12.4), `orders.quantity > 0`, `holdings.quantity > 0` and `positions.net_quantity <> 0` (a row at zero is deleted, never retained, §8), all-or-nothing fills `check (filled_quantity = 0 or filled_quantity = quantity)` (§1), `check ((order_type = 'LIMIT') = (limit_price is not null))`, `check ((status = 'COMPLETE') = (average_price is not null))`, and `fund_ledger.balance_after >= 0`.
- `positions.product` is CHECK-constrained to `MIS`. CNC settles into `holdings`, so a CNC position is a bug rather than a state; the constraint is dropped if that ever changes.
- **`select` is the only grant, and only to the owner.** No client role gets insert, update or delete on any of the six, and no write policy exists. `code-standards.md` already forbids a Server Action writing these tables directly — every write arrives through a `security definer` function in F22–F24. `architecture.md`'s "policies restricting all commands" is reworded in the same commit to describe what is actually built.
- Foreign keys **cascade**: `trades.order_id` and `fund_ledger.order_id` from `orders`, and every `user_id` from `profiles`. `reset_account` still deletes each table explicitly per §11; the cascade is a backstop against a future path that forgets one, not the mechanism.
- Indexes: `orders (user_id, placed_at desc)`, `fund_ledger (user_id, created_at desc)`, a partial `orders (symbol) where status = 'OPEN'` for the matcher's join against `quotes`, `trades (user_id, traded_at desc)` for Reports, and the foreign-key columns no primary key already covers.
- `touch_updated_at()` from F10 is reused on `funds`, `holdings` and `positions`. `orders` tracks `placed_at`/`executed_at` instead and needs no `updated_at`; `trades` are immutable once written.
- `orders` added to the `supabase_realtime` publication.
- Types regenerated.
- Two pgTAP suites: `01-rls-money.sql` (the denial matrix) and `02-constraints-money.sql` (every CHECK and foreign key driven to failure on purpose).

**Verify:**

- `pnpm supabase db push` applies cleanly, a second push reports up to date, and `migration list` shows exactly four entries.
- Types regenerate and compile: `pnpm typecheck` exits 0, fifteen tables and seven enums are present, and `grep -n ': any'` returns nothing.
- Signed in as user A, `is_empty()` on all six tables targeting user B's ids.
- **No client role can write any of the six**: `throws_ok(…, '42501')` for insert, update and delete on each — eighteen assertions, including that `update funds set available_cash = 999999` and a direct `insert into holdings` are both refused.
- `has_table_privilege('anon', …, 'select')` is false for all six.
- Cash cannot go negative: `throws_ok(update funds set available_cash = -1, '23514')`.
- **Identity 8**: inserting an order with `status = 'COMPLETE'` and `blocked_margin = 100` raises `23514`.
- **Identity 12**: a long with `blocked_margin > 0` raises `23514`; so does a long carrying `entry_reference_price`, and a short without one.
- **Identity 6**: a `charge_breakdown` one paisa off its `charges` total raises `23514`.
- All-or-nothing: `quantity = 10, filled_quantity = 4` raises `23514`. A zero-quantity holding and a zero-net-quantity position both raise `23514`.
- A `LIMIT` order without a `limit_price`, and a `MARKET` order carrying one, both raise `23514`.
- Deleting an order removes its trades and its ledger rows — insert both, delete the order, assert `is_empty` on each.
- `explain` on the matcher's open-order-by-symbol query at volume shows an Index Scan on the partial index, not a Seq Scan.
- `pg_publication_tables` has one row for `pubname = 'supabase_realtime'` and `tablename = 'orders'`.
- **The suites are observed failing**: drop one CHECK and one policy, confirm the named assertions redden, restore, confirm green — each break inside a transaction that rolls back, so the production schema is never left modified.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` and `pnpm format:check` all exit 0.

### 12 Google sign-in and route protection

Google OAuth through Supabase Auth, session refresh and a route guard in `src/proxy.ts`, and a
minimal signed-in landing page so `/dashboard` is a real destination rather than a 404. Sign-in is
**initiated server-side** — a `<form>` posting to a Server Action that calls `signInWithOAuth` and
redirects to Google — so it works with JavaScript disabled, the standard F07B set for the support
form. `library-docs.md` → Google OAuth sign-in showed the client-side variant and is corrected here.

**UI:**

- `/auth/login`: a Server Component with a `<main>` landmark, a single Google button submitted by a
  form action, and an error region reading `?error=auth` from the awaited `searchParams`.
- **The signed-in identity and sign-out control live on the `/dashboard` stub, not the public
  header.** Reading the session in the `(marketing)` layout would force dynamic rendering on `/`,
  `/about`, `/pricing` and `/support` and break `architecture.md`'s "public, session-free pages"
  boundary. `SiteHeader` is untouched; F17 owns the terminal avatar menu.
- `src/app/(terminal)/dashboard/page.tsx`: minimal — a `getUser()` guard, the Google name and email,
  and a sign-out form. No group layout, no data, no shell. F17 replaces it wholesale.
- **Carried over from the Phase 1 checkpoint: the page this replaces has no `<main>` landmark**, and
  it is the only public route scoring below 100 on Lighthouse (97, `landmark-one-main`). The F03 stub
  was a bare `<div>`; the real page must render `<main>` and take the route to 100.

**Logic:**

- Google OAuth configured in Supabase; `https://kefggygenlprjzhiocai.supabase.co/auth/v1/callback`
  registered in the Google Cloud console, and Site URL plus additional redirect URLs covering the
  local and Render origins. This is console work, and nothing downstream verifies without it.
- `src/lib/auth/routes.ts` — `TERMINAL_PREFIXES`, `isTerminalPath()` and `safeNext()` as pure
  functions. `src/proxy.ts` cannot be reached by tier 1, but these two are where a bug is silent and
  expensive: an unguarded route, or an open redirect. The proxy imports them; tier 1 tests them.
- All four Supabase clients from `architecture.md` → Key Patterns: `client.ts`, `proxy.ts` and
  `admin.ts` join the existing `server.ts`, copied verbatim — the cookie handling is not re-derived.
  `admin.ts` ships with `import 'server-only'` and no caller in this feature, so its guard is proven
  by hand rather than assumed.
- `src/server/actions/auth.ts` — `signInWithGoogle` (redirectTo `${NEXT_PUBLIC_SITE_URL}/auth/callback`
  carrying `next`) and `signOut`. **Both deviate from the standard Server Action shape**: no `input`,
  no `ActionResult`, ending in `redirect()`. `code-standards.md` carries the exception beside the
  `useActionState` one. `redirect()` is called outside any `try` — catching `NEXT_REDIRECT` would
  break the flow silently.
- `/auth/callback` route handler exchanging the code for a session, honouring `x-forwarded-host`
  outside development (Render sits behind a proxy), and sending failures to `/auth/login?error=auth`.
- `src/proxy.ts` refreshing the session and guarding the terminal prefixes, redirecting to
  `/auth/login?next=<pathname>`. **The intended destination survives sign-in**: the callback honours
  `next` only when `safeNext()` accepts it — a single leading `/` — and falls back to `/dashboard`.
  That guard is what stops the callback becoming an open redirect.
- `SupportForm.tsx` keys its form-level banner off `Object.keys(fields).length === 0`, fixing the
  carried-over bug below.

**Verify:**

- Signed-out terminal requests are guarded and remember their destination:
  `curl -sI localhost:3000/holdings` returns **307** with `Location: /auth/login?next=%2Fholdings`.
- Public routes are not intercepted: `curl -sI` on `/`, `/pricing` and `/support` each return **200**
  with no `Location` header.
- The callback's failure branch is provable without Google: `curl -sI
  'localhost:3000/auth/callback?code=bogus'` redirects to `/auth/login?error=auth`, and that page
  renders the error copy.
- **The callback is not an open redirect** — `pnpm test`: `safeNext()` rejects `https://evil.com`,
  `//evil.com` and `javascript:…`, returning `/dashboard` for each.
- Every terminal prefix is covered and no public path is — `pnpm test`: `isTerminalPath` over all
  eight prefixes plus four public paths.
- Sign-in works end to end, verified manually in a browser: signing in at `/auth/login` lands on
  `/dashboard`, the page renders the Google name, and an `sb-*-auth-token` cookie is set.
- Deep-link intent survives: visiting `/positions` signed out and then signing in lands on
  `/positions`, not `/dashboard`.
- Sign-out really ends the session: the button returns to `/`, the `sb-*-auth-token` cookie is gone,
  and `/dashboard` redirects to `/auth/login`.
- `pnpm audit:a11y /auth/login` scores **100**, closing the `landmark-one-main` failure the Phase 1
  checkpoint recorded — confirmed by reading `finalDisplayedUrl` out of the report, not by trusting
  the score (F05).
- **`supabase/tests/01-rls-support-messages.sql` gains an `authenticated` arm.** This feature is what
  makes that role reachable on the contact form: the server client carries request cookies, so from
  here on a signed-in visitor inserts as `authenticated` rather than `anon`. The policy already names
  both, but only `anon` has ever been tested — so the role most submissions will use would otherwise
  ship with zero coverage. Assert insert allowed, and select / update / delete refused with `42501`,
  exactly as the `anon` arm does. Falsified once by flipping an assertion and confirming the runner
  names the file and the assertion.
- Clients are constructed in exactly one place: `grep -rn "createServerClient\|createBrowserClient" src/`
  returns only files under `src/lib/supabase/`.
- **`admin.ts`'s server-only guard is observed, not assumed**: importing it into a Client Component
  fails `pnpm build`; reverted after (the F01 falsifiability precedent).
- Also carried over: `SupportForm.tsx` suppresses the form-level error banner whenever
  `state.error.fields` is truthy, and `{}` is truthy. Any Zod issue with an empty path — a
  schema-level `.refine()`, an `unrecognized_keys` — would re-render the form with no visible
  explanation. Proven fixed by adding a temporary empty-path `.refine()`, confirming the banner
  appears, and reverting.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` all exit zero.

### 13 Account bootstrap on first sign-in

Everything an account needs, created inside the signup transaction: the `profiles` row and its
`ZR######` client ID, the `funds` row at `OPENING_BALANCE`, the single `SIGNUP_CREDIT` ledger entry
that accounts for that cash, and a default watchlist. All four succeed or the signup fails — a user
who gets in without a `funds` row would break every money function that follows.

**UI:**

- The `/dashboard` stub grows two lines: the client ID and available cash. It makes this feature's
  headline claim visible in the product rather than only in SQL, and it is the **first read of a
  money table through a real session** — exercising the `select`-only grant and the `auth.uid()`
  policy F11 built, which until now only pgTAP has touched.

**Logic:**

- `public.generate_client_id()` as its own function, returning `ZR` + six digits. Separate from its
  caller because the exhaustion path can only be tested by stubbing it, and a pgTAP transaction can
  `create or replace` it and roll back.
- `public.handle_new_user()` — `security definer`, `set search_path = ''`, `execute` revoked from
  `public` — on an `after insert` trigger on `auth.users`. It retries generation up to 10 times on a
  unique violation and then raises `CLIENT_ID_EXHAUSTED`: bounded, never an infinite loop, and never
  a silently half-created account.
- Name and avatar coalesce Google's two spellings each (`full_name`/`name`, `avatar_url`/`picture`)
  and tolerate both being absent — `profiles.full_name` is nullable.
- **`OPENING_BALANCE` is a literal `100000.00` in SQL**, cited to `trading-contract.md` §11. The
  trigger runs in Postgres and cannot import `src/lib/constants.ts`, so both sides are pinned to the
  contract's number by their own test rather than to each other.
- **The default watchlist seeds by `INSERT…SELECT` against `instruments`**, intersecting a
  ten-symbol large-cap list against whatever is seeded. F14 populates `instruments` and runs *after*
  this feature, so a plain `INSERT` would violate the foreign key today. This is FK-safe by
  construction, idempotent, and starts working the moment F14 lands with no change here.
- **No backfill path.** `auth.users` currently holds one row with no profile, created while
  verifying F12. That account is deleted and re-created by signing in again, which keeps signup as
  the only path that ever creates an account.

**Verify:**

- pgTAP: signup creates exactly one `profiles` row, `client_id ~ '^ZR\d{6}$'`, `theme = 'dark'`.
- pgTAP: `full_name` and `avatar_url` are copied from `raw_user_meta_data`, and a user with **no**
  metadata still bootstraps with `full_name` null rather than failing.
- pgTAP: `available_cash = 100000.00`, `used_margin = 0`, `opening_balance = 100000.00`; a tier-1
  test pins `OPENING_BALANCE` to the same figure from the other side.
- pgTAP: exactly one `fund_ledger` row — `SIGNUP_CREDIT`, `+100000.00`, `balance_after = 100000.00`,
  `order_id` null.
- pgTAP: **§12.1 and §12.2 hold from the first moment** — `sum(amount) = available_cash`, and the
  newest `balance_after` equals `available_cash`.
- pgTAP: with `instruments` empty the watchlist seed inserts **zero rows and raises nothing**; with a
  three-symbol fixture it inserts exactly three, in list order. The "populated watchlist" half of
  this feature's original verify moves to F14, which is what makes it checkable.
- pgTAP: re-running the bootstrap for the same user leaves one profile and one `SIGNUP_CREDIT` —
  every insert is `on conflict do nothing`.
- pgTAP: **exhaustion is bounded and clean.** With generation stubbed to a constant, signup raises
  `CLIENT_ID_EXHAUSTED` after **exactly 10** attempts, counted by a sequence the stub increments, and
  leaves no `auth.users`, `profiles`, `funds` or `fund_ledger` row behind.
- pgTAP: the trigger is not a client-callable write path — `has_function_privilege('authenticated',
  'public.handle_new_user()', 'execute')` is false.
- `pnpm test:race`: two connections signing up concurrently both succeed with **different** client
  IDs and complete accounts. Seeded as `zr-race-*@example.com` and cleaned in `afterEach`; this is
  the only tier that can express it, since pgTAP is one session in one transaction.
- End to end: the orphan `auth.users` row is deleted, and signing in with Google again lands on
  `/dashboard` showing a `ZR######` client ID and **₹1,00,000.00**.
- `pnpm test`, `pnpm test:db`, `pnpm lint`, `pnpm typecheck` and `pnpm build` all exit zero.

### 14 Instrument and holiday calendar seed

Two committed JSON files and two scripts, separating **refresh** (hit NSE and Yahoo, rewrite the
files — done in January or on a rebalance) from **seed** (read the files, upsert into Postgres —
deterministic, offline, idempotent). Both NSE endpoints are undocumented and one of them already
403s on its warm-up URL from this machine, so a seed that depended on them live would break
unpredictably and would change ~200 rows with no diff to review first.

**Logic:**

- `scripts/fetch-reference-data.mts` — the Nifty 200 constituents from NSE's published CSV
  (`ind_nifty200list.csv`, which carries Company Name, Industry, Symbol and ISIN) and the trading
  calendar from NSE's holiday-master API (`CM` segment). `sector` comes from the `Industry` column
  rather than being invented, so every value is attributable to the source.
- **Every `yahoo_symbol` is probed, not sampled.** The symbol is derived as `${symbol}.NS`, and that
  rule is wrong for a handful of names every year. Yahoo answers 200 for a real symbol and 404 for a
  fake one, so the script probes all ~200 with throttling and **refuses to write the JSON** if any
  fail, naming them. A five-symbol spot check samples 2.5% of the universe and the failure it misses
  stays invisible until someone opens that stock's page in Phase 5.
- `scripts/seed-reference.mts` — upserts both files through the **service-role client**.
  `instruments` and `market_holidays` grant `select` only, and seeding reference data is precisely
  the administrative act that key exists for. It reads `.env.local` and needs no connection string.
- Upsert by primary key — `symbol`, `trading_date`. Existing rows update, **none are deleted**: a
  symbol dropped from the index keeps its row, because holdings and trades reference it.
- **Holidays are stored exactly as NSE publishes them, weekend entries included.** The published list
  contains dates such as Sunday 15-Feb-2026; dropping them would be an editorial judgement about a
  published calendar, and `isTradingSession()` decides weekends independently, so it changes no
  behaviour. The JSON carries a note recording that it needs re-fetching each January.
- Both scripts are tooling, not application code: `scripts/`, run by `node`, never imported by
  `src/` — the same standing as `run-pgtap.mts`. `pnpm seed` is added to `package.json` and to
  `CLAUDE.md`'s command list.

**Verify:**

- **Seeding twice leaves one universe, not two**: run `pnpm seed` twice and confirm
  `select count(*) from instruments` is identical across both runs and lands near 200.
- **The Yahoo probe is deferred with Yahoo itself** (see below). `--probe` runs it and refuses to
  write on any 404; without the flag the JSON records `yahoo_validated: false`, so nobody downstream
  mistakes "seeded" for "verified". pgTAP still asserts the shape: no row has an empty
  `yahoo_symbol`, every one ends in `.NS`, and every one is derived from its own symbol rather than
  copied from a neighbour.
- The universe is real rather than a placeholder — pgTAP: between 190 and 210 rows, every row has a
  non-empty `name`, and `RELIANCE`, `TCS` and `INFY` are present with the expected `yahoo_symbol`.
- Sectors came from the source — pgTAP: fewer than 30 distinct non-null sectors and no empty string.
  A column misalignment in the CSV parse is what this catches.
- The calendar matches what NSE published — pgTAP: `Republic Day` on `2026-01-26`, `Holi` on
  `2026-03-03`, every `description` non-empty, and every row inside 2026.
- **Dates survive the timezone round trip** — pgTAP: `2026-01-26` is stored as exactly that date. A
  UTC-parsed `26-Jan-2026` landing on the 25th is the bug this exists to catch.
- A refresh is reviewable rather than silent: re-running the fetch with the upstream unchanged
  produces **no git diff**, which requires stable ordering and formatting in both files.
- The seed needs no test credentials: `grep` confirms neither script reads `TEST_DATABASE_URL`, and
  seeding succeeds with only `.env.local` present.
- **The default watchlist is finally non-empty** — carried over from F13, whose bootstrap seeds by
  `INSERT…SELECT` against `instruments`: a new signup after this feature lands holds ten watchlist
  rows in the declared order.

**Deferred out of this feature (2026-08-21):** Yahoo blocked this machine's IP for over 40 minutes
after a 200-symbol probe, and **Yahoo is deferred to the end of the project** by decision. The probe
code ships behind `--probe` rather than being deleted, because it is exactly what must run when Yahoo
returns. Until then the universe is seeded but unvalidated, and `yahoo_validated: false` in the JSON
says so.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` and `pnpm build` all exit zero.

### 15 Quote provider chain

The market library everything in Phase 3 reads: NSE session logic, price provenance, a simulator that
walks from a real market close, and the thin provider seam they plug into. Nothing here renders UI or
writes to the database — F16's tick is the first caller.

**Yahoo is deferred to the end of the project (decided 2026-08-21), so this chain ships
simulator-backed.** Twelve Data's free plan carries no NSE symbols at all (verified against the live
API — `library-docs.md` → Quote providers), and NSE's own `quote-equity` endpoint answers 403 from
here, so the simulator is the only provider that can serve a price until Yahoo returns. The interface,
circuit breaker and provenance helpers are all built now — a real provider drops into a finished
chain, not the reverse — but the running system quotes `SIMULATOR`, and every price on screen badges
`SIMULATED`. That is honest by construction; what it must not do is coexist with copy promising real
prices, so **`/` and `/about` must be reconciled before F39 deploys** if Yahoo has not landed by then.

**Logic:**

- **`instruments.prev_close`, seeded from NSE's bhavcopy.** `library-docs.md` said the simulator seeds
  "from `instruments` reference data", but that table carries no price, so a cold start had nothing to
  walk from. Bhavcopy (`nsearchives.nseindia.com/products/content/sec_bhavdata_full_*.csv`) is on the
  same host as the constituent list and is reachable — it is the archive, not the blocked API. The
  F14 fetch script gains a pass that walks back day by day until a file returns 200, filters to
  `SERIES = EQ`, and trims every field (the CSV carries leading spaces in its values).
- **The real close is a seed, never a quote.** No `NSE_BHAVCOPY` enum value and no provenance rewrite:
  `quotes.provider` stays `SIMULATOR` with a null `provider_ts`, so every price badges `SIMULATED`.
  What changes is that the figures are plausible instead of ₹1,000 for both MRF and YESBANK.
- `market-hours.ts` exposes **two shapes over one clock**: a pure `marketStatusAt(date, holidays)`
  that tier 1 can falsify, and the async `isTradingSession(supabase, date)` that `code-standards.md`
  already shows callers using. The holiday set is injected into the pure core, never fetched inside
  it. `getMarketStatus()` returns PRE-OPEN / OPEN / CLOSED **and the next transition**, so F20's pill
  renders a value rather than re-deriving the trickiest arithmetic in the module.
- `provenance.ts` — `deriveSource()` and the `Provenance` type from `architecture.md` → Quote
  Provenance, unchanged. `LIVE` remains structurally unreachable: no provider declares itself
  realtime.
- `QuoteProvider` interface (`name`, `isAvailable()`, `fetchQuotes(symbols)`), an ordered chain, and a
  **per-provider circuit breaker** — all exercised against a deliberately failing fake. F14 is why the
  breaker is the piece worth having: Yahoo's IP block outlasted 40 minutes of polling.
- **The token-bucket limiter is deferred** until something actually makes outbound requests. A rate
  limiter in front of a local simulator caps nothing.
- `SimulatorProvider` — a bounded geometric random walk clamped to ±5% of `prev_close` per session,
  seeded from the last `quotes` row and falling back to `prev_close`. Injected clock and RNG, so it is
  deterministic under test. With neither available it reports **unavailable** rather than inventing a
  base price.
- **The quote windows are set by assumption and labelled as such.** `architecture.md` carries a
  standing TODO to measure Yahoo's real `regularMarketTime` lag; that cannot be done while Yahoo is
  deferred, so `QUOTE_STALE_AFTER_MS` (5 min, the §5 fill gate), `QUOTE_DELAYED_WINDOW_MS` (15 min)
  and `QUOTE_LIVE_WINDOW_MS` (5 s, inert) each carry a comment saying they are unmeasured and what
  would change them.
- **Candles are out of this feature.** No source covers the 1D and 1W intraday ranges — bhavcopy gives
  one daily bar and Yahoo's chart endpoint is deferred — and F33 is the first feature that draws a
  chart. Deciding a chart pipeline four features before anything renders one is the thing being
  avoided. `CandleProvider`, `candle_sync` and the TTLs move to F33.

**Verify:**

- **Session boundaries are exact** — `pnpm test`: 09:14:59 closed, 09:15:00 open, 15:29:59 open,
  15:30:00 closed, all evaluated in IST.
- **The timezone is real, not the server's** — the same instants assert identically under `TZ=UTC` and
  `TZ=America/New_York`. A test that only passes in one zone proves nothing about a server in Oregon.
- Holidays close the market — `2026-01-26` reports closed at 11:00 IST despite being a Monday, read
  from the calendar F14 seeded; the Sunday entry in that calendar changes nothing.
- Status carries three states and a next transition — 09:05 → `PRE-OPEN` with next transition 09:15;
  16:00 on a Friday → `CLOSED` with next transition Monday 09:00, skipping the weekend.
- **`LIVE` is structurally unreachable** — no provider and no age produces it. `SIMULATOR` →
  `SIMULATED`; a null `provider_ts` → `STALE`; beyond the delayed window → `STALE`.
- **The breaker actually opens** — a fake provider failing twice trips its circuit, the chain falls
  through to the simulator, and the failed provider is not called again until the window elapses on
  the injected clock.
- The simulator is bounded and deterministic — the same seed and clock produce the same series; ten
  thousand steps never leave ±5% of `prev_close`; every quote it returns carries
  `provider: 'SIMULATOR'` and a null `provider_ts`.
- **It walks from a real close rather than a constant** — `pnpm test:db`: every instrument has a
  non-null `prev_close` greater than zero, and RELIANCE's falls in a plausible band. `pnpm test`: with
  no last quote and no `prev_close`, the simulator reports unavailable instead of inventing a base.
- **Nothing here touches the network or the database** — `grep` finds no `fetch(` and no Supabase
  import under `src/lib/market/providers/`, and the pure core of `market-hours.ts` takes its holidays
  as an argument.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db` and `pnpm build` all exit zero.

### 16 Market tick Edge Function and schedule



**Logic:**

- `supabase/functions/market-tick/` implementing gate → select-demanded-symbols → fetch → upsert `quotes`.
- `isTradingSession()` checked first; when closed the function writes nothing and returns `{ ok: true, skipped: 'MARKET_CLOSED' }`.
- Symbol selection: recent `symbol_demand` entries, union everything referenced by a holding, position, or open order.
- `pg_cron` job posting to the function every minute over the coarse UTC window `* 3-10 * * 1-5` (≈08:30–16:29 IST), credentials read from Vault. The window is a cost bound only — `isTradingSession()` is the business-time authority.
- `touch_symbol_demand` function the client calls when subscribing.
- A once-daily prune inside the same run: `FIVE_MIN` candles older than the current trading day, `THIRTY_MIN` beyond five trading days, `ONE_DAY` beyond 400 days.

**Verify:**

- Manually invoking the function updates `quotes.fetched_at` for the demanded symbols.
- `cron.job_run_details` shows successful runs one minute apart, with no 401s — proving the Vault-held scheduler credential satisfies the gateway.
- **Record which credential worked**, resolving the TODO in `library-docs.md` → Supabase Cron.
- Invoking the function URL with no `Authorization` header is rejected by the gateway before any handler code runs.
- Every written row has a non-null `provider` and `fetched_at`, and a non-null `provider_ts` unless the provider is `SIMULATOR`; forcing all providers to fail still writes simulator rows rather than none.
- A run with 200 demanded symbols still finishes inside 10 seconds because the limiter caps the batch.
- Invoked at 08:45 IST (inside the cron window, outside the session) the function writes no rows and reports `MARKET_CLOSED`.
- Invoked on a seeded trading holiday it writes no rows, proving the gate does not rely on the cron schedule.

### Phase checkpoint

The complete schema exists, the three test tiers run green, auth works end to end, and prices land in the database on a schedule. Confirm a fresh account bootstraps correctly, tier 2 proves RLS blocks cross-user reads on every table, tier 3 proves the lock guards hold, and the cron job has run unattended for at least an hour.

**Carried over from the Phase 1 checkpoint** — harness hygiene found by reviewing F09's code, none of it blocking:

- `tests/concurrency/connections.race.test.ts` — the `cleanup removed everything` case asserts `countScratchRows()` is null, which is equally true when the scratch table was never created. Run alone with `-t 'cleanup removed'` it passes vacuously. Since tier 3's whole justification is that it writes to the production database, that assertion has to be cleanup-specific: create the table and a prefixed row, then verify the drop.
- `scripts/run-pgtap.mts` — the `TEST_DATABASE_URL` capture excludes `\n` but not `\r`, so a CRLF `.env.test.local` yields a URL ending in `\r` and every suite dies inside `connect()` with an opaque error instead of the named diagnostics that file exists to give. Trim the capture, as `run-race.mts` now does.

---


## Phase 3 — Terminal Shell & Live Prices

### 17 Terminal shell layout



**UI:**

- Top nav: logo, market index strip (NIFTY 50, SENSEX, BANK NIFTY), nav links, funds summary, avatar menu.
- Left watchlist sidebar container, collapsible on mobile.
- Content region at the system's dense type scale (`--text-body`, `--text-number` in tables).
- Market status pill: PRE-OPEN / OPEN / CLOSED with the next transition time.

**Logic:**

- `(terminal)` route-group layout loading the session, profile, and funds server-side.
- Placeholder routes for every terminal page so navigation never 404s.

**Verify:**

- Every terminal nav link renders its page shell.
- The layout redirects to login without a session.
- The market status pill matches `market-hours.ts` at three probed times.

### 18 Watchlist sidebar



**UI:**

- Search input opening a `Command` palette over the instrument universe.
- Rows: symbol, exchange tag, LTP, absolute and percentage change, coloured by direction.
- Hover reveals B / S / chart / remove actions.
- Drag to reorder; empty state when the watchlist is cleared.

**Logic:**

- `addToWatchlist`, `removeFromWatchlist`, `reorderWatchlist` Server Actions.
- Search queries `instruments` with a trigram or prefix index, capped at 20 results.
- Subscribing marks each visible symbol in `symbol_demand`.

**Verify:**

- Adding a symbol persists across reload; removing it persists too.
- Reordering survives a reload in the new order.
- Typing "rel" surfaces RELIANCE within 300ms.
- Symbols on screen appear in `symbol_demand` with a fresh `last_requested_at`.

### 19 Realtime quote store and tick interpolation



The feature that makes the terminal feel alive.

**UI:**

- LTP cells flash green on an up-tick and red on a down-tick, then fade.
- Values move smoothly between server refreshes rather than jumping once a minute.

**Logic:**

- Zustand quote store per `library-docs.md`.
- A single Supabase Realtime subscription on `quotes` mounted once in the terminal layout.
- One `requestAnimationFrame` driver interpolating micro-ticks toward the last server price, bounded so it never drifts beyond a small band.
- Channel cleanup on unmount.

**Verify:**

- Updating a `quotes` row in SQL visibly moves the browser value within two seconds, with no reload.
- React DevTools shows only the affected row re-rendering on a tick, not the whole sidebar.
- Navigating between terminal pages ten times leaves exactly one open Realtime channel.
- Interpolated values never diverge from the last server price by more than the configured band.

### 20 Data source badge and market status



**UI:**

- A shell badge reading DELAYED, STALE or SIMULATED, summarising the worst provenance among symbols on screen, with a tooltip explaining what it means and why.
- Per-price provenance on hover anywhere a price appears: provider, provider timestamp, fetch time, and whether the figure on screen is interpolated.
- Stale prices visually muted once `deriveSource` returns `STALE`.

**Logic:**

- Badge derives from the worst source among symbols currently on screen — one simulated symbol downgrades the whole badge — but never replaces per-price provenance.
- `deriveSource()` recomputed on render, never read from a stored column.

**Verify:**

- Forcing the simulator switches the badge to SIMULATED and the tooltip explains why.
- No price anywhere in the UI renders without accessible provenance.
- With Yahoo as provider the badge reads DELAYED, not LIVE — asserted in a test, because a LIVE badge over a polled endpoint is the failure this feature exists to prevent.
- Leaving a tab open past the delayed window flips the badge to STALE with no new server data, proving freshness is derived rather than frozen.
- An interpolated watchlist figure reports `isInterpolated: true` on hover and shows the true anchor beside it.

### 21 Dashboard home



**UI:**

- Summary cards: total portfolio value, invested amount, overall P&L, day's P&L, available cash.
- Top-10 holdings donut with an "Others" bucket.
- Index strip and a recent-orders list.
- A distinct empty state for a user who has never traded, pointing at the watchlist.

**Logic:**

- Server-side aggregation joining `holdings` against `quotes`; the client only renders.

**Verify:**

- With seeded holdings, the card totals match a hand-computed figure.
- The donut shows the correct ten symbols ranked by market value.
- A fresh account sees the empty state, not zeroes and a blank chart.

### Phase checkpoint

The terminal looks and feels like a real trading front end with live prices. Confirm ticking works unattended for a full market session and no Realtime channels leak.

---


## Phase 4 — Trading Engine

### 22 Charge calculator



**Logic:**

- `calculate_charges(side, product, quantity, price)` in Postgres returning the total and the breakdown.
- **`src/lib/trading/charges.ts` already exists — feature 06 built it** so the pricing page could compute its worked example from real code rather than typed-in totals. This feature adds the Postgres side and makes the two provably equal; it does not create the estimator. The TypeScript one stays **display-only**, per `trading-contract.md` §1.
- Every rate is read from `constants.ts`, whose Postgres equivalent must carry the same figures and the same dated source (`trading-contract.md` §3).

**Verify:**

- Unit tests reproduce a published Zerodha brokerage-calculator example for a delivery buy, a delivery sell, an intraday buy, and an intraday sell, each within one paisa.
- A test asserts the TypeScript estimate and the Postgres result agree for 100 random inputs — including the two rules that are easy to get different on each side: GST is computed on **unrounded** sub-components and rounded once (§2), and `dp_base` is ₹13.00 with its GST inside the single `gst` key (§3).
- Delivery brokerage is exactly zero; intraday brokerage is capped at ₹20.

**Carried over from the Phase 1 checkpoint**, both in `src/lib/trading/charges.test.ts` and `constants.ts`:

- The §2 reconciliation case recomputes `roundToPaise(Object.values(breakdown).reduce(…))` — character-for-character the expression `charges.ts` uses to produce `total`. It does still catch a switch to rounding the *unrounded* sum, so it is not inert, but it proves the property by restating the implementation rather than by independent expectation. Pin it to figures computed by hand, so the Postgres side this feature adds has something to be equal *to*.
- `DP_CHARGE_INCLUSIVE` is a hand-entered `15.34` with nothing tying it to `DP_CHARGE_BASE * (1 + GST_RATE)`. The file's own comment warns these rates move by circular; change the base and `/pricing` keeps showing ₹15.34 while the worked example updates, with the suite green. Assert the derivation.

### 23 Margin reservation and release


Reservation and release, built and proven before any order can consume them.

**Logic:**

- `reserve_margin(order_id)` per `trading-contract.md` §6: computes the requirement (full notional plus estimated charges — no leverage), moves it from `available_cash` into `used_margin`, stamps `orders.blocked_margin`, and writes the `MARGIN_BLOCK` ledger row. Returns false if the user cannot cover it.
- `release_margin(order_id)` reversing it exactly once and writing `MARGIN_RELEASE`; idempotent, returning immediately when `blocked_margin` is already zero.
- `transfer_margin_to_position(order_id)` per `trading-contract.md` §6, including the six-step top-up path: collateral is `|net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges`, the delta against the existing reservation is blocked or released as needed, and the collateral move writes **no ledger row** because no cash changes.
- Collateral is recomputed from that formula on every change to a short position, so partial covers release their share.
- All three functions revoked from `public`, `anon` and `authenticated`.
- Both revoked from `public`, `anon` and `authenticated` — internal-only, per the grant policy in `code-standards.md`.

**Verify:**

- Test: reserving on a CNC buy lowers `available_cash` and raises `used_margin` by the identical amount; the ledger row's `balance_after` matches.
- Test: releasing restores both exactly; releasing a second time changes nothing.
- Test: a reservation larger than `available_cash` returns false and writes nothing.
- Test, **three assertions on one short round trip**, because each catches a different error:
  1. Pre-placement → completed: `available_cash` falls by exactly `required_collateral + actual_charges`. The collateral sits in `used_margin`, not in free cash.
  2. Post-reservation → post-transfer: `available_cash` moves by exactly `−delta`, the reservation adjustment and nothing else.
  3. `available_cash + used_margin` falls by exactly `actual_charges` — the collateral moved rather than vanished, and charges are the only non-recoverable part. This is the assertion that catches a double-spend.
- Test: `orders.blocked_margin` is zero after transfer and the ledger contains no row for the collateral amount.
- Test: reserved estimated charges are not also debited — total cash out for a short entry equals the actual charges exactly, never charges twice.
- **Gap-up test:** a short limit sell at ₹100 that fills at an observed ₹110 requires more collateral than it reserved. With sufficient cash it tops up via `MARGIN_BLOCK` and completes; with insufficient cash it is `REJECTED` with `INSUFFICIENT_FUNDS` and the whole reservation is released. Assert both branches — the top-up is the only case where a better fill price demands more margin.
- Test: `positions.blocked_margin` equals `|net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges` after entry, after adding to the position, and after a partial cover.
- Test: collateral computed from `entry_reference_price` covers a full 20% adverse move **including closing charges**. Recompute it from `average_price` instead and confirm the assertion fails — that substitution under-collateralises by a small, easily-missed amount.
- Test: covering half a short releases exactly half the collateral, not zero and not all of it.
- Test: the margin identity in `trading-contract.md` §12.3 holds after a randomised sequence of 500 reserve/release/fill/cancel operations.

### 24 Order execution function



The heart of the project. Built and tested entirely in SQL before any UI touches it.

**Logic:**

- `place_order(...)` inserting the order, reserving margin, then calling `execute_order` for market orders.
- `execute_order(order_id)` per the golden pattern: lock the order row, **return unless it is still `OPEN`**, lock the funds row, price it, compute charges, check margin against `available_cash + blocked_margin`, release the reservation, insert the trade, upsert the holding or position, update funds, append the ledger, complete the order.
- Business rejections set `status = REJECTED` with a stable `rejection_reason`.
- On completion the function retires the reservation the right way: `release_margin` for buys, long closes, cancellations and rejections; `transfer_margin_to_position` for a fill that opens a short.
- `average_price` computed with the direction-correct formula from `trading-contract.md` §8 — charges added for a long, subtracted for a short.
- `cancel_order(order_id)` for open orders only.
- `reset_account()` wiping orders, trades, holdings and positions and restoring the opening balance in one transaction.

**Verify:**

- Test: a CNC buy of 10 at a known price debits exactly (10 × price + charges) and creates the holding with that average price.
- Test: a second buy at a different price recomputes the weighted average correctly.
- Test: **short entry charges lower `average_price`, they do not raise it.** Short 100 @ ₹100 with ₹30 charges gives `₹99.70`; covering flat at ₹100 reports a loss of ₹30 plus closing charges, never a ₹30 profit. Run this against a build using the long formula and confirm it fails.
- Test: a short with entry charges plus a partial cover reports realised P&L matching a hand calculation to the paisa.
- Test: a buy exceeding available cash is `REJECTED` with `INSUFFICIENT_FUNDS` and leaves `funds` byte-identical.
- Test: a CNC sell without a holding is `REJECTED` with `NO_HOLDING`.
- Test: two concurrent buys that each individually fit but together exceed the balance produce exactly one fill and one rejection — the row lock holds.
- Test, **two concurrent sessions**: both call `execute_order` on the same open order at the same time. Exactly one trade, one ledger entry, and one debit result. Run this against a build with the status guard removed and confirm it fails — a test that cannot fail is not a test.
- Test: an open limit buy reserves margin at placement; `used_margin` rises and `available_cash` falls by the same amount.
- Test: cancelling that order restores both figures exactly; releasing twice is a no-op.
- Test: an MIS short reserves margin, and a user with zero available cash cannot open one.
- Test: `available_cash` never goes negative across a randomised sequence of 500 orders, and opening balance minus net debits plus net credits equals the final balance.
- Test: `reset_account` returns every table to the post-signup state.

### 25 Order ticket UI



**UI:**

- Modal dialog with the system's trading buttons: `--color-up` for buy, `--color-down` for sell, `--radius-sm`, tight padding. The final confirm action is the brand CTA (`bg-brand text-on-brand`).
- Quantity, product toggle (CNC/MIS), order type toggle (MARKET/LIMIT), limit price shown only for limit orders.
- Live margin required, available cash, and the estimated charge breakdown, all updating as inputs change.
- Inline validation errors and a disabled submit while in flight.

**Logic:**

- `react-hook-form` with `zodResolver(placeOrderSchema)`.
- Charge estimate from `src/lib/trading/charges.ts`, labelled as an estimate.

**Verify:**

- Selecting LIMIT reveals the price field; submitting without it shows a field error.
- Quantity zero or negative is rejected client-side.
- The displayed margin required matches the engine's computed cost within one paisa for ten sample orders.
- Double-clicking submit places exactly one order.

### 26 Place order end to end



**Logic:**

- `placeOrder` Server Action per the golden pattern, calling `place_order` and revalidating the affected routes.
- Rejection codes mapped to human copy; success and failure both raise a toast.

**Verify:**

- A market buy from the watchlist completes and appears in Holdings without a manual reload.
- An unaffordable order shows "Insufficient funds" and no order is left in a bad state.
- The action never throws; forcing a database error returns the standard error shape.

### 27 Orders page



**UI:**

- Tabs: Open, Executed, Cancelled, Rejected, with counts.
- Columns: time, symbol, side, product, type, quantity, price, average price, status.
- Cancel and modify actions on open orders; rejection reason shown inline.
- Empty state per tab.

**Logic:**

- `cancelOrder` and `modifyOrder` Server Actions; modify is limited to quantity and limit price on open orders.
- Realtime subscription on `orders` so a background fill moves the row between tabs live.

**Verify:**

- A limit order appears under Open immediately after placement.
- Cancelling moves it to Cancelled and releases the blocked margin, restoring `available_cash` to the paisa.
- Cancelling an order at the same moment the matcher fills it yields exactly one outcome, not a cancelled-and-filled order.
- Modifying an executed order is refused.
- A fill triggered by the cron job moves the row from Open to Executed with no reload.

### 28 Limit order matching



**Logic:**

- `match_open_orders()` selecting open limit orders whose symbol's refreshed quote has crossed the limit — buys at or below, sells at or above — and calling `execute_order` for each.
- Called by the market tick function after the quote upsert, inside the same run.
- Idempotent under both sequential retry and simultaneous invocation; safety comes from the status guard in `execute_order`, not from the scheduler.

**Verify:**

- Test: a buy limit above the current price fills on the next tick; one below stays open.
- Test: a sell limit below the current price fills; above stays open.
- Test, **two concurrent sessions**: `match_open_orders()` invoked simultaneously produces exactly one fill for a crossing order. A sequential double-run does not exercise this — the second pass no longer selects the order, so it passes with the bug present.
- Test: a limit order for a user whose cash has since been spent is rejected, not filled into a negative balance.
- Observed live: a limit order placed just off the market fills within two minutes during market hours.

### 29 MIS auto square-off



**Logic:**

- `square_off_mis()` finding every open MIS position after `SQUARE_OFF_TIME_IST` on the same trading day and exiting it at the last traded price.
- Exit trades marked so Reports can distinguish them from user-initiated exits.
- Called by the market tick function; no-op before 15:20 IST.

**Verify:**

- Test with an injected clock: a position open at 15:19 survives; after the first run at or past 15:20 it is flat with a closing trade and realised P&L recorded.
- Test: square-off releases `positions.blocked_margin` in full and deletes the row.
- Test: a symbol whose only quote is simulator-sourced still squares off, and the closing trade records that provenance rather than passing as a real close.
- **Loss-cap test:** a short whose adverse move exceeds collateral plus available cash still squares off. `available_cash` lands at exactly zero, a `SIMULATION_ADJUSTMENT` row carries the uncovered remainder, `trades.realised_pnl` records the **true** uncapped loss, and identity 9 still balances.
- Test, **two concurrent sessions**: `square_off_mis()` invoked simultaneously after 15:20 exits each position exactly once.
- Test: no CNC holding is ever touched by the square-off job.

### Phase checkpoint

The engine is correct and covered by tests. Re-run the full suite, reconcile a randomised trading session end to end, and confirm every identity in `trading-contract.md` §12 holds.

---


## Phase 5 — Portfolio Pages

### 30 Holdings page



**UI:**

- Columns: symbol, quantity, average cost, LTP, current value, overall P&L, day change — P&L coloured by sign.
- Footer totals: invested, current value, overall P&L, day P&L.
- Sortable columns; per-row exit action opening a pre-filled sell ticket.
- Empty state for a user with no holdings.

**Logic:**

- Server-side join of `holdings` and `quotes`; the client subscribes only for live LTP.

**Verify:**

- Totals equal the sum of the rows, asserted against a hand-computed fixture.
- A live tick updates a row's P&L and the footer total together.
- Selling the full quantity removes the row entirely rather than leaving a zero.

### 31 Positions page



**UI:**

- MIS positions with net quantity (negative for shorts), average price, LTP, unrealised and realised P&L.
- Exit button per position; a banner showing time remaining until auto square-off.
- Empty state.

**Verify:**

- An intraday buy appears here and not in Holdings; a CNC buy does the opposite.
- Exiting a position writes the closing trade and the realised P&L matches a hand calculation.
- A short position shows negative quantity and P&L that moves opposite to price.

### 32 Funds page



**UI:**

- Cards: available cash, used margin, opening balance, total P&L.
- Ledger table with type, amount, running balance, related order, and timestamp; paginated and filterable by type.
- "Reset account" with a confirmation dialog spelling out exactly what is destroyed.

**Logic:**

- `resetAccount` Server Action calling the `reset_account` database function.

**Verify:**

- Every trade produces a matching ledger entry; the count matches the trade count.
- `balance_after` on the newest entry equals `funds.available_cash` exactly.
- `used_margin` equals `Σ orders.blocked_margin` over `OPEN` orders plus `Σ positions.blocked_margin`, checked after a randomised sequence of placements, fills, partial covers and cancels.
- Reset restores the post-signup state exactly: orders, trades, holdings, positions and all ledger rows deleted, cash back to `OPENING_BALANCE`, `used_margin` zero, and a single fresh `SIGNUP_CREDIT` row — per `trading-contract.md` §11.
- The confirmation dialog is required — no path resets without it.

### 33 Stock detail page



**UI:**

- Header: symbol, name, LTP, day change, market status.
- Candlestick chart with 1D / 1W / 1M / 1Y range switching.
- OHLC, volume, 52-week high and low.
- Buy and sell buttons opening the ticket; the user's current holding in this symbol, if any.

**Logic:**

- `getCandles(symbol, range)` server-side: map range to interval, serve from `candles` when `candle_sync` is fresh, otherwise fetch through the candle provider chain, upsert, and stamp `candle_sync`.
- 1M and 1Y windowed from the one `ONE_DAY` series rather than fetched separately.
- On provider failure, serve the cached rows with their true age surfaced; never an empty chart, never fabricated candles inside a real series.
- The chart component receives plain serialisable data and resolved theme colours.

**Verify:**

- The chart renders for ten different symbols with no console errors.
- Switching between 1M and 1Y issues **no** new upstream request — both window the same cached daily series.
- A second visit inside the TTL issues no upstream request at all; `candle_sync.fetched_at` is unchanged.
- With the provider forced to fail and cached rows present, the chart still renders and shows the data's real age.
- Navigating away and back leaves no leaked canvas — `chart.remove()` confirmed in cleanup.
- A symbol with no available history shows an explanatory empty state, not a broken chart.

### 34 Reports and trade history



**UI:**

- Completed trades with date-range and symbol filters.
- Realised P&L summary, and unrealised P&L for open holdings.
- Per-trade charge breakdown expandable from the row.
- CSV export of the filtered set.

**Verify:**

- Realised P&L totals equal the sum of `trades.realised_pnl` over the filtered range.
- Filters narrow the set correctly, verified against a direct SQL count.
- The exported CSV row count matches what is on screen.

### 35 Profile and settings



**UI:**

- Google name, email, avatar, and the simulated client ID.
- Light/dark theme toggle persisted to `profiles.theme`.
- Account reset, duplicated here from Funds.
- Sign out.

**Verify:**

- The theme choice survives sign-out and sign-in on a different browser.
- The client ID matches the one issued at bootstrap.
- Reset from here behaves identically to reset from Funds.

### Phase checkpoint

Every page in `project-overview.md` exists and is wired to real data. Walk the full journey from signup to a closed position and confirm every number reconciles.

---


## Phase 6 — Polish & Ship

### 36 States, skeletons, and error boundaries



**UI:**

- A `loading.tsx` skeleton for every data-loading route segment, shaped like the content it replaces.
- An `error.tsx` with retry for every terminal segment.
- Reviewed empty states across watchlist, holdings, positions, orders, ledger, and reports.

**Verify:**

- Throttled to Slow 3G, every terminal route shows a skeleton rather than a blank frame.
- Forcing a query failure renders the boundary with a working retry.
- A brand-new account sees a purposeful empty state on all six surfaces.

### 37 Responsive pass



**UI:**

- Watchlist becomes a bottom sheet or drawer on mobile.
- Dense tables scroll horizontally inside their own container; the page body never scrolls sideways.
- The order ticket is usable one-handed at 375px.

**Verify:**

- Every route at 375px, 768px, and 1440px has no horizontal body overflow.
- The order ticket can be completed end to end on a 375px viewport.

### 38 Accessibility pass



**Logic:**

- Keyboard navigation throughout; visible focus rings; a search shortcut.
- Labels on every input, `aria-live` on the market status and toasts.
- Contrast checked in both themes — including P&L red and green against both backgrounds.
- **Already fixed, do not redo (1.00.01):** the muted-token failures found across F04–F08. Both tokens now flip in `.light`, and `theme-tokens.test.ts` computes every foreground/surface ratio in both themes and asserts AA plus the `muted < muted-strong < body` hierarchy. **Do not remove those assertions** — `pnpm audit:a11y` cannot see the light theme, so they are the only thing guarding it.
- **Still open — `text-brand` cannot pass AA on the light canvas, by construction.** Brand yellow is 11–13.5:1 as text on dark surfaces and **1.37–1.43:1 on light**, under even the 3:1 large-text floor. F02's invariant deliberately keeps `--color-brand` byte-identical across themes, so the same yellow necessarily lands on white. After 1.00.01 this is the **only** remaining contrast failure on the public site — 4 elements on `/legal`, all wordmark or inline prose link. Resolving it means choosing between a light-mode text variant of the brand token, restricting `text-brand` to dark-background contexts, or treating the wordmark as a brand mark exempt from text rules. A design decision, not a cleanup.
- **`pnpm audit:a11y` only ever loads the default theme**, so a clean score is never evidence about light mode.
- **Measure a theme by loading it, never by toggling the class from script.** Elements carrying `transition-colors` return stale computed colours after a scripted class change — that produced a 17-failure phantom during 1.00.01 which vanished on a real page load. Set the stored theme, reload, then measure.

**Verify:**

- The full order flow is completable with the keyboard alone.
- Axe reports no serious or critical violations on the six main terminal routes.
- Colour is never the only carrier of meaning — P&L sign shows an arrow or sign as well.

### 39 Deploy



**Logic:**

- Render web service: build and start commands, Node version pinned, environment variables set.
- Supabase production project migrated and seeded; Google OAuth redirect URLs updated for the Render origin.
- `pg_cron` job scheduled against the production Edge Function.
- `/api/health` returning build and database status.

**Verify:**

- A cold visit to the Render URL loads and signs in successfully.
- `cron.job_run_details` on production shows successful runs while the web service is asleep.
- Placing an order on production behaves exactly as locally.
- No secret appears in the client bundle — verified by grepping the built output for the service-role key.

### 40 README, demo, and handoff



**Logic:**

- README: what it is, screenshots, architecture diagram, local setup, environment variables, the honest data-source explanation.
- A seeded demo account with a varied portfolio so the dashboard is never empty for a first-time viewer.
- Repository links from About and the footer.

**Verify:**

- A clean clone can be brought up locally following only the README.
- Every screenshot matches the current UI.
- The demo account shows a populated dashboard with at least ten holdings so the donut chart is meaningful.

### Phase checkpoint

Shipped. Full regression pass on production: sign up, trade, reset, sign out. Compact the build journal and promote every remaining constraint.

---
