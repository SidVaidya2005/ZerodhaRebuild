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
- A brand-new account — `reset_account()` from `/settings` — sees a purposeful empty state on all six surfaces.
- `find src/app/\(terminal\) -name error.tsx | wc -l` is 8 and `-name loading.tsx` is 9, so the `code-standards.md` rule is structurally true rather than asserted.
- `pnpm test`, `typecheck`, `lint`, `format:check` and `build` all green.

### 37 Responsive pass



**UI:**

- Watchlist becomes a bottom sheet or drawer on mobile.
- Dense tables scroll horizontally inside their own container; the page body never scrolls sideways.
- The order ticket is usable one-handed at 375px.
- **Already measured, still open — `/orders` scrolls sideways by 365px at 375px, from TWO independent causes.** Re-measured at the Phase 4 checkpoint inside a 375-wide iframe (`resize_window` is a no-op in macOS fullscreen), which corrected the earlier single-cause reading:
  1. **An `sr-only` span escapes the table's scroll region — the larger cause, and the one previously missed.** The visually-hidden "Actions" column label sits in a `<th>` at the right edge of a `min-w-[720px]` table. `.sr-only` is `position: absolute`, the `<th>` is not a containing block, and the `div.overflow-x-auto` wrapper is not positioned either — so the span resolves against the initial containing block, **escapes the clipping the overflow region would otherwise apply**, and lands at document x=735. That alone pushes `documentElement.scrollWidth` to 736 against a 371px viewport. Setting `position: relative` on the `<th>` drops it to 475 and the sideways scroll from 365px to 104.5px, confirming the mechanism. **This is the general hazard, not an `/orders` quirk, and it is measured rather than inferred:** `/holdings` has it too and worse — its `sr-only` `<th>` label sits at document x=896 against a 375 viewport, giving **521px** of sideways scroll, because that table is 880 wide rather than 720. Its own scroll region is correct in every other respect (343 clientWidth containing 880, `tabIndex=0`, `role="region"`, labelled "Holdings, scrollable"), which is exactly the point: a correct region does not contain an absolutely-positioned child that has no positioned ancestor. Any `sr-only` element inside a wide table in an unpositioned `overflow-x-auto` container does this, so every table F31, F33 and F34 add needs the same containing block. Fix both pages together, and prefer fixing it where `.sr-only` and the scroll wrapper are defined rather than per-`<th>`.
  2. **The terminal header overflows by 104px.** `header.scrollWidth` 475 against 371, from the `ml-auto flex items-center gap-3 lg:ml-0` cluster carrying the market-status pill, the data-source badge and available cash. It lives in the `(terminal)` layout, so this one affects **every** terminal page.

  The earlier note recorded only cause 2 and stated that F27's own table was not at fault. That was half right and misleading: the `overflow-x-auto` region does contain its 720px table correctly (339 wide, 720 scrollWidth, `tabIndex=0`, `role="region"`, labelled — all verified), but the sr-only span inside it does not stay in the region. Fixing only the header would have left 365px of the 469px problem in place. (F27, re-measured at the Phase 4 checkpoint)

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
