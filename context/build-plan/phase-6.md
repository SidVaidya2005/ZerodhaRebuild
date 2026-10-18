> Part of `context/build-plan.md`; see that index for the build principle and phase order.
> Read the feature needed for the current task. `progress-tracker.md` holds current status.
> These specifications retain implementation-time decisions and dated verification results. Check
> current rules in the authoritative context files before reusing an older plan. Ongoing constraints
> live in `constraints.md`; the account of past work lives in `build-journal.md`.

## Phase 6 — Polish & Ship

### 36 States, skeletons, and error boundaries

Give each terminal route a loading skeleton and an error boundary whose retry fetches the data
again. A skeleton is a temporary shape matching the content still loading; an error boundary
replaces a failed part of the page with recovery controls.

First change the six terminal pages and the terminal layout to **throw after logging read
failures**. Before F36, they fell through to the empty state, making a broken query look like an
empty account. The intended distinction is simple: show an empty state for no data and an error
boundary for a failed read. Add `global-error.tsx` for errors thrown by the root layout itself.

**UI:**

- A `loading.tsx` skeleton for every data-loading route segment, shaped like the content it replaces — the eight `(terminal)` segments plus `(terminal)/loading.tsx` for the shell. Marketing pages are statically rendered and fetch nothing, so they get none.
- Skeletons compose from shared primitives in `src/components/terminal/skeletons/` (`PageSkeleton`, `TableSkeleton`, `SummaryCardsSkeleton`) over the existing `components/ui/skeleton.tsx`, rather than eight bespoke copies that drift from the pages they mirror. No new dependency.
- An `error.tsx` for every terminal segment, each a thin `'use client'` wrapper over one shared `TerminalErrorBoundary` so the per-segment rule costs eight small files rather than eight copies.
- `src/app/global-error.tsx`, which replaces the root layout entirely and therefore declares its own `<html>`/`<body>` and imports `globals.css` itself. It cannot reach the `next/font` variables or the `next-themes` class the root layout sets, so it renders in the dark palette — correct here, since the tokens are dark-by-default on `:root` and `.light` is the override.
- Review empty states for watchlist, holdings, positions, orders, ledger and reports. Most already exist: `LedgerTable`, `TradeHistoryTable` and `WatchlistSidebar` include past-the-end cases, while Dashboard, Holdings and Positions have dedicated components. Reuse those and fill the Orders gap rather than create six replacements.

**Logic:**

- The six terminal pages and `(terminal)/layout.tsx` log the read error as they do today and then **throw**, so the boundary catches it.
- **A layout's own `error.tsx` does not catch its own throw**, so a failed watchlist or universe read surfaces at the _root_ boundary as a chrome-less full-page error rather than a terminal-shaped one. Accepted: the sidebar is part of the shell, so a shell that cannot load is not a working terminal.
- `stocks/[symbol]` keeps `notFound()` for an unknown symbol; only its read _failures_ throw.
- Use `retry` for the recovery button. Context7 confirmed that Next.js passes `error`, `reset` and `retry`: `retry()` calls `router.refresh()` and resets the boundary; `reset()` only clears the boundary state. A failed server-side read needs a fresh payload, so `reset()` alone shows the same failure again. Replace `reset` in `src/app/error.tsx` in the same change.
- `code-standards.md`'s loading/error rule stops saying "not yet true, and F36 owns it"; `library-docs.md`'s Next.js 16 section gains the `error.tsx` props finding, which it does not currently cover.

**Verify:**

- Throttled to Slow 3G, every terminal route shows a skeleton rather than a blank frame. Read `document.visibilityState` before believing the result — a backgrounded tab freezes animations and makes this unjudgeable rather than failing (`constraints/verification.md`).
- Forcing a query failure renders the boundary, and its retry recovers the page once the failure is reverted. **Falsified first**: the same forced failure renders the _empty state_ on the pre-F36 code, which is the defect this feature closes.
- Check that a brand-new account sees purposeful empty states for holdings, positions, orders and reports. Its watchlist and ledger cannot be empty: F13 seeds watched symbols and a `SIGNUP_CREDIT` row. Their empty-state implementations still need checking, but a new account cannot demonstrate them. Verify that all six states exist and expect only four to render on signup.
- `find src/app/\(terminal\) -name error.tsx | wc -l` is 8 and `-name loading.tsx` is 9, so the `code-standards.md` rule is structurally true rather than asserted.
- `pnpm test`, `typecheck`, `lint`, `format:check` and `build` all green.

