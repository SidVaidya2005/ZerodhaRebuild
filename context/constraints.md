# Standing Constraints

> **Role:** What still binds — the decisions and non-obvious facts that constrain future work, grouped by topic.
> **Read before any decision that might conflict with past work.**
> **Relates to:** receives decisions displaced from `progress-tracker.md` and decisions promoted out of `build-journal.md` at phase checkpoints.

## How this file is maintained

This file is read **every session**, so every line costs on every session. It is the one place where
brevity is a hard rule rather than a preference.

- **One or two sentences per bullet:** the rule, and the reason it exists. Worked examples, measured transcripts, and the story of how something was found belong in `build-journal.md`. Git history holds anything trimmed from here.
- **Grouped by topic** (auth, theming, accessibility…), never by date. Add a `##` heading when a new topic is needed.
- **Core plus reference halves.** A topic that binds only one kind of work lives in `context/constraints/<topic>.md` behind a trigger in `CLAUDE.md`, leaving a `##` stub here pointing at it; a topic that binds every change stays in this file. Adding a bullet means asking which side it belongs on — the wrong side is billed on every session, or never read at all.
- **Holds only what still binds.** Never a narrative of what happened — that is the journal's job.
- **Two things feed it,** both moves and never copies: the oldest bullet of `progress-tracker.md` → Key Decisions when that section would exceed 10, and each phase's still-binding decisions promoted out of `build-journal.md` at the phase checkpoint.
- **Cite the feature each bullet came from,** e.g. `(F02)`.
- **Deduped on write.** A new constraint that supersedes one already here replaces that bullet in place.
- **Removed only when verifiably dead** — reversed by a later decision, or the thing it describes no longer exists. A sequencing decision that has since been carried out is dead; a rule the code still depends on is not.
- **Don't restate `trading-contract.md`.** It is authoritative and always read. Where a bullet exists only to explain why the contract says what it says, keep the reason and point at the section.

## Build plan sequencing

- **A feature straddling a phase boundary ships as lettered slices under one number**, as F07 did (A in Phase 1, B after F09). Renumbering invalidates every journal and commit reference already written. (F07, F08)
- **The market-status pill recomputes on a client timer**, because server-rendering it once leaves a tab open past 15:30 still reading OPEN. The server passes the holiday set as a `string[]` and a client component calls the same pure `marketStatusAt` the tick gates on. (F17)
- **Watchlist search filters a preloaded universe in `cmdk`** — no trigram index, no migration, no round trip per keystroke. 200 rows is ~12KB and Postgres seq-scans a table that small whatever index sits on it. (F18)

## Environment and secrets

- **There is exactly one Supabase project and it is the real one:** `zerodha-rebuild-dev` / `kefggygenlprjzhiocai` / ap-south-1, in a separate account the workspace MCP cannot see — the CLI authenticates by personal access token. A second test project was deliberately deleted: one project cannot silently pause while the other stays warm. (F08, revised 1.00.03)
- **`pnpm db:push:test` does not exist and must not be reintroduced.** One database means one push command, and `pnpm supabase db push` already is it. (F09)
- **`TEST_DATABASE_URL` must use the session-mode pooler, port 5432.** Tier 3 holds a transaction open across statements, which transaction-mode pooling on 6543 structurally cannot express. The port is load-bearing. (1.00.03)
- **The seed authenticates as the service role**, not through a test connection string. `instruments` and `market_holidays` grant `select` only, and seeding reference data is the administrative act that key exists for. (F14)
- **Environment validation is split across two modules:** `env.ts` for the `NEXT_PUBLIC_*` values, and `env.server.ts` carrying `import 'server-only'` so a client import of the service-role key fails the build. `register()` forces validation at boot and Next skips it during `next build` — `build` stays green without secrets while `dev` and `start` fail by name. (F01)

## Dependencies

- **TypeScript is pinned to 6.0.3 and ESLint to 9.39.5**, both below latest: `typescript-eslint` refuses to load against the TS 7 API, and `eslint-plugin-react` 7.37.5 crashes on ESLint 10's rule-context API. Each breaks `pnpm lint` outright; re-test when those upstreams ship support. (F01)
- **Dependencies are pinned exactly, with no caret ranges**, so `architecture.md`'s table, the lockfile and `package.json` can only diverge by a deliberate edit. (F01)
- **`lighthouse` is a pinned dev dependency** behind `pnpm audit:a11y`, landed in Phase 1 so every public page is audited as it ships rather than all at once at F38. (F04)

