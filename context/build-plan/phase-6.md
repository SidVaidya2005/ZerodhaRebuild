> **One phase of `context/build-plan.md`.** That index carries the Core Principle and the phase list.
> **Read only the phase you are building.** A finished phase is history — its still-binding decisions
> live in `constraints.md`, its narrative in `build-journal.md`, and re-reading it here costs tokens for nothing.

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