### 37 Responsive pass

Make navigation reachable on smaller screens, keep the order ticket usable in a short viewport,
and add an automated check for horizontal page overflow.

Before planning F37, two independent measurements agreed: an in-page iframe harness and headless
Brave found `scrollWidth === clientWidth` on every route at 375px, 768px and 1440px. Phase 5 had
already fixed the two recorded causes. Positioned scroll wrappers contained the `sr-only` labels,
and `hidden … sm:block` kept the wordmark from overflowing the header. Those widths did not,
however, cover the later 1024px breakpoint finding below.

**The remaining navigation gap was below 1024px.** The header used `lg:flex`, its hamburger
opened only the watchlist, and `AvatarMenu` offered only Settings and Sign out. At 375px, none
of the six page destinations was reachable without entering a URL. At 768–1023px, only the
wordmark link to `/dashboard` was available. Do not lower the desktop-nav breakpoint: the 768px
header had about 106px spare, while the links needed 404px.

**UI:**

- The header's sheet becomes the menu below `xl`: trigger `md:hidden` → `xl:hidden`, relabelled
  "Open menu", with the six `TERMINAL_NAV_LINKS` rendered above the watchlist panel and
  `aria-current="page"` on the active one. Reusing that array means `terminal-routes.test.ts`
  already proves every link in the sheet has a route behind it, and the sheet cannot drift from
  the desktop nav.
- The sheet is full-bleed below `md` and a constrained panel from `md` to `lg`, per DESIGN.md →
  Collapsing Strategy. Each override repeats the `data-[side=left]:` prefix, or tailwind-merge
  drops it into a different variant group and it loses silently.
- `WatchlistRail` moves from `md` to `lg`, returning 288px to the tables at tablet widths.
- Move desktop navigation from `lg` to `xl`. This was added after measuring the breakpoint
  boundaries: every terminal page already overflowed by 202px between 1024px and about 1226px.
  The links needed 404px and the right-hand controls 442px, both forced into the 1024px header by
  `lg:`. Stashing F37 and rebuilding reproduced the same overflow from the same element. The
  sheet now supplies these links below `xl`, so raising the desktop breakpoint preserves access.
- `DialogContent` gains `max-h-[calc(100dvh-2rem)] overflow-y-auto`. It is `fixed` and
  `-translate-y-1/2` with no max height, so a dialog taller than the viewport is clipped at both
  ends with no way to scroll. Fixed in the primitive rather than at the order ticket, because
  `ModifyOrderDialog` and `ResetAccountDialog` carry the identical hazard.

**Logic:**

- `WatchlistPanel`'s `h-full` becomes `min-h-0 flex-1`. With a sibling above it in the sheet's
  flex column, `h-full` claims the whole sheet and pushes the watchlist off-screen — the same
  failure this file already records for `Command`'s base `h-full`.
- `scripts/audit-overflow.mts` behind `pnpm audit:overflow`: every route at 375, 768, 1024, 1280 and 1440px,
  failing on `scrollWidth > clientWidth` and naming the widest offending element so a failure is
  actionable. Standalone rather than a `test:all` tier, because it needs a running server —
  exactly like `audit:a11y`, which is also outside `test:all`.
- Resolve `puppeteer-core` through the existing `lighthouse` dependency using
  `createRequire(require.resolve('lighthouse'))`. A direct `require.resolve` fails under pnpm's
  dependency isolation. Do not hardcode `.pnpm/puppeteer-core@<version>`; that path changes when
  Lighthouse updates. This approach needs no new dependency.
