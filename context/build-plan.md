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



**UI:**

- Category cards (Account, Orders, Funds, Technical) with expandable FAQ entries.
- Contact form: name, email, category, message.
- Success and error states, with the form disabled while submitting.

**Logic:**

- `support_messages` table with a migration allowing anonymous `INSERT` and no `SELECT`.
- `submitSupportMessage` Server Action with Zod validation.

**Verify:**

- A valid submission inserts one row; the UI shows the success state.
- An invalid email shows a field error and inserts nothing.
- Signed out, a `select` against `support_messages` returns zero rows — insert-only RLS confirmed.

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

Stand up all three test tiers before the schema they will police exists, so no later feature can be written without a way to prove it. Tiers and rules are defined in `code-standards.md` → Testing.

**Logic:**

- A **second** hosted Supabase project created as the test target; `TEST_DATABASE_URL` in `.env.test.local` (gitignored) and named in `.env.example`. The free plan allows two active projects — this is the second.
- `pnpm db:push:test` applying the full migration history with `supabase db push --db-url "$TEST_DATABASE_URL" --include-all`.
- Scripts: `pnpm test` (tier 1, Vitest), `pnpm test:db` (tier 2, `supabase test db --db-url`), `pnpm test:race` (tier 3, Vitest driving `pg`), and `pnpm test:all` chaining all three.
- `supabase/tests/00-helpers.sql` enabling the pgTAP extension and holding shared fixtures.
- `tests/concurrency/helpers.ts` with two-client setup, a seeded-user factory using a recognisable prefix, and `afterEach` cleanup that runs on failure too.
- `pg` and `@types/pg` added to the approved dependency list.

**Verify:**

- **Run this first, as a spike.** `pnpm test:db` executes a trivial `select plan(1); select ok(true); select * from finish();` against the test project and reports TAP success. A probe here showed `supabase test db --db-url` connects to the database before anything else and fails on connection, with no Docker error — but whether `pg_prove` itself needs a container after a *successful* connect is unproven, and this machine has no Docker.
- If that spike fails on a container requirement, fall back without redesigning anything: the tier 2 files are plain SQL with pgTAP assertions, so run them through the same `pg` client tier 3 already uses and read the TAP output from the result set. Record which path was taken in the build journal.
- `pnpm test:race` opens two connections and proves they are distinct backends — `select pg_backend_pid()` returns different values — then closes both.
- `pnpm db:push:test` applies cleanly to the empty test project, and re-running it is a no-op.
- `TEST_DATABASE_URL` pointed at a paused or wrong project fails with a clear connection error, never a silent skip or an empty pass.
- `.env.test.local` is gitignored: creating it leaves `git status` clean.

### 10 Database schema: identity and market data



**Logic:**

- Supabase project created and linked via the CLI.
- Migration creating the enums, plus `profiles`, `instruments`, `quotes`, `candles`, `candle_sync`, `symbol_demand`, `watchlist_items`, `market_holidays`.
- `quotes` carries `provider` and `provider_ts` and **no `source` column** — freshness is derived at read time, per `architecture.md` → Quote Provenance.
- RLS enabled on `profiles` with `auth.uid() = id` policies (its primary key *is* the user id) and on `watchlist_items` with `auth.uid() = user_id`; `instruments`, `quotes` and `market_holidays` readable by all authenticated users and writable by none.
- `quotes` added to the `supabase_realtime` publication.
- `src/types/database.ts` generated.

**Verify:**

- `pnpm supabase db push` applies cleanly to a fresh project.
- Generated types compile with no `any`.
- As an authenticated user, an `update` on `quotes`, `candles` or `candle_sync` is refused by RLS.
- The `quotes` table has no `source` column; attempting to select one fails.

### 11 Database schema: funds, orders, and portfolio



**Logic:**

