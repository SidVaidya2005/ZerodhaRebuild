> **One phase of `context/build-plan.md`.** That index carries the Core Principle and the phase list.
> **Read only the phase you are building.** A finished phase is history — its still-binding decisions
> live in `constraints.md`, its narrative in `build-journal.md`, and re-reading it here costs tokens for nothing.

## Phase 6 — Polish & Ship

### 36 States, skeletons, and error boundaries

Every terminal route streams a skeleton while its data loads and catches a failed read with a
boundary whose retry actually refetches. The enabling change is that the six terminal pages and the
terminal layout **stop swallowing read failures**: today each logs the error and falls through to the
empty state, so a broken query and an empty account render the same pixels — the pages' own comments
name this ("exactly how a broken read hides behind a plausible empty state"). After this, an empty
state means empty and a boundary means broken. `global-error.tsx` closes the last uncaught case, an
error thrown by the root layout itself.

**UI:**

- A `loading.tsx` skeleton for every data-loading route segment, shaped like the content it replaces — the eight `(terminal)` segments plus `(terminal)/loading.tsx` for the shell. Marketing pages are statically rendered and fetch nothing, so they get none.
- Skeletons compose from shared primitives in `src/components/terminal/skeletons/` (`PageSkeleton`, `TableSkeleton`, `SummaryCardsSkeleton`) over the existing `components/ui/skeleton.tsx`, rather than eight bespoke copies that drift from the pages they mirror. No new dependency.
- An `error.tsx` for every terminal segment, each a thin `'use client'` wrapper over one shared `TerminalErrorBoundary` so the per-segment rule costs eight small files rather than eight copies.
- `src/app/global-error.tsx`, which replaces the root layout entirely and therefore declares its own `<html>`/`<body>` and imports `globals.css` itself. It cannot reach the `next/font` variables or the `next-themes` class the root layout sets, so it renders in the dark palette — correct here, since the tokens are dark-by-default on `:root` and `.light` is the override.
- Reviewed empty states across watchlist, holdings, positions, orders, ledger, and reports. **Largely already present** — `LedgerTable`, `TradeHistoryTable` and `WatchlistSidebar` carry them including past-the-end branches, and Dashboard, Holdings and Positions have components — so this is a review plus filling the Orders gap, not six new components.

**Logic:**

- The six terminal pages and `(terminal)/layout.tsx` log the read error as they do today and then **throw**, so the boundary catches it.
- **A layout's own `error.tsx` does not catch its own throw**, so a failed watchlist or universe read surfaces at the *root* boundary as a chrome-less full-page error rather than a terminal-shaped one. Accepted: the sidebar is part of the shell, so a shell that cannot load is not a working terminal.
- `stocks/[symbol]` keeps `notFound()` for an unknown symbol; only its read *failures* throw.
- **Boundaries use `retry`, not `reset`.** Verified against Context7: Next.js passes `error`, `reset` **and** `retry`; `retry()` calls `router.refresh()` internally *and* resets the boundary, while `reset()` only resets it — so on a page whose server-side read failed, `reset` re-renders the same failed payload and ships a retry button that visibly does nothing. `src/app/error.tsx` currently uses `reset` and is corrected in the same change.
- `code-standards.md`'s loading/error rule stops saying "not yet true, and F36 owns it"; `library-docs.md`'s Next.js 16 section gains the `error.tsx` props finding, which it does not currently cover.

**Verify:**

- Throttled to Slow 3G, every terminal route shows a skeleton rather than a blank frame. Read `document.visibilityState` before believing the result — a backgrounded tab freezes animations and makes this unjudgeable rather than failing (`constraints/verification.md`).
- Forcing a query failure renders the boundary, and its retry recovers the page once the failure is reverted. **Falsified first**: the same forced failure renders the *empty state* on the pre-F36 code, which is the defect this feature closes.
- A brand-new account sees a purposeful empty state on the four surfaces that *are* empty for it — holdings, positions, orders and reports. **Two of the six cannot be empty for a new account, and the original wording was wrong:** bootstrap seeds a default watchlist (F13) and every account carries a `SIGNUP_CREDIT` row, so the watchlist and the ledger are non-empty by construction. Their empty states exist and are correct, but are reached by a user who empties them, not by a new account. Check all six exist; expect four to render.
- `find src/app/\(terminal\) -name error.tsx | wc -l` is 8 and `-name loading.tsx` is 9, so the `code-standards.md` rule is structurally true rather than asserted.
- `pnpm test`, `typecheck`, `lint`, `format:check` and `build` all green.