- Terminal routes need a session and headless Brave has none, so the guard replays a cookie from
  `OVERFLOW_GUARD_COOKIE` and **fails rather than skips** when terminal routes are requested
  without it — `test:parity`'s behaviour without `TEST_DATABASE_URL`. Public routes always run.

**Verify:**

- `pnpm audit:overflow` exits 0 across every route at 375, 768, 1024, 1280 and 1440px.
- The guard can fail: inject a `w-[2000px]` element, confirm it names the route, the overflow and
  the offending element, then revert.
- The guard cannot _false_-pass on a stale session: a garbage `OVERFLOW_GUARD_COOKIE` must report
  every terminal route as redirected, not as narrow. Falsifiable without handling a real token.
- All six destinations are reachable below `xl` with `aria-current` on the active link, and at
  `xl` and above the header nav shows and the trigger is gone.
- The order ticket can be completed end to end on a 375×667 viewport. Drive this with real input
  on an unoccluded window: a dispatched pointer sequence opens the Radix sheet but **not** this
  dialog, so an automated attempt is unjudgeable rather than failing.
- `pnpm lint`, `typecheck`, `test`, `build` and `context:cost` all green.

### 38 Accessibility pass

Audit authenticated terminal pages and both themes, then fix the findings. Earlier Lighthouse
runs reached the login redirect rather than the terminal, and `audit:a11y` loaded only the
default theme. Those results could not establish terminal or light-theme accessibility.

**Measure before editing.** The audit output defines the work. Several planned fixes were
already present: `HoldingsTable.tsx` had an F38 comment, and nine components used signed
formatters. F37 also found that recorded causes had already been fixed, so do not treat an old
list as proof of a current defect.

**UI:**

- `OPEN` order status moves from `text-brand` to `text-info` in `OrdersTable.tsx` and
  `RecentOrders.tsx`. `--color-info` is already the `--color-ring` source and clears AA on both
  canvases; `OPEN` is informational, not a price direction, so `up`/`down` stay reserved for money.
- Every remaining `text-brand` **text** node is reclassed per the decision below. The decorative
  `aria-hidden` brand glyphs are exempt — they carry no text.
- A ⌘K / Ctrl+K hint beside the watchlist search input.

**Logic:**

- **`pnpm audit:a11y:axe` (new, `scripts/audit-a11y-axe.mts`)** — the authenticated, both-themes
  audit. Clones `audit-overflow.mts`'s harness: headless Brave, cookie-borne session,
  stale-redirect detection, and a load check on `304 || 2xx`. **axe-core is resolved _through_
  `lighthouse`**, as that script resolves `puppeteer-core` — axe-core 4.13.0 is already on disk as
  lighthouse's transitive dependency, so this costs **no new dependency** and
  `code-standards.md`'s approved list is untouched. No widths loop: axe is width-independent, so
  five viewports would be five times the work for no extra coverage.
  - `axe.run({ runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] } })`,
    injected via `page.evaluateHandle` with `axeCore.source` (shape confirmed against Context7).
  - Reports `id`, `impact`, `help`, `helpUrl` and each node's `html` and `target` — the offending
    element is the finding, for the same reason the overflow guard names offenders.
  - **Exits non-zero on `serious` or `critical` only.** `moderate` and `minor` print as notes, so
    the guard lands green today without claiming the app is perfect.
  - `A11Y_AXE_COOKIE` **fails rather than skips** when absent, like `OVERFLOW_GUARD_COOKIE` and
    `test:parity`; `A11Y_AXE_PUBLIC_ONLY=1` accepts public-only coverage deliberately.
  - **The ⌘K assertion lives in this script too**, not a second one: it is the only place with a
    session, a theme and the stale-redirect handling already plumbed, and two copies of that would
    drift. Once per run when a session exists, on `/dashboard` at 1280px —
    `keyboard.down('Meta')` → `press('KeyK')` → `up('Meta')`, then read `document.activeElement`.
    **CDP input is trusted**, unlike the synthetic DOM events `constraints/verification.md` warns
    about, so a pass here is conclusive; a failure gets re-checked with real input before being
    called a bug (shape confirmed against Context7 `/puppeteer/puppeteer`: modifiers do affect
    `press`).
