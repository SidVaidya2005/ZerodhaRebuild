# Standing Constraints

These are past decisions and findings that still affect future work. Read this core file every
session; open its topic references when your task needs them. Rules define what to do, and the
short explanation beside each rule says why. Feature references such as `(F02)` identify its origin.

## How this file is maintained

- Use one or two sentences per bullet: the rule and its reason. Detailed examples, measurements,
  and investigation history belong in `build-journal.md`; git retains removed wording.
- Group entries by topic, with a `##` heading when needed, rather than by date.
- Keep broadly applicable rules here. Put task-specific rules in `context/constraints/<topic>.md`,
  link them here, and add their reading trigger to `CLAUDE.md`.
- Move entries here from the tracker's Key Decisions when it exceeds ten entries, or from the
  journal at phase checkpoints. Move rather than copy, and preserve the feature reference.
- Replace an existing entry when a new decision supersedes it. Remove a rule only after verifying
  it was reversed or no longer applies; completed sequencing instructions may be retired.
- Keep history in the journal. Do not repeat the trading contract: link its section and retain
  only the additional reason for the rule.

## Build plan sequencing

- Keep one feature number when work crosses phases; use lettered parts, as F07 did with A in Phase 1
  and B after F09. Renumbering breaks journal and commit references. (F07, F08)
- Recompute the market-status pill on a client timer so a tab left open past 15:30 changes to CLOSED.
  Pass holidays as `string[]` and use the same pure `marketStatusAt` function as the tick gate. (F17)
- Filter the preloaded stock list with `cmdk` for watchlist search; do not add a trigram index,
  migration, or request per keystroke. Roughly 200 rows take about 12 KB, and Postgres uses a
  sequential scan for a table this small anyway. (F18)

## Environment and secrets

- Use the one hosted Supabase project: `zerodha-rebuild-dev` / `kefggygenlprjzhiocai` / ap-south-1.
  It is in a separate account inaccessible to workspace MCP; the CLI uses a personal access token,
  and the second test project was deliberately deleted to avoid independent idle pauses. (F08, revised 1.00.03)
- Do not reintroduce `pnpm db:push:test`. There is one database and one push command,
  `pnpm supabase db push`. (F09)
- `TEST_DATABASE_URL` must use the session-mode pooler on port 5432. Transaction-mode port 6543
  cannot preserve the multi-statement transactions required by tier 3. (1.00.03)
- Seed reference data with the service role, not a test connection string. Client roles have only
  `select` access to `instruments` and `market_holidays`. (F14)
- Validate public variables in `env.ts` and secrets in `env.server.ts`, which imports `server-only`
  so a client import fails the build. `register()` validates at boot; `next build` skips it, while
  `dev` and `start` fail with the missing variable's name. (F01)

## Dependencies

- Keep TypeScript pinned to 6.0.3 and ESLint to 9.39.5 until compatibility is rechecked.
  `typescript-eslint` failed with TS 7, and `eslint-plugin-react` 7.37.5 failed with ESLint 10's
  rule-context API; either broke linting. (F01)
- Pin exact dependency versions without caret ranges, keeping `package.json`, the lockfile, and
  the architecture table aligned. (F01)
- Keep the pinned Lighthouse dev dependency behind `pnpm audit:a11y`. It was added in Phase 1 so
  public pages could be audited as they shipped, rather than waiting for F38. (F04)

## Auth

- Check the session once in the `(terminal)` layout; child pages use RLS-scoped reads that return
  no account data without a session. Separate checks in every page are unnecessary. (F17)
- Start sign-in with a form posting to a Server Action that calls `signInWithOAuth` and `redirect()`.
  This works without browser JavaScript and keeps the PKCE verifier (OAuth's request-verification
  value) with the client that reads it back. (F12)
- Preserve the intended destination through `safeNext()` in `src/lib/auth/routes.ts`, accepting
  only values starting with a single `/`. Keep it outside `src/proxy.ts` so tier 1 can test the
  open-redirect protection. (F12)
- Keep signed-in identity and sign-out controls in the terminal. A session read in the public header
  would make every marketing page dynamic and violate its session-free boundary. (F12)
- Ship all four Supabase clients together, including `admin.ts`, and verify its `server-only`
  protection actually rejects a client import during a build. (F12)
- Create accounts only through signup's `auth.users` insert trigger. Delete and recreate orphaned
  users rather than backfilling accounts through a second path. (F13)