### 37 Responsive pass

Close the navigation gap below `lg`, make the order ticket survive a short viewport, and put a
guard under the no-horizontal-overflow property so it stays true.

**The two causes this section used to record are fixed.** Re-measured before planning, on two
independent mechanisms that agree — an in-page iframe harness and headless Brave — every route
reports `scrollWidth === clientWidth` at 375px, 768px and 1440px. The `sr-only` label no longer
escapes its scroll region (every wrapper carries `relative`, and each table says why), and the
header no longer overflows (the wordmark is `hidden … sm:block`, which was the cause). Phase 5
fixed both in passing. What is left is navigation, and it is worse than recorded.

**Below 1024px there is no page navigation at all.** The header nav is `lg:flex`, the hamburger
opens the watchlist rather than the menu, and `AvatarMenu` holds only Settings and Sign out — so
at 375px not one of the six destinations is reachable without typing a URL, and at 768–1023px only
`/dashboard` is, through the wordmark. **Lowering the nav's breakpoint is ruled out by
measurement:** at 768px the header bar has ~106px spare and the nav needs 404px.

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
- **The desktop nav moves from `lg` to `xl`, which was not in the plan.** Measuring the two new
  breakpoint boundaries found a **pre-existing** 202px sideways scroll on every terminal page from
  1024 to ~1226: the six links need 404px and the right-hand cluster 442px, and `lg:` brought both
  into a 1024px bar. Proven pre-existing by stashing F37 and rebuilding — the baseline overflows by
  the identical 202px, from the identical element. Below `xl` the sheet carries the links, which is
  what made raising the breakpoint an option rather than a regression.
- `DialogContent` gains `max-h-[calc(100dvh-2rem)] overflow-y-auto`. It is `fixed` and
  `-translate-y-1/2` with no max height, so a dialog taller than the viewport is clipped at both
  ends with no way to scroll. Fixed in the primitive rather than at the order ticket, because
  `ModifyOrderDialog` and `ResetAccountDialog` carry the identical hazard.

**Logic:**

- `WatchlistPanel`'s `h-full` becomes `min-h-0 flex-1`. With a sibling above it in the sheet's
  flex column, `h-full` claims the whole sheet and pushes the watchlist off-screen — the same
  failure this file already records for `Command`'s base `h-full`.
- `scripts/audit-overflow.mts` behind `pnpm audit:overflow`: every route at 375, 768 and 1440,
  failing on `scrollWidth > clientWidth` and naming the widest offending element so a failure is
  actionable. Standalone rather than a `test:all` tier, because it needs a running server —
  exactly like `audit:a11y`, which is also outside `test:all`.
- **`puppeteer-core` resolves through `lighthouse`**, so the guard adds no dependency:
  `createRequire(require.resolve('lighthouse'))` reaches it. A direct `require.resolve` fails
  under pnpm's isolation, and hardcoding the `.pnpm/puppeteer-core@<version>` path would break
  silently on a lighthouse bump.
- Terminal routes need a session and headless Brave has none, so the guard replays a cookie from
  `OVERFLOW_GUARD_COOKIE` and **fails rather than skips** when terminal routes are requested
  without it — `test:parity`'s behaviour without `TEST_DATABASE_URL`. Public routes always run.

**Verify:**

- `pnpm audit:overflow` exits 0 across every route at 375, 768, 1024, 1280 and 1440px.
- The guard can fail: inject a `w-[2000px]` element, confirm it names the route, the overflow and
  the offending element, then revert.
- The guard cannot *false*-pass on a stale session: a garbage `OVERFLOW_GUARD_COOKIE` must report
  every terminal route as redirected, not as narrow. Falsifiable without handling a real token.
- All six destinations are reachable below `xl` with `aria-current` on the active link, and at
  `xl` and above the header nav shows and the trigger is gone.
- The order ticket can be completed end to end on a 375×667 viewport. Drive this with real input
  on an unoccluded window: a dispatched pointer sequence opens the Radix sheet but **not** this
  dialog, so an automated attempt is unjudgeable rather than failing.
- `pnpm lint`, `typecheck`, `test`, `build` and `context:cost` all green.

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