- Migration creating `funds`, `fund_ledger`, `orders`, `trades`, `holdings`, `positions` exactly as `trading-contract.md` specifies.
- `orders.blocked_margin` and `positions.blocked_margin`, both `numeric(14,2) not null default 0`, plus `positions.entry_reference_price numeric(14,2)` — the gross collateral basis, null for longs.
- `trades.is_auto_squareoff boolean not null default false` and `trades.charge_breakdown jsonb not null`.
- `ledger_type` enum with all eight values from the contract, including `SIMULATION_ADJUSTMENT`; no `RESET` value.
- `CHECK (available_cash >= 0)`, `CHECK (orders.quantity > 0)`, `CHECK (holdings.quantity > 0)` — holdings rows are deleted at zero, never retained.
- RLS on every one of them: all commands restricted to `auth.uid() = user_id`.
- Indexes on `(user_id, placed_at desc)` for orders, `(user_id, created_at desc)` for the ledger, and `status` where `OPEN` for the matcher.
- `orders` added to the `supabase_realtime` publication.
- Types regenerated.

**Verify:**

- Signed in as user A, selecting user B's rows returns zero across all six tables.
- Attempting `update funds set available_cash = 999999` from the client is refused.
- A direct `insert` into `holdings` from the client is refused.
- `explain` on the open-order query uses the index rather than a sequential scan.

### 12 Google sign-in and route protection



**UI:**

- `/auth/login` with a single Google button, loading state, and error display.
- Signed-in avatar and sign-out control in the header.

**Logic:**

- Google OAuth configured in Supabase; redirect URLs registered for local and Render origins.
- The three Supabase clients from `architecture.md` → Key Patterns.
- `/auth/callback` route handler exchanging the code for a session.
- `src/proxy.ts` refreshing the session and guarding terminal prefixes.

**Verify:**

- Signing in redirects to `/dashboard` with a session cookie set.
- Visiting `/holdings` signed out redirects to `/auth/login`.
- Visiting `/pricing` signed out renders normally and is not intercepted.
- Sign-out clears the session; the terminal is no longer reachable.

### 13 Account bootstrap on first sign-in



**Logic:**

- `handle_new_user` trigger on `auth.users` creating the `profiles` row, generating a `ZR######` client ID, and copying name and avatar from the Google identity.
- Client ID generation retries up to 10 times on a unique violation and raises `CLIENT_ID_EXHAUSTED` if all 10 collide — bounded, never an infinite loop, and never a silently failed signup.
- The same trigger inserting the `funds` row at `OPENING_BALANCE`, the `SIGNUP_CREDIT` ledger entry, and a default watchlist.
- Trigger is idempotent — a repeat sign-in creates nothing new.

**Verify:**

- A brand-new Google account lands on `/dashboard` with ₹1,00,000 available and a populated watchlist.
- Signing out and back in leaves exactly one `profiles` row and one `SIGNUP_CREDIT` entry.
- Two users signing up concurrently receive different client IDs.
- With generation stubbed to always return the same value, signup fails with `CLIENT_ID_EXHAUSTED` after exactly 10 attempts rather than hanging or creating a broken profile.

### 14 Instrument and holiday calendar seed



**Logic:**

- `supabase/seed/nifty200.json` with symbol, name, sector, and `yahoo_symbol` for each constituent.
- An idempotent seed script upserting into `instruments`.
- The current NSE trading-holiday calendar seeded into `market_holidays`, with a note recording that it must be re-seeded each January.

**Verify:**

- The seed run twice leaves roughly 200 rows, not 400.
- Every row has a non-empty `yahoo_symbol`.
- `market_holidays` contains this year's published NSE closures, and `isTradingSession()` reports closed on each of them.
- A spot check of 5 random `yahoo_symbol` values returns HTTP 200 from the Yahoo chart endpoint.

### 15 Quote provider chain



The reliability core, built and tested before anything renders a price.

**Logic:**