## Security and RLS

Read `context/constraints/security.md` before migrations, grants, RLS policies, or `security definer`
functions. It covers permission and constraint traps; the security invariants remain in `architecture.md`.

## Money, orders, and the order engine

Read `context/constraints/trading.md` before changing money, orders, or Postgres money functions.
It explains order-entry and locking decisions. `trading-contract.md` remains authoritative for money.

## Testing

Read `context/constraints/testing.md` with `code-standards/testing.md` before writing or debugging tests.

## Verification routine

Read `context/constraints/verification.md` before browser checks or interpreting automated audits.
It records checks that can appear to pass while testing the wrong thing.

## Deployment

- Rebuild after changing any `NEXT_PUBLIC_*` value; Next.js embeds these values in the browser bundle
  during the build. A runtime override is not a valid test of the new value; rebuild or test its
  validation as a pure function. (F39)
- Use the configured `NEXT_PUBLIC_SITE_URL` for OAuth redirects, with the URL allow-listed in Supabase;
  request-host-derived origins permit host-header injection. `assertDeployableSiteUrl` in
  `instrumentation.ts` rejects deployed localhost values using `RENDER`, not `NODE_ENV`, since local
  audits also use production builds; pages and `/api/health` alone do not detect a wrong redirect. (F39)
- Exit non-zero on a startup validation failure. Next.js catches an instrumentation throw, logs
  `Failed to prepare server`, and can leave the process alive without serving requests. (F39)
- Do not interpret F16's unchecked box as an undeployed schedule: F40 recorded an active per-minute
  `market-tick` in `cron.job`, 7,200 successful `cron.job_run_details`, and quotes stopping at
  15:29 IST as expected. F16 remains open by choice; scheduling supports refresh, matching, and
  square-off while Render sleeps. (F40)
- Use `npx --yes pnpm@<pinned>` on Render. `corepack enable` tries to write a shim into read-only
  `/usr` and fails with `EROFS`. (F39)

## Local development environment

- HTTP 431 from excess localhost cookies can block Server Action POSTs as well as page requests
  before application logging. If clearing foreign `sb-*` cookies is impractical, use
  `NODE_OPTIONS=--max-http-header-size=32768`; see `CLAUDE.md` → Environment notes. (F12)

## Supabase CLI

Read `context/constraints/supabase-cli.md` before migrations, type generation, or function deployment.

## Accessibility

- Use `pnpm audit:a11y:axe` with a signed-in cookie and an explicit theme for terminal audits; it
  fails if the session is missing. Lighthouse has no session, follows the login redirect, and checks
  only one theme, so even a perfect score can describe the wrong page. (Phase 3 checkpoint, F38)
- Measure tap targets with `getBoundingClientRect()` at 375px; Lighthouse does not check their size.
  Support scored 100 while its 20px `<summary>` targets were below WCAG 2.2's 24px minimum. (F07)
- Put `relative` on every `overflow-x-auto` scroll wrapper. Absolutely positioned `sr-only` content
  can otherwise escape the table wrapper and make the entire page scroll sideways. (F27, F30; Phase 5 checkpoint)
- Compare page-level `documentElement.scrollWidth` with `clientWidth`, then recheck every page after
  changing shared headers or navigation. A correct table wrapper did not prevent the shared `TopNav`
  from adding 94px of overflow on `/positions`. (F31, F30, F27)
- Keep the terminal wordmark hidden below `sm` unless the header is remeasured. Its controls use
  333 of 347 available pixels at 375px, leaving no room for the 109px wordmark. (F31)
- Keep a combobox's listbox mounted, hiding it when needed. cmdk's `CommandInput` always emits
  `aria-controls`; an unmounted list left a broken reference and a critical axe finding on all eight
  terminal routes. (F38)
- A `role="img"` chart container must have no focusable content. Use `attributionLogo: false` to
  remove Lightweight Charts' injected anchor, but retain the licence-required named TradingView
  link outside the chart in `StockChartCard`. (F38)
- Give horizontally scrollable regions `tabIndex={0}` and a labelled `role="region"` so keyboard
  users can reach their columns. Axe checks this; Lighthouse does not. (F05)
- A store-opened dialog must restore focus itself because it has no Radix `DialogTrigger`. Capture
  `document.activeElement` when opening and restore it in `onCloseAutoFocus` only if `isConnected`;
  apply this to every new call site. (F25)