## Auth

- **The `(terminal)` layout checks the session once and pages trust it.** Every page beneath reads through RLS-scoped queries that return nothing without a session, so a per-page re-check buys nothing — and no future page can forget it. (F17)
- **Sign-in is initiated server-side, not from a browser client.** A `<form>` posts to a Server Action that calls `signInWithOAuth` and `redirect()`s, so sign-in works with JavaScript disabled and the PKCE verifier is written by the same client that reads it back. (F12)
- **The intended destination survives sign-in, guarded by a pure `safeNext()`** in `src/lib/auth/routes.ts` — it honours `next` only when it starts with a single `/`. The logic lives there rather than in `src/proxy.ts` because the proxy is unreachable from tier 1 and an open redirect must be testable. (F12)
- **The signed-in identity and sign-out control live in the terminal, never the public header.** Reading a session in the marketing header would force dynamic rendering on every public page and break the session-free `(marketing)` boundary. (F12)
- **All four Supabase clients ship together, `admin.ts` included**, so its `import 'server-only'` guard is observed failing a build rather than assumed. (F12)
- **Signup is the only path that ever creates an account.** The trigger on `auth.users` fires only on insert, so an orphaned user is deleted and re-created rather than backfilled. (F13)

## Security and RLS

**Moved to `context/constraints/security.md`** — read before a migration, a grant, an RLS policy or a `security definer` function. On demand, because RLS as *the* security boundary is already an invariant in `architecture.md`; what moved is the operational detail behind it.

## Money, orders, and the order engine

**Moved to `context/constraints/trading.md`** — read before touching money, an order, or a Postgres money function. Carries the charge and contract rationale, the order-entry rules, and the database-concurrency rules. On demand, because `trading-contract.md` stays always-read and remains authoritative for every money decision.

## Testing

**Moved to `context/constraints/testing.md`** — read before writing or debugging a test in any tier, alongside `code-standards/testing.md`. On demand, because none of it binds a session that writes no test.

## Verification routine

**Moved to `context/constraints/verification.md`** — read before driving a browser or trusting an automated check. On demand, because none of it binds a session that never opens one.

## Local development environment

- **HTTP 431 on `localhost:3000`** (see `CLAUDE.md` → Environment notes) **also silently kills Server Action POSTs**, not just document requests. Escape hatch if clearing the foreign `sb-*` cookies is impractical: `NODE_OPTIONS=--max-http-header-size=32768`. (F12)

## Supabase CLI

**Moved to `context/constraints/supabase-cli.md`** — read before a migration, a type regeneration or a function deploy. On demand, because none of it binds a session that never invokes the CLI.

## Accessibility