- Fix terminal findings at every impact level, even though the guard fails only on `serious`
  and `critical`. This lower exit threshold lets the guard remain enabled and usable. It has a
  clear limit: regressions in `moderate` or `minor` findings remain notes until the threshold
  is tightened.
- Report the findings before changing components. A code read alone did not identify the actual
  failures: headings already used `h1` followed by `id`-bearing `h2`s, all five terminal tables
  had labelled focusable regions with `relative`, and `ReportsFilter` had `htmlFor` labels. The
  unmatched `overflow-x-auto` belonged to the `Table` primitive in `ui/table.tsx:9`, used only by
  the unaudited `/dev/styleguide` route.
- **Keyboard:** the search shortcut focuses the inline `CommandInput` in the watchlist rail.
  **Scoped to `lg` and up**, because search is an inline `<Command>` in `WatchlistSidebar`, not the
  unused `CommandDialog`, and F37 put the rail at `lg`. Below that the input is inside the sheet,
  and opening a Radix dialog programmatically hits the F25 focus-restore trap for a convenience;
  the sheet trigger is already a focusable button reachable by Tab, so nobody is stranded.
- **Already fixed, do not redo (1.00.01):** the muted-token failures found across F04–F08. Both
  tokens now flip in `.light`, and `theme-tokens.test.ts` computes every foreground/surface ratio
  in both themes and asserts AA plus the `muted < muted-strong < body` hierarchy. **Do not remove
  those assertions** — `pnpm audit:a11y` cannot see the light theme, so they are the only thing
  guarding it.
- **Already fixed, do not redo (Phase 5):** colour is not the sole carrier of P&L sign.
  `formatSignedCurrency` / `formatSignedPercent` render an explicit +/− and nine components call
  them; `HoldingsTable.tsx`'s `toneOf()` already cites this pass by name.
- Restrict `text-brand` to dark surfaces. Yellow text measures 11–13.5:1 on dark surfaces but
  only **1.37–1.43:1 on light**, below even the 3:1 minimum for large text. F02 requires
  `--color-brand` to remain identical across themes, so use `text-ink` for figures and headings
  and brand for CTA backgrounds. The old count of "4 elements on `/legal`" missed the light theme and
  terminal: F35 also exposed the `TopNav` wordmark and `OPEN` in two tables in a light terminal.
- **`pnpm audit:a11y` only ever loads the default theme**, so a clean score is never evidence about
  light mode.
- **Measure a theme by loading it, never by toggling the class from script.** Elements carrying
  `transition-colors` return stale computed colours after a scripted class change — that produced a
  17-failure phantom during 1.00.01 which vanished on a real page load. Set the stored theme,
  reload, then measure.
- **The light-theme _terminal_ pass needs `profiles.theme = 'light'` on the signed-in account.**
  F35 has the layout apply the stored account theme client-side on every full load, so a
  `localStorage` value the script sets is overridden back. The honest run is two passes with the
  Settings toggle flipped between them. Marketing pages have no account theme, so `localStorage`
  alone works there.

**Verify:**

**Recorded result: both audit halves verified on 2026-09-13.** In dark and light themes,
`pnpm audit:a11y:axe` reported `14 of 14 routes audited` and exited 0. Neither run printed a
`note [moderate]` or `note [minor]` line. The keyboard-only order flow remained deferred alongside
F37's submit check; the follow-ups below retain the limits of that result.

The terminal audit found four problems the code review had not predicted: critical
`aria-valid-attr-value` and serious `color-contrast` findings on all eight routes,
`link-in-text-block` on `/funds`, and `nested-interactive` on `/stocks/*`.

The planned `OPEN` change to `text-info` above was superseded before the audit. That token measured
4.30:1 on `--color-surface`, so the public half instead used `text-brand light:text-muted-strong`.
Both affected components explain the choice in comments. The final colour choice was measured.