- `QuoteProvider` interface: `name`, `isAvailable()`, `fetchQuotes(symbols)`, circuit-breaker state.
- `YahooProvider` — one request per symbol, staggered, browser `User-Agent`, Zod-parsed, trips its circuit for 5 minutes on a 429.
- `TwelveDataProvider` — reports unavailable when the key is unset.
- `SimulatorProvider` — bounded random walk seeded from the last known quote; always succeeds.
- `QuoteService` walking the chain and a token-bucket limiter capping symbols per tick.
- `CandleProvider` chain over the same limiter and circuit breaker, plus `deriveSource()` and the provenance helpers in `src/lib/market/provenance.ts`.
- `market-hours.ts` exposing `isTradingSession(clock)`, computing NSE session state in `Asia/Kolkata` against a `market_holidays` table — not against the cron window.

**Verify:**

- Unit tests: a 429 from Yahoo trips the circuit and the next call falls through to the simulator.
- Unit test: a malformed Yahoo payload fails its Zod parse and falls through rather than throwing.
- Unit test: with no key set, the Twelve Data provider is skipped silently.
- Unit tests for `deriveSource`: `SIMULATOR` → `SIMULATED`; a polled provider within the live window → `DELAYED`, never `LIVE`; beyond the delayed window → `STALE`; null `provider_ts` → `STALE`.
- Unit test: a candle response with null entries drops those indices rather than forward-filling.
- Unit tests for `market-hours` cover pre-open, open, post-close, weekend, a listed trading holiday, and the 15:20 square-off boundary, with an injected clock.
- Test: 09:14:59 and 15:30:01 IST both report closed; 09:15:00 reports open.
- An integration run against the live Yahoo endpoint returns a plausible price for `RELIANCE`.

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
- **Known failure to resolve here, found in F06: `text-brand` can never pass AA on the light canvas, by construction.** Brand yellow measures 11–13.5:1 as text on the dark surfaces and **1.37–1.43:1 on light** — below even the 3:1 large-text floor. This is not a mistake to correct locally: F02's machine-checked invariant forbids `.light` from redefining `--color-brand`, so the same yellow necessarily sits on a white canvas in light mode. Currently affects the header and footer wordmarks and the decorative list bullets on Home, About and Pricing. Resolving it means choosing between a light-mode-only text variant of the brand token, restricting `text-brand` to dark-background contexts, or accepting the wordmark as a brand mark exempt from text rules — a design decision, not a cleanup.
- **The accessibility audits have only ever run in the dark theme.** `pnpm audit:a11y` loads the page with its default theme, so nothing in features 04 to 06 was audited in light mode, and the failure above is invisible to that command. This pass must check both themes — the practical method is measuring computed contrast per element with the theme class toggled, which is how the ratios above were obtained.
- **Known failure to resolve here, measured across F04–F08: neither muted token has a `.light` override, and in light mode the hierarchy is inverted.** `--color-muted-strong` (#929aa5) measures 5.56–6.81:1 in dark but **2.72–2.84:1 in light** — under even the 3:1 large-text floor — on 27 elements of `/legal` alone, and it is used for every section lede and column label across the public site. Because it is *lighter* than `--color-muted`, in light mode `muted-strong` is **less** prominent than `muted`: the opposite of what its name promises. Fixing this means giving both tokens `.light` values that are darker than their dark-theme ones, with `muted-strong` the darker of the two, then re-auditing. Original F04 note follows.
- **Known failure to resolve here, found in F04:** `--color-muted` (#707a8a) fails WCAG AA for normal text in **both** themes, and for opposite reasons — 3.64:1 on the dark `--color-surface`, 4.34:1 on light `#ffffff`. `--color-muted-strong` is not the fix: being lighter, it helps on dark (5.56:1) and makes light **worse** (2.84:1). The muted tokens have no `.light` override, so resolving this means giving them one — a darker muted in light, a lighter one in dark — and re-running `pnpm audit:a11y` on every public route. F04 retoned running copy to `--color-body`, which is what DESIGN.md prescribes anyway; what remains failing is `muted` in its **sanctioned** uses (footer links, captions, column headers), which is a genuine gap in the extracted system rather than a misuse.

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