- **Lighthouse cannot audit any `(terminal)` page**, and `pnpm audit:a11y` only ever loads one theme. It carries no session, follows the redirect, and reports a perfect score for the login page — a 1.00 that says nothing about the page requested. **`pnpm audit:a11y:axe` is the answer to both**: a real session by cookie, a named theme, and it fails rather than skips without one. (Phase 3 checkpoint, answered F38)
- **A Lighthouse 100 is not evidence about tap targets** — target size is not in its audit set. `/support` scored 100 with every `<summary>` 20px tall, under WCAG 2.2's 24px minimum. Measure `getBoundingClientRect()` at 375px. (F07)
- **An `sr-only` element inside a wide table escapes its `overflow-x-auto` region and scrolls the whole page sideways**, because `.sr-only` is `position: absolute` and without a positioned ancestor is never clipped. **Every scroll wrapper carries `relative`.** (F27, F30; the last two holdouts fixed at the Phase 5 checkpoint)
- **Measure sideways overflow per page, not per component.** `documentElement.scrollWidth` against `clientWidth` on the page itself — F31's scroll region was focusable, labelled and `relative` while `/positions` still overflowed 94px, because the shared `TopNav` did. Re-measure every page after touching shared chrome. (F31, F30, F27)
- **Below 1024px the terminal has no page navigation at all; F37 owns the fix.** `TERMINAL_NAV_LINKS` is `hidden lg:flex` and the sheet trigger `md:hidden`, so 768–1024px has neither, and the sheet carries only `/stocks/*`. `terminal-routes.test.ts` proves each link is guarded, never that anyone can reach it. (F31, confirmed 2026-09-09)
- **The terminal wordmark is hidden below `sm`, and that is what makes the top bar fit 375px.** The burger, market pill, provenance badge, theme toggle and avatar need 333 of the 347px available; the wordmark's 109px is the only element there carrying no function, so it is what gives way. Do not re-show it without re-measuring. (F31)
- **A `role="combobox"` keeps its listbox mounted.** cmdk's `CommandInput` always emits `aria-controls` pointing at the list; rendering that list only when a query exists left the reference dangling — a **critical** axe failure on all eight terminal routes, because the watchlist rail lives in the layout. Hide the list, never unmount it. (F38)
- **A `role="img"` chart container must contain nothing focusable.** Lightweight Charts injects an attribution anchor inside it, which axe reports as `nested-interactive`. `attributionLogo: false` removes it — and **the licence still requires the TradingView link**, so `StockChartCard` renders a named one outside the chart. Do not set that option without keeping the link. (F38)
- **A horizontally scrollable region needs `tabIndex={0}` and a labelled `role="region"`**, or keyboard users cannot reach the overflowing columns. Lighthouse does not audit this; axe does. Applies to every table in Phase 5. (F05)
- **A dialog opened from a store restores focus itself; Radix cannot.** Radix returns focus to its `DialogTrigger`, and a dialog mounted once and opened imperatively has none. The store captures `document.activeElement` at the click and `onCloseAutoFocus` puts it back, guarding `isConnected`. Applies to every call site F31 and later add. (F25)
- **A Radix `DropdownMenuItem asChild` must wrap the interactive element, never a `<form>`.** The menu item handles Enter and Space with `event.currentTarget.click()`, and `HTMLFormElement.click()` has no default action — so a form-as-menu-item is mouse-operable and dead to the keyboard. (F17)
- **Recharts stamps `role="application"` on its SVG**, which hands a screen reader every keystroke and breaks browse mode. Pair every chart with a table carrying the same numbers and mark the chart `aria-hidden`. (F21)
- **Reorder ships as move-up / move-down, not drag.** Drag alone is unreachable by keyboard and the project has no drag-and-drop dependency; buttons write the same `sort_order`. (F18)

## Theming and design tokens