- Wrap the interactive element, never a `<form>`, with `DropdownMenuItem asChild`. Radix activates
  it through `event.currentTarget.click()` on Enter or Space, and clicking the form does not submit it. (F17)
- Pair every Recharts chart with a table of the same data and mark the chart `aria-hidden`.
  Its SVG's `role="application"` otherwise captures screen-reader keystrokes and disrupts browse mode. (F21)
- Reorder watchlists with move-up/move-down buttons writing `sort_order`. Drag-only interaction
  excludes keyboard users, and this project has no drag-and-drop dependency. (F18)

## Theming and design tokens

- Remove `dark:` utilities from added components. Tailwind v4's default variant follows the OS
  preference rather than this project's theme class; a grep guard checks for leftovers. (F02)
- Write Tailwind variants as complete literal class names. A constructed string such as
  `bg-chart-${n}` is not detected by the CSS scanner. (F02)
- Register every custom `--text-*` size in `extendTailwindMerge` in `src/lib/utils.ts` when adding
  it to `globals.css`. Otherwise `cn()` can mistake `text-number-sm` for a colour and silently
  remove it when combined with `text-ink`. (F19)
- Add every text colour to `theme-tokens.test.ts`'s `foregrounds` list, which checks WCAG AA contrast
  on canvas, surface, and surface-elevated in both themes. `mustNotFlip` checks equality, not contrast;
  muted colours become darker in `.light` to remain readable. (1.00.01, F38)
- Use `--color-up`/`--color-down` only for candle bodies, filled buttons, and status dots; keep them
  identical across themes. Price text uses `--color-up-text`/`--color-down-text`, which change by
  theme because the fills measured 3.72:1 on dark elevated surfaces and as low as 1.95:1 on light;
  this deliberately corrects DESIGN.md's older text guidance. (F02, F38)
- Check contrast against the actual tinted background. Both `bg-up/10` and `bg-destructive/10`
  passed on a plain surface but failed on their roughly 10% tints. (F38)
- Pair every text use of `text-brand` with `light:text-ink`; exempt decorative `aria-hidden` glyphs.
  Brand yellow remains constant, measuring 11–13.5:1 on dark but only 1.37–1.43:1 on light. (F06, F38)
- Do not use `--color-info` for normal text: `#3b82f6` passes AA only on the dark canvas, with
  3.68:1 on light canvas and 4.30:1 on surface. It supplies `--color-ring`; use `ink`, `body`,
  `muted`, or `muted-strong` for tested text colours. (F38)
- Use `--color-body` for running paragraphs, reserving `--color-muted` for links, captions, and
  column headings. The light-theme contrast fix does not change those roles. (F04, F38)
- Use `text-body` for validation messages; trading red means a falling price. The shadcn destructive
  bridge maps `--color-destructive` to `--color-down-text`, since its foreground use must meet
  contrast and the fill measured only 3.12:1 behind the Cancel button. (F25, F38)
- Keep chart categories free of trading green and red. `chart-ramp.test.ts` checks a ramp varying
  both lightness and hue against `--color-surface`, since hue alone cannot distinguish ten categories
  for people with deuteranopia, a form of red-green colour blindness. (F21)
- Use the neutral colour for an aggregated `Others` slice. Giving the last slice `index % 10`
  can repeat chart-1 and create identical legend swatches. (F21)
- Underline inline links persistently, as required by WCAG 1.4.1's rule against colour-only link
  identification. This overrides DESIGN.md; navigation and footer links retain hover-only underlines. (F04)
- Use `bg-surface` for the marketing footer. It resolves to `#fafafa` in light mode while supporting
  dark mode, rather than hardcoding DESIGN.md's always-light value. (F03)
- Pass `profiles.theme` from the terminal layout and apply it with client-side `setTheme` once per
  full load. `next-themes` reads `localStorage` and accepts no server value, so an account's first
  visit on a browser may briefly show that browser's existing theme. (F35)
- Keep `SiteHeader`'s theme toggle local to `localStorage`; persist the terminal toggle to the
  account. Reading a session in the marketing header breaks static rendering, while failing to
  save the terminal choice lets `profiles.theme` revert it on the next full load. (F12, F35)
- Default `profiles.theme` to `'dark'`, as specified by product scope. The architecture's earlier
  `light` default was corrected. (F10)