- ✅ `pnpm audit:a11y:axe` exits 0 on a dark pass **and** a light pass over the **6 public routes**.
  The light pass is the first time that theme has ever been audited, and it found all six failing
  before the fix. Read the printed route count: a run covering only the public half prints
  `(public routes only)`, which is what these two runs printed.
- ✅ **The same two passes across all 14 routes**, dark and light, both printing
  `14 of 14 routes audited` in the trailer — not merely exiting 0, which a public-only run also
  does. **Both passes were red first and are green only after the fixes below**, which is what
  makes them evidence rather than a formality.
- ✅ **Zero violations at any impact level on the 8 terminal routes** — neither final run printed a
  `note [moderate]` or `note [minor]` line for any route, so the remediation scope agreed for this
  feature is met and not merely the `serious`/`critical` exit threshold.
- **The four findings and what each needed:**
  - **`aria-valid-attr-value` (critical, all 8 routes).** `WatchlistSidebar` rendered `CommandList`
    only when a query existed, while cmdk's `CommandInput` always emits `aria-controls` at it — a
    dangling reference, on every route, because the rail is in the layout. The list now stays
    mounted and hides; its children stay conditional so `CommandEmpty` cannot announce "no match"
    against an empty box.
  - **`color-contrast` (serious, all 8 routes)** — the finding this feature existed to catch. See
    the token split recorded in `constraints.md` → Theming. `--color-destructive` was a second,
    separate cause: it bridged onto the _fill_ red and measured **3.12:1** behind Cancel on
    `/orders`, `/funds` and `/settings`.
  - **`link-in-text-block` (serious, `/funds`).** `LedgerTable`'s symbol link is the only one in
    the app sharing a cell with other text, so it takes a persistent underline per F04; the same
    class in the other four tables sits alone in its cell and correctly stays hover-only.
  - **`nested-interactive` (serious, `/stocks/*`).** Lightweight Charts injects its attribution
    anchor inside the `role="img"` container. `attributionLogo: false` removes it — and **the
    licence still requires that link**, so `StockChartCard` renders a named one outside the chart.
- ⏸ **Deferred — the full order flow on the keyboard alone.** It needs real input on an unoccluded
  window: `constraints/verification.md` is explicit that a dispatched pointer sequence opens the
  Radix sheet but **not** the order ticket, so an automated negative would be unjudgeable rather
  than failing. Pairs with F37's own deferred submit check, which is outstanding for the same reason.
- ✅ With `A11Y_AXE_COOKIE` unset it **exits 1** naming the 8 uncovered routes, rather than passing on
  half the app.
- ✅ With a deliberately corrupted cookie, all 8 terminal routes reported
  `redirected to /auth/login; the session cookie is stale`, the ⌘K check reported the same, the run
  exited 1 and the trailer read `6 of 14 routes audited`. A stale session cannot be a false pass.
- ✅ `grep -rn 'text-brand' src/` — every survivor is one of four `aria-hidden` decorative spans, and
  every text site carries a `light:` override. The light pass confirms no `color-contrast` violation
  **on the 6 public routes**; the 3 terminal sites (`TopNav` wordmark, `OPEN` in two tables) are
  covered by the terminal pass below, not by this one.
- ✅ `OrdersTable.tsx` and `RecentOrders.tsx` still print the word `OPEN`, so the token change cannot
  have removed meaning.
- ✅ ⌘K focuses the watchlist `CommandInput` on `/dashboard` at 1280px, printed as its own line in
  every run and passing in both themes — `✓ ⌘K focuses the watchlist search — "Search instruments
to add to your watchlist"`. CDP input is trusted, so this is conclusive.
- ✅ `pnpm lint`, `typecheck`, `test` (528, up from 522 — six new contrast assertions), `build` and
  `context:cost` green; `pnpm audit:overflow` clean over 70 checks (14 routes × 5 widths) _with_ a
  session; `pnpm audit:a11y` scores 100 on `/`, `/legal` and `/pricing`, each confirmed by reading
  `finalDisplayedUrl` out of the report rather than trusting the score (F05).