- **Every `dark:` utility is stripped from added components.** Tailwind v4 binds `dark:` to `prefers-color-scheme`, so a leftover `dark:` class follows the visitor's OS rather than this project's theme class. A grep guard enforces it. (F02)
- **Interpolated class names generate no CSS.** Tailwind scans source for complete strings, so `bg-chart-${n}` produces nothing. Write every variant out literally. (F02)
- **`cn()` silently deletes a custom type size when it meets a colour.** tailwind-merge cannot tell `text-number-sm` (a size) from `text-ink` (a colour) and drops one with no warning. `src/lib/utils.ts` declares the project's `--text-*` scale to `extendTailwindMerge`; **a size added to `globals.css` and not to that list starts disappearing.** (F19)
- **`theme-tokens.test.ts` computes AA ratios for the tokens in its `foregrounds` list** — against canvas, surface and surface-elevated in both themes — rather than trusting the eye. **A colour rendered as text but missing from that list is unguarded**, which is exactly how the trading pair shipped at 1.95:1 on light: it appeared only in `mustNotFlip`, which says nothing about contrast. Adding a text colour means adding it there. The muted tones invert in `.light`, because on a light ground "more prominent" means darker. (1.00.01, corrected F38)
- **The trading fills are not text colours.** `--color-up`/`--color-down` stay byte-identical across themes (F02) and are only ever a candle body, a filled button or a status dot; every price figure uses `--color-up-text`/`--color-down-text`, which **do** flip. The fills measure 3.72:1 on dark `surface-elevated` and as low as 1.95:1 on light. DESIGN.md §Trading Semantics specifies them as text and this deviates deliberately, as F04's links do. (F38)
- **Measure a text colour against the tint it sits on, not just the surface.** A `bg-up/10` badge and a `bg-destructive/10` button put the background ~10% nearer the text than the plain surface does, and both cleared the surface while failing the tint. (F38)
- **`text-brand` carries a `light:` override at every text site; the token itself never changes.** Brand yellow is 11–13.5:1 on dark and 1.37–1.43:1 on light, because F02's invariant keeps `--color-brand` byte-identical across themes — so the *class* becomes theme-aware instead: `text-brand light:text-ink`. Decorative `aria-hidden` brand glyphs are exempt. A new `text-brand` without a `light:` partner reopens a WCAG AA failure. (F06, resolved F38)
- **`--color-info` is not a text colour.** It is `#3b82f6` in both themes and fails AA for normal text on five of six surfaces — 3.68:1 on the light canvas and **4.30:1 on `--color-surface`**, the surface every table sits on. It clears AA only on the dark canvas. It exists as `--color-ring`; the proven text set is `ink`, `body`, `muted`, `muted-strong`. (F38)
- **`--color-muted` is for links, captions and column headers — never running paragraph copy**, which uses `--color-body`. The misuse also fails WCAG AA, and `--color-muted-strong` does not fix it; a real fix needs `.light` overrides for both and belongs to F38. (F04)
- **Validation errors are `text-body`, not `text-down-text`.** `--color-down` means "price fell" everywhere in the app. The red signal comes from the shadcn bridge instead, where `--color-destructive` maps onto **`--color-down-text`** — the text tier, not the fill, because `text-destructive` is the only foreground use in the codebase and the fill measured 3.12:1 behind the Cancel button. (F25, retargeted F38)
- **The `--color-chart-*` ramp is measured, not chosen**, and `chart-ramp.test.ts` holds it that way: it steps *lightness* as well as hue (ten categories are not separable by hue for a deuteranope), targets `--color-surface` for contrast, and uses **no green and no red at all** — green reads as "up" on a trading screen. (F21)
- **An aggregated `Others` slice takes the neutral, never a ramp colour** — it is drawn last, so `index % 10` would hand it chart-1 and the legend would show two identical swatches. (F21)
- **Inline links inside a text block carry a persistent underline**, deviating from DESIGN.md, because WCAG 1.4.1 forbids identifying a link by colour alone. Nav and footer links are not in a text block and keep hover-only. (F04)
- **The marketing footer is `bg-surface`, not DESIGN.md's always-light `#fafafa`.** That token already *is* `#fafafa` in the light theme, so the source value is reached through the token rather than hardcoded. (F03)
- **`profiles.theme` defaults to `'dark'`.** `architecture.md` said `light` and was corrected: the scope document specifies a dark-default terminal and outranks it. (F10)
- **Measure a theme by loading it, not by toggling the class from script.** Elements with `transition-colors` return stale computed colours after a scripted class change, fabricating failures that do not exist. (1.00.01)
- **`pnpm audit:a11y` only ever sees the dark theme**; the contrast assertions in `theme-tokens.test.ts` are what cover light. **Lighthouse also cannot audit the 404**, returning `ERRORED_DOCUMENT_REQUEST` for any non-200 document. (F06, F08)

## Formatting and display

- **Two money formatters, not one with flags.** `formatCurrency` always renders ₹ and 2dp; `formatSignedCurrency` renders an explicit +/− where the sign carries meaning. `Intl.NumberFormat('en-IN')` gives Indian digit grouping natively. (F02)
- **`formatPercent` is fixed at 2dp and is wrong for statutory rates** — it renders 0.00307% as "0.00%". `formatRate` (up to 5dp, no trailing zeros) exists for those. (F06)

## shadcn/ui