- Load the intended theme before measuring colours. Scripted class changes can return stale values
  during `transition-colors` and produce false contrast failures. (1.00.01)
- Treat `pnpm audit:a11y` as a dark-theme check; use `theme-tokens.test.ts` for light-theme contrast.
  Lighthouse also refuses non-200 documents such as the 404 with `ERRORED_DOCUMENT_REQUEST`. (F06, F08)

## Formatting and display

- Use `formatCurrency` for ₹ and two decimal places, and `formatSignedCurrency` when an explicit
  +/− is meaningful. Both use `Intl.NumberFormat('en-IN')` for Indian digit grouping. (F02)
- Use `formatRate` for statutory rates: up to five decimal places with no trailing zeros.
  `formatPercent` is fixed at two and incorrectly displays 0.00307% as 0.00%. (F06)

## shadcn/ui

- Bridge shadcn tokens to the project palette through `@theme inline` so `shadcn add` keeps working.
  Preserve this project's text-grey meaning of `--color-muted`, despite shadcn using that name for
  a surface. (F02)
- Initialise with `init -b radix -t next -p nova --css-variables -y`; `-y` alone does not skip the
  style-preset prompt. Keep `shadcn` as a runtime dependency for `shadcn/tailwind.css`. (F02)
- Override a variant-prefixed utility with the same prefix. Plain `w-full` cannot override
  `data-[side=right]:w-3/4` on `SheetContent`; both survive `tailwind-merge`, so measure the result. (F03)
- Use a plain semantic `<table>` for marketing tables. Importing `components/ui/table.tsx` creates
  a client-hydrated boundary, which is appropriate for the terminal primitive. (F05)
- Keep `WatchlistRail` beside `<main>` in the layout, with only the sheet trigger in the nav;
  `WatchlistRail` and `WatchlistSheet` share `WatchlistPanel`. Below `xl`, the menu sheet also holds
  navigation above it, so the panel uses `min-h-0 flex-1` rather than `h-full`. (F17, F37)
- Remeasure header overflow after adding anything: the desktop nav starts at `xl`, the watchlist
  rail at `lg`, and below `xl` the sheet provides navigation. Links need 404px and right-hand
  controls 442px; the bar has about 106px spare at 768px. (F37)
- Keep `DialogContent` internally scrollable and capped at `calc(100dvh-2rem)`. A fixed, vertically
  centred dialog creates no page scroll; the uncapped 591px order ticket started at −46px on a
  500px-high viewport, leaving content unreachable. (F37)

## Marketing site

Read `context/constraints/marketing.md` before changing a `(marketing)` page.

## Live prices, interpolation, and quote providers

Read `context/constraints/market-data.md` before changing displayed prices, the quote store, provenance,
or a provider. The invariants remain in `architecture.md`; this reference holds the operational details.

## Next.js behaviour

- Have a write return its result rather than rereading it in the same render. Next.js memoizes
  identical GET fetches per render, including Supabase reads, even across an intervening write;
  `cache: 'no-store'` does not disable this behaviour. (F33)
- Use a separate unranged count for every pager and provide a past-the-end state. PostgREST's
  `PGRST103` returns null rows and null count for an excessive offset, which can otherwise make a
  populated account look empty. (F34; Funds corrected at the Phase 5 checkpoint)
- Clear `.next` with `rm -rf .next` after moving or renaming route files if stale
  `.next/types/validator.ts` references break typecheck or build. (F03)
- Check Server Component error boundaries in a browser. Their fallback appears on hydration;
  `curl` may show an empty body and HTTP 500 instead. (F08)
- Do not use leading-underscore folders for temporary test routes. Next.js treats them as private,
  so a `__boom/` page can build successfully without creating a route. (F08)
- Share `PublicShell` with the 404 because unmatched routes do not enter `(marketing)`.
  The root error fallback has no page chrome so it depends on as little failed code as possible. (F08)

## Documentation upkeep

- Reconcile non-money documentation with the code at phase checkpoints. Money has the explicit
  `trading-contract.md` §13 sweep; other subjects have no equivalent automatic review. (1.00.06)
- Follow `CLAUDE.md`'s core reading list and task triggers rather than loading all context for routine
  work; `pnpm context:cost` checks its 40,000-token budget. The recorded 2026-09-13 measurement was
  34.5k after the reference split saved roughly 8k; rerun the command for the current size. (4.00.02, F40)