**Carried forward — recorded, not silently assumed:**

- ☐ **At this audit, three of the five dense tables had no populated-state coverage.** The account
  had no fills, so `/holdings`, `/positions`, `/reports` and the dashboard's Recharts donut were
  audited only as empty states. `/orders` and `/funds` had rows: 7 open, 1 cancelled and 2 rejected
  orders, plus a 10-row ledger. Populating the remaining surfaces required an open session and
  fresh quotes; §5 rejects fills against the weeks-old stored quotes. The check was blocked on
  F16, parked until the project's end. **The F38 result establishes nothing about those four
  populated surfaces.** The later checkpoint below records the remaining coverage follow-up.
- ☐ **The destructive button's dark hover state measures 4.09:1.** `hover:bg-destructive/20`
  lightens the background toward the text colour. axe does not exercise hover, so no passing
  audit covers this state. Fixing it would have changed the terminal's dark red to pale pink
  `#fba6b2`; the issue was deliberately left open.
- ⏸ **The keyboard-only order flow** stays deferred, with F37's 375×667 submit check, for the
  reason `constraints/verification.md` gives: a dispatched pointer sequence opens the Radix sheet
  but not the order ticket, so an automated negative would be unjudgeable rather than failing.

### 39 Deploy

Publish the web application on Render using the existing Supabase project. Verify the public
origin, sign-in redirects, health checks and handling of secrets on the deployed build.

**Logic:**

- Render web service: build and start commands, Node version pinned, environment variables set.
- ~~Supabase production project migrated and seeded~~ — **there is no separate production project
  and must not be.** One project was the decision at 1.00.03, precisely so one could not pause
  while the other stayed warm; see `constraints.md` → Environment and secrets. What remains here is
  updating the Google OAuth redirect URLs for the Render origin.
- `pg_cron` job scheduled against the production Edge Function.
- `/api/health` returning build and database status. **Done (6.39.01).** It calls
  `health_check()`, a `security definer` function returning a boolean and a timestamp, because
  `anon` can read no table in this schema and `constraints/security.md` forbids granting it one.
  200 when the database answers, 503 when it does not, never a Postgres message in the body, and
  no service-role client on an unauthenticated path. **This is also the keep-warm probe** — the
  request has to reach Postgres to count as activity against the free tier's idle timer, which is
  why it reads a table rather than returning a constant.

**Verify:**

**Recorded deployment check: 2026-09-13 at <https://zerodha-rebuild.onrender.com>.** The results
below were recorded at deployment. The `pg_cron` item remained deferred in this block; F40 later
records evidence about the existing schedule. This is not a fresh deployment verification.

- ✅ A cold visit to the Render URL loads and signs in successfully. All six public routes answer
  200, and `/dashboard` without a session 307s to `…onrender.com/auth/login?next=%2Fdashboard` —
  the proxy guard active, on the right origin, with `safeNext()` preserving the destination.
- ⏸ **Cannot pass yet: `cron.job_run_details` showing runs while the web service is asleep.** There
  is no `pg_cron` job, because there is no deployed `market-tick` to call — that is **F16**, parked
  to the end of the project. On production today nothing refreshes quotes and nothing matches limit
  orders. **Do not tick this at the Phase 6 checkpoint**; it closes with F16.
- ✅ Placing an order on production behaves exactly as locally, proven with both a BUY and a SELL
  MARKET order on a Sunday: both `REJECTED` with `MARKET_CLOSED`, both written as rows rather than
  rolled back (§4), `blocked_margin` 0.00, and **no ledger row** — cash and used margin byte-identical
  before and after, with identities 1, 3 and 8 re-checked. The CNC SELL rejected on `MARKET_CLOSED`
  rather than `NO_HOLDING`, which is the correct precedence. **What this actually proves is the
  production half** — Server Actions execute on Render, the session carries `auth.uid()` into
  `place_order`, RLS admits the right user — since local and production share one Supabase project.