- **shadcn's token vocabulary is bridged onto this project's, never merged.** A `@theme inline` block maps their names onto our palette so `shadcn add` keeps working. `--color-muted` is the one real collision — shadcn means a *surface*, this project means the *text* grey — resolved in this project's favour. (F02)
- **The shadcn CLI needs `init -b radix -t next -p nova --css-variables -y`.** It picks between Base UI, Radix and React Aria and prompts for a style preset that `-y` does not skip. `shadcn` is also a *runtime* dependency shipping `shadcn/tailwind.css`. (F02)
- **Overriding a variant-prefixed utility needs the same prefix.** `SheetContent` sizes itself with `data-[side=right]:w-3/4`; a plain `w-full` loses on specificity and `tailwind-merge` keeps both, so the class list looks right while the width is wrong. Only measuring exposes it. (F03)
- **`components/ui/table.tsx` is a Client Component**, so importing it puts a hydrated boundary on the page. Marketing tables use a plain semantic `<table>`; the terminal is where the primitive earns its cost. (F05)
- **The watchlist rail lives in the layout beside `<main>`; only the sheet trigger lives in the nav.** One component rendering both shells put the 288px `aside` inside the header's 64px flex row. `WatchlistRail` and `WatchlistSheet` are separate exports over one shared `WatchlistPanel`. The sheet is the terminal's **menu** below `xl`, carrying the nav links above the watchlist, so the shared panel claims height with `min-h-0 flex-1` rather than `h-full` — it has a sibling now. (F17, F37)
- **The terminal header has no spare width, and anything added to it re-opens a sideways scroll.** The nav is `xl` and the rail `lg` because the six links need 404px and the right-hand cluster 442px; at 768px the bar has ~106px spare. Below `xl` the sheet carries navigation instead. (F37)
- **`DialogContent` caps its height at `calc(100dvh-2rem)` and scrolls internally — do not remove it.** It is `fixed` and centred with `-translate-y-1/2`, so taller content hangs off both ends with neither reachable: a fixed element creates no page scroll. The order ticket is 591px and clipped to top −46 on a 500px-tall viewport without the cap. (F37)

## Marketing site

**Moved to `context/constraints/marketing.md`** — read before building or changing a page under `(marketing)`. On demand, because none of it binds work inside the terminal.

## Live prices, interpolation, and quote providers

**Moved to `context/constraints/market-data.md`** — read before touching a surface that renders a price, the quote store, provenance, or a quote provider. On demand, because the provenance *invariants* stay in `architecture.md`; what moved is the operational detail behind them.

## Next.js behaviour

- **Two identical GET reads in one render return the same answer, even across a write between them** — Next memoizes identical `fetch` calls per render pass and supabase-js is built on `fetch`. **`cache: 'no-store'` does not defeat it**; have the writer return what it wrote instead of re-reading. (F33)
- **PostgREST answers `PGRST103` for an offset past the end, returning null rows *and* a null count.** A total read off the paged query is therefore lost exactly when the page is out of range, rendering "no rows" over an account that has them. **Every pager takes its total from a separate unranged count and carries a "past the end" branch** — Funds had neither. (F34, Funds fixed at the Phase 5 checkpoint)
- **Moving or renaming a route file leaves a stale `.next/types/validator.ts`** that fails `pnpm typecheck` *and* `pnpm build` on a module that no longer exists. `rm -rf .next` clears it. (F03)
- **A Server Component throw renders nothing server-side; the boundary appears on hydration.** `curl` shows an empty body and a 500, which looks like a white screen — the check only means something in a browser. (F08)
- **Next treats leading-underscore directories as private and does not route them**, so a `__boom/` test page builds clean and simply does not exist. (F08)
- **The 404 carries full public chrome; the error boundary carries none.** An unmatched URL never enters the `(marketing)` group, so `PublicShell` is extracted and shared; an error means the subtree already failed, so its fallback depends on as little as possible. (F08)

## Documentation upkeep

- **Nothing sweeps the non-money documents, so the phase checkpoint is where they get reconciled.** `trading-contract.md` §13 sweeps money rules because they are restated in four files; the same problem exists outside money with no guard. Re-read the non-money docs against the code at every checkpoint. (1.00.06)
- **`context/` is read in tiers, not whole** — reading it all cost >100k tokens, mostly shipped phases and untouched libraries. `CLAUDE.md` carries the always list and the trigger table, and `pnpm context:cost` guards the 40k always-read budget, which is **now saturated**: adding a line means evicting one. (4.00.02, Phase 5 checkpoint)