- ✅ The locally built `.next/static` and `.next/server` contained none of the service-role key,
  Twelve Data key or `TEST_DATABASE_URL`, checked by searching for their values. **Limit that
  search to these two directories.** Searching all of `.next` finds the loaded environment in
  Turbopack's `.next/cache/`, which is gitignored and not deployed; that is not evidence of a
  deployed bundle leak. Repeat the search on the deployed build, since this result covered a
  local build only.

### 40 README, demo, and handoff

Prepare the documentation and screenshots a visitor or new developer needs to understand and
run the project. At the start of F40, `README.md` contained 16 bytes and `public/` was empty;
the plan below records the handoff built from that starting point.

**Logic:**

- Write the README for a recruiter opening the project first: a short introduction and live
  link, hero screenshot, Features, plain-language "How it works", grouped tech stack and an
  accurate data-source explanation. The simulator is the whole chain by decision; every quote
  says `SIMULATED`. `LIVE` cannot be produced by the provider definitions, and `DELAYED` does
  not occur with the configured simulator. Put the Mermaid diagram, five central invariants
  and test tiers farther down for technical readers.
- Put setup instructions, commands, environment variables and deployment notes in
  `docs/SETUP.md`, linked from the README. Keep this human setup guide outside `context/`, whose
  files are loaded selectively by agents under a token budget. Sessions that do not run the app
  should not have to load setup instructions.
- **Seven badges, all verifiable claims.** No `build: passing` and no coverage badge: there is no
  CI, and a green badge over a repo with no pipeline is the same overclaim as a `LIVE` chip over a
  polled endpoint.
- The stack renders **without version numbers**. `package.json` and `src/lib/stack.ts` already hold
  them under a bidirectional drift test; a third copy in the README has nothing keeping it honest.
- ~~A seeded demo account with a varied portfolio~~ — **not built; the proposed approach is
  incompatible with the project rules.** Only `execute_order` creates holdings, and it requires
  an open NSE session and a non-stale quote. Inserting a portfolio directly would violate an
  `architecture.md` invariant. Google OAuth also provides no shared credentials to give a
  visitor. Use screenshots and the live Render URL as the demo. Reset the account to its
  post-signup state so the handoff begins from a state readers can reproduce.
- `scripts/capture-screenshots.mts` — **nine** shots regenerated by one command, into
  `docs/screenshots/`. **Four of them are empty until the account has traded** — Holdings,
  Positions, Reports and the Dashboard donut all come from `execute_order`, which needs an open NSE
  session. They are captured anyway rather than split into a second script: the same command re-run
  during a session fills the same files. **The README references a shot once it has something in
  it**: six after the 2026-09-17 capture, with Positions out until an MIS order is placed.
- **Done 2026-09-17, except Positions: re-run the capture during a trading session** (Mon–Fri
  09:15–15:30 IST) after placing ~10 CNC and 2 MIS orders, then add Holdings, Positions, Reports and
  the re-shot Dashboard to the README grid alongside `home.png`. The account was reset on
  2026-09-13, a Sunday, so the portfolio screens were unshootable that day. Until then the hero
  image shows an untraded account.
- The script clones `audit-overflow.mts`'s skeleton: `puppeteer-core` resolved _through_
  `lighthouse`, Brave via `CHROME_PATH`, session from `OVERFLOW_GUARD_COOKIE`, and its
  landed-route guard so a bounce to `/auth/login` fails the run instead of photographing it.
  Asserts the theme it actually got, per F38.
- Capture the order ticket with `page.mouse`. A dispatched pointer sequence does not open it
  (`constraints/verification.md`), while Puppeteer's mouse sends trusted DevTools input and does.
  Wait for `[role="dialog"][data-state="open"]` before capturing. If the click opens nothing,
  fail the run rather than save a shot of the page behind the dialog. This replaces the original
  manual-capture plan.
- ~~Repository links from About and the footer~~ — **already shipped.** `REPOSITORY_URL` in
  `nav-links.ts`, rendered by `SiteFooter`, `HowItWasBuilt` on About and `SupportContact` on
  Support, all through the shared `ExternalLink`. Nothing to do.
- Correct `progress-tracker.md`, which claims nothing schedules quote refreshes or limit-order
  matching on production. `cron.job` holds an active per-minute `market-tick` and
  `cron.job_run_details` records 7,200 successful runs, the last on 2026-09-11 at 10:59 UTC.

**Verify:**

- The account is at its post-signup state: `available_cash = 100000.00`, `used_margin = 0`,
  exactly one `SIGNUP_CREDIT` ledger row, and zero rows in `orders`, `trades`, `holdings` and
  `positions`.
- `pnpm capture:screenshots` writes nine files into `docs/screenshots/` and is idempotent on a
  second run. A session that fails to reach a terminal route fails the command.
- Every command `docs/SETUP.md` names exists in `package.json`, and every variable its table names
  exists in `.env.example` — both compared by script, not by eye, since setup docs are exactly what
  nobody re-reads. ~~A clean clone can be brought up following only the README~~: setup moved out
  at the developer's direction, so the property now belongs to `docs/SETUP.md`, which the README
  links to.
- Every anchor link in the README resolves to a real heading. A `<summary>` generates no anchor on
  GitHub, which silently broke the tests badge the first time; the check is a script, not a click.
- ~~The demo account shows a populated dashboard with at least ten holdings~~ — **unreachable by
  construction**, see above. Dropped rather than faked.
- No secret in `README.md` or `docs/`: the two-stage credential grep.
- No README copy describes prices as live, real, or provider-fetched (6.00.04).
- `pnpm lint`, `pnpm typecheck`, `pnpm format:check` and `pnpm test` all pass.

### Phase checkpoint

To close Phase 6, run the full production journey: sign up, trade, reset and sign out. Compact
the build journal and promote every constraint that still applies. The dated run below records
which checks passed and which remained open; it does not close the checkpoint.

**Recorded run: 2026-09-24, Thursday after the market close.**

- ✅ All four test tiers: 534 tier-1, 26 pgTAP suites, 10 race tests, 36 parity tests. `lint`, `typecheck`, `format:check` and `build` pass.
- ✅ Production: `/api/health` 200 with `database: reachable` and `commit` equal to HEAD (`4419f55`); six public routes 200; an unknown route 404; `/dashboard` 307 to `/auth/login?next=%2Fdashboard`.
- ✅ Phase-diff `code-review` over `b08a121..HEAD`: ten candidates, four real bugs fixed, two rejected after checking, two filed below, two already known.
- ✅ Journal compacted; two lessons promoted to `constraints/verification.md`; two dead constraints removed or corrected; the stack table matches `package.json` by script.
- ☐ **Regression legs that need the developer:** sign up with a fresh Google account, then place a CNC and an MIS market order during a session (Mon–Fri 09:15–15:30 IST), then reset and sign out. A market order after the close is correctly rejected `MARKET_CLOSED`, so the trade leg can't pass tonight.
- ☐ The four review fixes are verified by lint, typecheck, build and tests, not yet in a browser. The `lg`–`xl` sheet change and the stock page's throw are worth a look during the same session.

**Follow-ups, filed rather than fixed:**

- `/api/health` uses the cookie-bound server client. If a browser cannot refresh its session, the stale JWT makes the probe return 503 `unreachable`. Render and schedulers send no cookie and are unaffected. The proposed fix is a cookieless anon client in `src/lib/supabase/`.
- `audit-overflow.mts`, `audit-a11y-axe.mts` and `capture-screenshots.mts` each copy the cookie parsing, the puppeteer-through-lighthouse resolution and the Brave path, and the axe script reads the same cookie as `A11Y_AXE_COOKIE`. A shared `scripts/lib/browser.mts` and one variable name would remove both.
- An axe pass over Holdings, Reports and the donut now that they have rows; Positions still has none.

---
