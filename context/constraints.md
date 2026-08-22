<!-- TEMPLATE (setup-context) — created EMPTY; do NOT fill at initialization.
The agent files constraints here as they arise, deleting this banner before the first entry.
KEEP the > **Role:** blockquote AND the "How this file is maintained" section — both are permanent documentation, not scaffolding. -->

# Standing Constraints

> **Role:** What still binds — the decisions and non-obvious facts that constrain future work, grouped by topic.
> **Read before any decision that might conflict with past work.**
> **Relates to:** receives decisions displaced from `progress-tracker.md` and decisions promoted out of `build-journal.md` at phase checkpoints.

## How this file is maintained

Keep this file **small**. It is the one record read on demand during ordinary work, so every line costs on every session that opens it.
The chronological record of how the build got here lives in `build-journal.md`; this file holds only what is still true.

- **Grouped by topic** (auth, data, payments…), never by date. Add a `##` topic heading when a new one is needed.
- **Holds only what still binds:** decisions that constrain future work, and notes explaining why something non-obvious is the way it is. Never a narrative of what happened — that is the journal's job.
- **Two things feed it,** and both are moves, never copies: the oldest bullet of `progress-tracker.md` → Key Decisions when that section would exceed 10, and each phase's still-binding decisions promoted out of `build-journal.md` at the phase checkpoint.
- **Cite the feature each bullet came from,** e.g. `(F02)`.
- **Deduped on write.** If a new constraint supersedes one already here, replace that bullet in place rather than adding a second bullet on the same topic.
- **Never pruned by age.** Remove a constraint only when it is verifiably dead — reversed by a later decision, or the thing it describes no longer exists. `git` history holds anything removed.

<!-- Filed by topic, newest bullet first within each topic:

## {{TOPIC}}
- {{CONSTRAINT}} ({{FEATURE_REF}})

-->

## Build plan sequencing

- **The market-status pill is F17's, and it recomputes on a timer.** F20 turns out to be only the data-source badge — its UI and Logic bullets never mention market status despite its title. Server-rendering the pill once would leave a tab open past 15:30 still reading OPEN, so the server passes the holiday set as a `string[]` and a client component calls the same pure `marketStatusAt` the tick gates on. (F17)

- **The index strip ships as a slot with no values, and index data moves to F21.** NIFTY 50, SENSEX and BANK NIFTY exist nowhere in the data — `instruments` holds 200 NSE equities, so there is no row, no quote and no simulator anchor for any of them, and SENSEX is BSE against an NSE-only scope. Three fabricated numbers in the most prominent chrome on the page is the worst place in the app to invent data. `project-overview.md` already puts an index strip on the Dashboard, so F21 gets it. (F17)

- **The candle prune moves from F16 to F33.** Candles left F15, so retention logic here would run against a table nothing populates and its assertion would pass whether or not the rules were right. F33 builds the pipeline and its retention together. (F16)

- **Candles move out of F15 to F33.** No source covers the 1D and 1W intraday ranges — bhavcopy gives one daily bar, Yahoo's chart endpoint is deferred — and F33 is the first feature that draws a chart. Designing a chart pipeline four features before anything renders one is the thing being avoided. (F15)

- **`isTradingSession()` coverage moves from F14 to F15**, which is where the function and its unit tests already live. F14 proves the seeded data instead: the published dates are present, correctly dated in `Asia/Kolkata`, and described. Same precedent F13 set when its watchlist check moved here. (F14)

- **F10 creates only the two enums its own tables reference** — `quote_provider` and `candle_interval`. The five that only F11's tables use are created there. Each migration then reviews against the tables it creates, and nobody reading the schema in between finds five types with no referents. (F10)

- **F07 moves behind F09.** Its verify is a tier-2 pgTAP check and `support_messages` accepts anonymous writes, so it should not ship behind a one-off manual check. Phase 1 closes as 01–06 plus 08; F07 is built once the harness exists. (F08)

- **Every link the public shell points at is stubbed in F03**, including `/auth/login`, so the shell's own verify can pass and F04's "every CTA routes to `/auth/login`" has a destination. Each stub is a heading plus one line of copy, replaced wholesale by F05–F08 and F12. `src/app/page.tsx` moves into `(marketing)/` in the same change — two files claiming `/` would fail the build. (F03)

- **`pnpm db:push:test` does not exist and must not be reintroduced.** One database means one push command, and `pnpm supabase db push` already is it. A second script reaching the same place by a different mechanism, named for a test project that no longer exists, is a trap. (F09)

- **F07 shipped as two slices under one number.** Slice A (help content) had no database dependencies; Slice B (form, migration, RLS) waited for F09. Renumbering would have invalidated every journal and commit reference already written — the precedent to follow if another feature turns out to straddle a phase boundary. (F07)

- **Supabase provisioning is deferred out of F01 to Phase 2.** The free plan caps active projects at two per org and both slots already hold unrelated projects (`NextBnb` active, `SpotifyAgain` paused). F10 already calls for creating and linking the project, so F01 and F10 were duplicating the step. (F01)

- **F07 (Support form) is deferred to Phase 2, after F09.** It needs a `support_messages` migration, and its verify ("signed out, a select returns zero rows") is a tier-2 pgTAP check that F09's harness makes runnable. `support_messages` accepts anonymous writes, so it is the last table that should ship behind a one-off manual check. (F01, resolved F08)
- **There is exactly one Supabase project and it is the real one:** `zerodha-rebuild-dev` / `kefggygenlprjzhiocai` / ap-south-1, in a **separate Supabase account** (`wolfgunblood214@gmail.com's Org`) that the workspace MCP cannot see — the CLI is authenticated by personal access token instead. A second test project was created and deliberately deleted: one project is simpler to operate and cannot silently pause while the other stays warm. (F08, revised 1.00.03)
- **Because of that, tier 3 commits into the production database.** It cannot be avoided — proving two connections cannot both fill an order requires the first to commit. Three guards are mandatory and none is optional: `ALLOW_RACE_TESTS` must be set or `pnpm test:race` exits, seeded rows carry a recognisable prefix, and `afterEach` cleanup runs on failure too. A crashed process can still strand rows; that is the accepted residual risk. (1.00.03)
- **`TEST_DATABASE_URL` must use the session-mode pooler, port 5432.** Tier 3 holds a transaction open across statements; the transaction-mode pooler on 6543 structurally cannot express that. The port is load-bearing. (1.00.03)

## Environment and secrets

- **The seed authenticates as the service role, not through a test connection string.** `instruments` and `market_holidays` grant `select` only, and seeding reference data is the administrative act that key exists for — `TEST_DATABASE_URL` is named for tests and should not become load-bearing for ops. (F14)

- **Environment validation is split across two modules**, deviating from `code-standards.md`'s single `env.ts`, which was updated to match. `env.ts` holds the `NEXT_PUBLIC_*` variables and is safe anywhere; `env.server.ts` carries `import 'server-only'` so a client-side import of the service-role key fails the build instead of throwing at runtime. Validation is forced at boot by `register()` in `src/instrumentation.ts`, which Next.js skips during `next build` — so `build` stays green without secrets while `dev` and `start` fail by name. (F01)

## Dependencies

- **`lighthouse` added as a pinned dev dependency with `pnpm audit:a11y`.** F04's verify commits to a score above 90 and nothing could measure it; F38 needs the tooling regardless, so landing it in Phase 1 means every public page is audited as it ships rather than all at once at the end. (F04)

- **TypeScript is pinned to 6.0.3 and ESLint to 9.39.5, both below their available latest.** `typescript-eslint` refuses to load against the TS 7 API, and `eslint-plugin-react` 7.37.5 crashes on ESLint 10's rule-context API — each breaks `pnpm lint` outright. Re-test both when those upstreams ship support; `architecture.md`'s version table carries the reason. (F01)

- **Dependencies are pinned exactly, with no caret ranges.** Every version in `architecture.md` was verified to equal the current registry `latest`, so the table, the lockfile and `package.json` all agree and can only diverge by a deliberate edit. (F01)

## Auth

- **The `(terminal)` layout checks the session once and pages trust it.** `dashboard/page.tsx` re-checked it itself on the argument that the proxy is only a convenience; with a layout that argument buys nothing, because every page beneath reads through RLS-scoped queries that return nothing without a session. One `getUser()` per navigation instead of one per page, and no future page can forget to check. (F17)

- **No backfill: the orphan account is deleted and re-created.** `auth.users` held one row with no profile, created while verifying F12, and a trigger on `auth.users` fires only on insert. Deleting it keeps signup as the only path that ever creates an account — worth more than sparing the test account. (F13)

- **Sign-in is initiated server-side, not from a browser client.** A `<form>` posts to a Server Action that calls `signInWithOAuth` and `redirect()`s to Google, so sign-in works with JavaScript disabled — the standard F07B set for the support form — and `/auth/login` stays a Server Component. The PKCE verifier is written by the same client that reads it back in the callback. `library-docs.md`'s client-side snippet is corrected in the same change. (F12)

- **The signed-in identity and sign-out control live on the `/dashboard` stub, not the public header.** F12's UI bullet said "in the header", but the only header that exists is the marketing one, and reading a session there would force dynamic rendering on every public page and break `architecture.md`'s session-free `(marketing)` boundary. F17 owns the terminal avatar menu. (F12)

- **The intended destination survives sign-in, guarded by a pure `safeNext()`.** The proxy redirects to `/auth/login?next=<path>`; the callback honours `next` only when it starts with a single `/`, else `/dashboard`. `src/proxy.ts` is unreachable from tier 1, so path matching and next-validation move into `src/lib/auth/routes.ts` where an open redirect and an unguarded route are both testable. (F12)

- **All four Supabase clients ship in F12**, `admin.ts` included, even though nothing in this feature calls it. Its `import 'server-only'` guard is therefore observed failing a build rather than assumed — an unused module holding the RLS-bypassing key is exactly the thing that must not be trusted on sight. (F12)

## Security and RLS

- **Supabase's `verify_jwt` accepts any valid project key, including the publishable one that ships in the browser bundle.** Measured in F16 against the deployed `market-tick`: no `Authorization` header is rejected by the gateway with `UNAUTHORIZED_NO_AUTH_HEADER`, but both `sb_secret_…` and `sb_publishable_…` return 200. Any Edge Function that writes data therefore needs a second layer — a Vault-held secret compared in the handler, in constant time, before it touches the database — and must refuse rather than fall open when that secret is unset. This also answers the standing question about the newer non-JWT secret keys: they do satisfy the gateway. (F16)

- **The default watchlist seeds by `INSERT…SELECT` against `instruments`.** F14 populates that table and runs *after* F13, so a plain insert would violate `watchlist_items`' foreign key today. Intersecting a fixed symbol list against whatever is seeded is FK-safe by construction, idempotent, and needs no change when F14 lands. The "populated watchlist" half of F13's original verify moves to F14, which is where it becomes checkable. (F13)

- **`OPENING_BALANCE` is a literal in SQL, pinned from both sides.** The trigger cannot import `src/lib/constants.ts`, so the migration writes `100000.00` citing `trading-contract.md` §11, pgTAP asserts a bootstrapped account holds exactly that, and a tier-1 test pins the TypeScript constant. Both anchor to the contract rather than to each other, so drift fails a test instead of going unnoticed. (F13)

- **Client-ID generation is its own function so exhaustion is testable.** `generate_client_id()` is separate from `handle_new_user()` because the only way to prove the 10-attempt bound is to stub it, and a pgTAP transaction can `create or replace` it and roll back. Exhaustion fails the signup loudly: a user admitted without a `funds` row would break every money function that follows. (F13)

- **The money tables grant `select` and nothing else.** No client role gets insert, update or delete on `funds`, `fund_ledger`, `orders`, `trades`, `holdings` or `positions`, and no write policy exists — every write arrives through a `security definer` function. `code-standards.md` already forbade a Server Action writing them directly, so a write grant would have existed only to be unused, and F10 established that an unused grant is a hole waiting for a mistaken policy. `architecture.md`'s "policies restricting all commands" is reworded to describe what is built. (F11)

- **Three of `trading-contract.md` §12's identities become CHECK constraints, not test assertions.** Identity 8 (a non-`OPEN` order holds no margin), identity 12 (longs hold no collateral and no reference price, shorts carry both) and identity 6 (`charge_breakdown` sums exactly to `charges`) are all row-level, so a violating row becomes unstorable rather than merely detectable later. The same treatment covers all-or-nothing fills, `limit_price` presence, and the zero-quantity rules. (F11)

- **`revoke execute … from public` does not revoke a function from `anon` or `authenticated`.** Postgres grants EXECUTE to PUBLIC, but Supabase *additionally* sets default privileges granting it directly to `anon`, `authenticated` and `service_role`, and a revoke from PUBLIC leaves those untouched — `handle_new_user`, a `security definer` function, stayed callable by any signed-in user. Name all three roles in the revoke, and assert `has_function_privilege(...)` is false rather than assuming. Same shape as F07B's table-grant finding. (F13)

- **That choice constrains F23 and F24, and `code-standards.md`'s `execute_order` example is corrected for it.** A CHECK is not deferrable and fires per statement, so setting `status = 'REJECTED'` and *then* calling `release_margin` — exactly what that example does — now fails on the first statement. The margin must be released first, or both columns written together. Making the invariant structural forces the ordering the contract already implied. (F11)

- **Foreign keys cascade from `orders` and from `profiles`.** A trade without its order is meaningless and a ledger row without its order is unauditable, so an orphan is never the right outcome. `reset_account` still deletes each table explicitly per §11 — the cascade is a backstop against a future path that forgets one, not the mechanism. (F11)

- **No `anon` grant on any reference table.** Every surface showing an instrument or a price is under `(terminal)`, and F04 already decided the marketing site quotes no prices. The publishable key ships in the browser bundle, so granting `anon` select would publish the entire Nifty 200 universe to anyone who reads the JavaScript. (F10)

- **A table's write path ships with the feature that uses it, not with the table.** `symbol_demand` lands in F10 with RLS on and no way for a client to write it; `touch_symbol_demand`, its grant and its test all arrive together in F18. A granted, callable, untested function with no caller for eight features is the thing being avoided. (F10)

- **A CHECK constraint passes when its expression evaluates to NULL, not only when it is true.** Any operand that can be NULL turns the constraint into a suggestion. Proven on `trades`: a missing `charge_breakdown` key made the identity-6 sum NULL and a trade with `charges = 999.99` against a one-key breakdown was accepted. Wrap anything nullable — `coalesce(jsonb_typeof(...), '')` — and evaluate the expression in a plain `SELECT` against malformed input before trusting it. (F11)

- **The money tables grant `select` and nothing else**, with no write policy for any command. `funds`, `fund_ledger`, `orders`, `trades`, `holdings` and `positions` are written only by `security definer` functions. (F11)

- **Retire an order's margin before its status leaves `OPEN`.** `orders_no_margin_unless_open` enforces §12.8 as a non-deferrable CHECK, so a statement that moves an order out of `OPEN` while `blocked_margin` is non-zero fails with 23514. Release first, or write both columns in one `UPDATE`. (F11)

- **Supabase grants `anon` and `authenticated` ALL privileges on new public tables by default** — verified on `support_messages`: SELECT, UPDATE, DELETE and TRUNCATE were all present, leaving RLS as the single layer. Revoke and grant back only what a role needs. It is defence in depth, and it turns a silent "affects zero rows" into a hard `42501` that a test can actually assert. (F07B)
- **`support_messages` carries CHECK length bounds and a honeypot, and volume abuse is deliberately unmitigated.** The publishable key ships in the browser bundle, so anyone can write to that table: bounds cap the damage per request, the honeypot stops drive-by bots, and real rate limiting is out of scope for a portfolio contact form. (F07B)
- **On a public-write table, prefer a missing grant to a filtering policy.** If a permissive policy is ever added by mistake, the absent grant still refuses. (F07B)

## Documentation upkeep

- **Nothing sweeps the non-money documents, so the phase checkpoint is where they get reconciled.** `trading-contract.md` §13 has a sweep because money rules are restated in four files; the same restatement problem exists outside money with no equivalent guard. The 1.00.06 checkpoint found four statements describing a model already replaced — `supabase test db` named as the tier-2 runner in two files, and the support form still shown as react-hook-form in `architecture.md`'s stack table and data-flow diagram. Re-read the non-money docs against the code at every checkpoint. (1.00.06)

## Local development environment

- **A blank white page on `localhost:3000` is usually HTTP 431, not a rendering bug.** Cookies are scoped by host, ignoring port and project, so every Supabase app ever run on `localhost` piles its `sb-<ref>-auth-token` chunks into one jar. Three foreign projects left 14.8 KB there; adding this project's own 4.5 KB session crossed Node's default 16 KB `--max-http-header-size` and every request died with a zero-byte 431 **before Next.js saw it** — no error page, no log line, nothing in the server output. The same limit silently kills Server Action POSTs, so a form appears to do nothing when clicked. Diagnose with `document.cookie.length` in the browser, not by reading application code; clear the foreign `sb-*` cookies, or raise the limit with `NODE_OPTIONS=--max-http-header-size=32768`. (F12)

## Verification routine

- **Kill `next start` by PID from `lsof -nP -iTCP:3000 -sTCP:LISTEN` before trusting any post-rebuild check.** `pkill` does not reliably stop it, and the surviving process keeps port 3000 and serves the *previous* build — which has silently invalidated a verification pass twice. (F03, F04)

- **`resize_window` does not change `window.innerWidth`** when the browser is in macOS fullscreen; it reports success and does nothing. Two working alternatives: measure inside a 375×760 `<iframe>`, or drive headless Brave through the `puppeteer-core` that ships under `lighthouse` and set the viewport directly. (F03, 1.00.06)

- **pnpm appends extra script arguments rather than substituting `$1`.** `"audit:a11y": "lighthouse …${1:-/}"` silently audits `/` while the real path is tacked on as a stray argument — and returns a plausible score, so it looks like it worked. The script is wrapped in a shell function so appended args land in `$1`; confirm the target by reading `finalDisplayedUrl` out of the report, not by trusting the score. (F05)

## Supabase CLI

- **`src/types/database.ts` is in `.prettierignore`, and must stay there.** `supabase gen types` emits double quotes where the project's Prettier config wants single, so formatting the file makes `format:check` fail after every regeneration until someone remembers a manual pass — on a file CLAUDE.md says is never hand-edited. Same treatment as `next-env.d.ts`. (F10)

- **`supabase migration new` can hang past a 120s timeout having already written the file.** Check before assuming it failed and re-running it. (F09)

- **There are two Supabase CLIs on this machine** — Homebrew 2.111.0 and the project's pinned 2.115.0 dev dependency — and authenticating one does not authenticate the other. The CLI also stores its token where `~/.supabase/` shows nothing, so an absent file proves nothing; `supabase projects list` failing is the only reliable check. (1.00.03)

## Testing

- **The market-hours core is shared, not duplicated, so the planned drift test was never written.** An Edge Function cannot import from `src/` — but nothing stops the dependency running the other way. The pure logic moved into `supabase/functions/_shared/`, Deno reads it relatively and the app through a new `@shared/*` alias, leaving one copy that tier 1 already covers. A drift test earns its place when duplication is forced, as with the F05 stack table; here removing the duplication removes the failure instead of policing it. **`loadHolidays` and the session wrappers moved too**, once the tick was found carrying its own untested copy: they take a structurally-typed client so `_shared/` still imports nothing, and a compile-time assertion in the tier-1 suite proves a real `SupabaseClient` satisfies that shape, since nothing calls them from the app until F20. (F16)

- **Market-time logic takes its calendar as an argument so tier 1 can falsify it.** `marketStatusAt(at, holidays)` and `isTradingSessionAt(at, holidays)` are pure; the database-backed wrappers load the calendar and delegate. Keeping the arithmetic separable from the read is what lets the suite drive it across boundaries, timezones and holidays with no database — and it is why F17's status pill can call the same function client-side that the tick gates on. (F15, evicted from Key Decisions at F17)

- **`fetch-reference-data.mts` treats any probe failure as "this symbol does not exist".** Its own comment argues that conflating "upstream refused us" with a 404 is the bug it was rewritten to fix, but the return path files 5xx and network errors into `broken` alongside genuine 404s, and `main` then refuses to write the seed. One transient Yahoo 5xx therefore kills a ~5-minute 200-symbol run. Only 404 should be a verdict; 5xx and socket errors should retry or abort as "upstream unavailable". Found by the Phase 2 review; not fixed, because the script is manual, rare, and re-runnable. (F14)


- **A pgTAP assertion that runs as the owning role is not filtered by RLS, so an unscoped query sees every real row in the database.** `02-constraints-money`'s cascade check ran `select user_id from public.funds` with no `where` and passed only while no account had ever been created; the first live signup broke it. Scope owner-role assertions to their fixture. Assertions under `set local role authenticated` are safe, because RLS does the scoping. (F13)

- **When the function under test is deliberately unscoped, the fixture must clear the world instead** — the F13 rule above cannot be applied, because there is no `where` to add. `select_demanded_symbols` asks what the *whole system* wants refreshed, so `04-market-tick`'s deletes now empty `watchlist_items`, `symbol_demand`, `holdings`, `positions` and `orders` outright rather than for its two fixture users. Scoped deletes passed only while the one real account held an empty watchlist; backfilling it put eight extra symbols into a `bag_eq` naming two. Global deletes are safe here only because the suite always rolls back — verified by re-reading the real rows afterwards. (F16)

- **`supabase test db` requires Docker even with `--db-url`.** It connects to the remote database, *then* shells out to `pg_prove` in a container and dies with `LegacyDockerRunError`. Tier 2 runs through `scripts/run-pgtap.mts` instead: pgTAP's functions return their TAP output as text rows, so executing a suite through `pg` and reading the rows *is* the TAP stream. (F09)
- **pgTAP is enabled by a tracked migration, never created ad hoc by the runner.** With one project that installs a test-only extension into production, which is the lesser problem: an untracked extension the tests silently depend on means a fresh database looks healthy right up until the suite runs, and the migration history stops describing the database. (F09)
- **The tier-2 runner must fail on a plan mismatch, not only on `not ok`.** A suite declaring `plan(2)` that runs one assertion has a bug, and grepping only for `not ok` calls that a pass. All three failure modes — failed assertion, plan mismatch, SQL error — were observed failing before the runner was trusted. (F09)
- **The tier-2 runner is a standalone TypeScript script with no new runner dependency.** Node 26 strips types natively, so `node scripts/run-pgtap.mts` runs directly; `tsx` would be a dependency for one file. Keeping it out of Vitest also means nothing about tier 2 can be picked up by `pnpm test`. (F09)
- **Tier 3 is gated by `scripts/run-race.mts`, which decides before Vitest starts**, so an un-permitted run never imports `pg` at all. Proven with both controls: guard off, the module never loads; guard on, it does. (F09)
- **Prove a negative with a positive control.** A first attempt at that proof used `console.log` and saw nothing in *either* case, because Vitest suppresses it — an absence that looked like evidence and was not. A filesystem marker gave both halves. (F09)

- **Tier 1 tests run in Vitest's node environment with no jsdom and no Testing Library.** Neither is an approved dependency, and `code-standards.md` scopes tier 1 to pure logic. Component behaviour is proven in the browser, not in a simulated DOM. (F01)

- **`server-only` cannot be imported by Vitest**, which does not resolve React's `react-server` condition. It is aliased to the package's own `empty.js` in `vitest.config.mts`. This does not weaken the guard — `next build` still resolves the throwing entry for client bundles, which is what the falsifiability check exercises. (F01)

## Accessibility

- **A horizontally scrollable region needs `tabIndex={0}` and a labelled `role="region"`,** or keyboard users cannot reach the overflowing columns. At 375px that is most of the table. **Lighthouse does not audit this; axe does** — the score alone is not evidence. Applies to every table in Phase 5. (F05)

- **A Lighthouse 100 is not evidence about tap targets.** Target size is not in its audit set: `/support` scored 100 while every `<summary>` was 20px tall, under WCAG 2.2's 24px minimum. Measure `getBoundingClientRect()` at 375px instead. (F07)

## Theming and design tokens

- **`cn()` silently deletes a custom type size when it meets a colour.** tailwind-merge groups by class prefix and cannot tell `text-number-sm` (a size) from `text-ink` (a colour) — it keeps the later one and drops the other, with no error and no warning. `src/lib/utils.ts` declares the project's `--text-*` scale to `extendTailwindMerge` to fix this; **a size added to `globals.css` and not to that list starts disappearing** the moment it shares a `cn()` with a colour. (F19)

- **`profiles.theme` defaults to `'dark'`, and `architecture.md` was wrong.** It said `light` while `project-overview.md` specifies a dark-default terminal and `theme-provider.tsx` ships `defaultTheme="dark"`. CLAUDE.md's conflict order puts the scope document above `architecture.md`, so the doc is corrected rather than the code bent to it. (F10)

- **Every text token clears WCAG AA against canvas, surface and surface-elevated in both themes, and `theme-tokens.test.ts` computes the ratios rather than trusting the eye.** The muted tones flip in `.light` and invert relative to dark, because on a light ground "more prominent" means darker. Changing any of these values without running `pnpm test` will go red. (fixed 1.00.01)
- **Measure a theme by loading it, not by toggling the class from script.** Elements with `transition-colors` return stale computed colours after a scripted class change, which fabricates failures that do not exist. Set the stored theme, reload, then measure. (1.00.01)
- **`text-brand` is only legible on dark surfaces, and this is the one contrast failure still open.** Brand yellow is 11–13.5:1 as text on dark and 1.37–1.43:1 on light, because F02's invariant deliberately keeps `--color-brand` byte-identical across themes. Use `text-ink` for figures and headings; reserve brand for CTA *backgrounds* (`bg-brand text-on-brand`), which pass in both. The wordmark and inline prose links still use it — filed against F38 as a design decision. (F06, still open after 1.00.01)
- **Lighthouse cannot audit the 404**: it returns `ERRORED_DOCUMENT_REQUEST` for any non-200 document. That page is verified structurally and by measured contrast instead. (F08)
- **`pnpm audit:a11y` only ever sees the dark theme.** A clean Lighthouse score is not evidence the light theme is accessible; the contrast assertions in `theme-tokens.test.ts` are what cover it. (F06)
- **The marketing footer is `bg-surface`, not DESIGN.md's always-light `#fafafa`.** `--color-surface` already *is* `#fafafa` in the light theme, so the source system's value is reached through the token rather than hardcoded, and in dark it reads as the elevation step the flat-colour-block philosophy calls for. An always-light token pair would exist only to break the theme contract. (F03)

- **Mobile nav is the shadcn `sheet` primitive, and the theme toggle moves into the public header.** Sheet is Radix Dialog — already installed, no new dependency — and brings focus trap, Escape handling and scroll lock rather than leaving all three to F38. `ThemeToggle` is promoted from `app/dev/styleguide/` to `src/components/ThemeToggle.tsx` as app-level chrome; DESIGN.md's `top-nav-dark` lists it in the right-side cluster. (F03)

- **`--color-muted` is for links, captions and column headers — never for running paragraph copy**, which uses `--color-body`. DESIGN.md scopes it that way, and the misuse also fails WCAG AA: muted is 3.64:1 on the dark surface and 4.34:1 on white. `--color-muted-strong` does not fix it (lighter, so it helps dark and hurts light at 2.84:1); a real fix needs `.light` overrides for both muted tokens and belongs to F38. (F04)
- **Inline links inside a text block carry a persistent underline**, deviating from DESIGN.md's `text-link` ("no underline by default"). WCAG 1.4.1 forbids identifying a link by colour alone, and Lighthouse's `link-in-text-block` catches it. Nav and footer-column links are not in a text block and keep the hover-only underline. (F04)
- **Every `dark:` utility is stripped from added components.** Tailwind v4's built-in `dark:` variant is bound to `prefers-color-scheme`, so a leftover `dark:` class responds to the visitor's OS rather than this project's theme class — a live bug, not inert code. A grep guard enforces it. (F02)

- **Interpolated class names generate no CSS.** Tailwind scans source for complete strings, so `bg-chart-${n}` produces nothing. Write every variant out literally. (F02)

## Formatting and display

- **Two money formatters, not one with flags.** `formatCurrency` always renders ₹ and 2dp; `formatSignedCurrency` renders an explicit +/− where the sign carries meaning. `Intl.NumberFormat('en-IN')` produces Indian digit grouping natively, so nothing is hand-rolled. (F02)

- **`formatPercent` is fixed at 2dp and is wrong for statutory rates** — it renders 0.00307% as "0.00%". `formatRate` (up to 5dp, no trailing zeros) exists for those. The two have genuinely different jobs: day change wants 2dp, a charge rate wants its real precision. (F06)

## shadcn/ui

- **The watchlist rail lives in the layout beside `<main>`; only the sheet trigger lives in the nav.** Exporting one component that rendered both shells put the 288px `aside` inside the header's 64px flex row, where it was clipped to the nav's height and pushed the brand, index strip and pill until they wrapped. `WatchlistRail` and `WatchlistSheet` are separate exports over one shared `WatchlistPanel`, so F18 fills the panel once and both breakpoints follow. (F17)

- **The sidebar collapses via shadcn `Sheet`.** Already installed and unused, matches DESIGN.md's full-screen sheet under 768px, and F18 needs the sidebar to be a client component for search and reorder regardless. (F17)

- **The shadcn CLI changed shape: `init -b radix -t next -p nova --css-variables -y`.** It now picks between Base UI, Radix and React Aria, and prompts for a style preset that `-y` does not skip. `shadcn` is also a *runtime* dependency shipping `shadcn/tailwind.css`. Resolves the standing TODO in `library-docs.md` → shadcn/ui. (F02)

- **shadcn's token vocabulary is bridged onto this project's, never merged.** A `@theme inline` block maps shadcn's names onto our palette so `shadcn add` keeps working, while project code keeps using `bg-canvas` / `text-muted` / `border-hairline`. `--color-muted` is the one real collision — shadcn means a *surface* by it, this project means the *text* grey — and it is resolved in this project's favour, with `--color-muted-foreground` defined to the same value and `bg-muted` hand-fixed on add. (F02)

- **Overriding a variant-prefixed utility needs the same prefix.** `SheetContent` sizes itself with `data-[side=right]:w-3/4`; a plain `w-full` loses on specificity, and `tailwind-merge` keeps both because it treats them as different keys — so the class list looks right while the width is wrong. Only measuring exposes it. (F03)

- **`components/ui/table.tsx` is a Client Component.** Importing it puts a hydrated client boundary on the page, which a static marketing page must not have. Marketing tables use a plain semantic `<table>`; the terminal is where the primitive earns its cost. (F05)

## Marketing site

- **The support form uses React 19's form action and `useActionState`, not react-hook-form.** It submits and validates without JavaScript, matching the page it sits on, and needs no new dependency. `code-standards.md` carries the exception to its own Server Action shape rule; F25's order ticket is where react-hook-form earns its place. (F07B)

- **FAQ disclosure is native `<details>`/`<summary>`.** Zero JavaScript, works before hydration and with JS off, and keyboard operation, focus handling and screen-reader semantics come from the browser instead of being hand-written and then audited at F38. (F07)

- **Slice A ships no contact form at all**, pointing unanswered questions at the repository's issue tracker. A dead "coming soon" form is worse than none, and this way Slice B adds the form rather than replacing a placeholder. (F07)

- **The three honesty sections divide by purpose, not by subject.** Home carries price provenance only; About carries the Real / Simulated inventory; `/legal` carries the consequences and the divergences from a real broker, because a notice has to stand alone. About links to Legal rather than restating it. (F05)

- **The About page's stack table renders from a typed `src/lib/stack.ts` guarded by a bidirectional drift test.** Every `installed` row's version must equal `package.json`'s, and every `planned` row's package must be absent from it — so upgrading a dependency without touching the page fails the suite, and so does installing a planned package without flipping its row. (F05)

- **Packages `architecture.md` commits to but later phases install render as "planned"**, neither omitted nor given an invented version. A third of the stack lands in Phases 2–5, and faking those versions would be the same overclaim the provenance badge exists to prevent. (F05)

- **All external links go through a shared `ExternalLink`** carrying `target="_blank" rel="noreferrer"` and an sr-only "opens in a new tab". This turns the recurring `rel="noreferrer"` requirement into a grep for raw `target="_blank"` outside one file. (F05)

- **The home page documents all four provenance states and says plainly that `LIVE` never appears in this build.** `PROVIDER_IS_REALTIME` is `false` for all three providers, so a quote can only badge `DELAYED`, `SIMULATED` or `STALE`. The feature tile drops "live NSE prices" for "real NSE prices, honestly delayed", and `build-plan.md`'s own F04 wording was corrected in the same change — architecture invariants outrank a build-plan feature. (F04)

- **The hero is typographic — no mock terminal UI.** It is what the build plan specifies, and F40 can screenshot the finished terminal, which beats a hand-built fake and avoids maintaining a second UI until the real one exists. (F04)

- **The simulator disclaimer is dismissible and remembered, with no flash.** A blocking inline script in the root layout reads `localStorage` and stamps `data-disclaimer="dismissed"` on `<html>` before first paint; CSS hides the strip off that attribute. The same technique `next-themes` already runs here, and it keeps the `(marketing)` layout a Server Component — only the close button is a client island. (F03)

## Quote providers

- **Watchlists join the tick's demand union.** `symbol_demand` has no write path until F18 and nobody holds anything yet, so the union as originally specified would select zero symbols and the whole write path — upsert, provenance columns, `fetched_at` — would ship untested. A watched symbol is genuinely demanded, and this stays correct once F18 narrows refreshes to what is on screen. (F16)

- **The provider seam is built but the limiter is not.** `QuoteProvider`, an ordered chain and a per-provider circuit breaker, all exercised against a deliberately failing fake — retrofitting a chain around a hardcoded simulator later is worse than the seam costing a little now, and F14 proved the breaker is the piece that matters. A token bucket in front of a local simulator caps nothing, so it waits for a provider that makes outbound requests. (F15)

- **The simulator walks from a real NSE close, seeded into `instruments.prev_close` from bhavcopy.** `library-docs.md` said it seeds from "instruments reference data", but that table carried no price, so a cold start had nothing to walk from. Bhavcopy is on the reachable archive host, not the blocked API. The close is a seed and never a quote — no `NSE_BHAVCOPY` enum value, no provenance rewrite, and every price still badges `SIMULATED`. (F15)

- **The universe is seeded but its Yahoo symbols are unvalidated, and the JSON records that.** `yahoo_validated: false` is written into `nifty200.json`, and the probe ships behind `--probe` rather than being deleted, because it is exactly what must run when Yahoo returns. `${symbol}.NS` remains a derivation nothing has confirmed against the live API. (F14, evicted from Key Decisions at F17)

- **`quotes.prev_close` rolls at the first in-session tick, and the roll is derived from the data rather than scheduled.** `roll_previous_close()` carries each stale quote's `ltp` into its `prev_close` when the row's `fetched_at` falls on an earlier IST date than the running session. A 15:30 job would have been the obvious design and the wrong one here: Render sleeps, the cron window is coarse, and a missed run would leave the roll undone with nothing to notice. Because the condition is a fact about the row, a missed tick costs nothing and the next one repairs it, and it is idempotent within a session by construction. **`loadAnchors` must therefore prefer `quotes.prev_close` over `instruments.prev_close`** — reading the bhavcopy seed is what trapped every simulated price within 5% of the day the universe was seeded, and the seed is now only the cold-start fallback. (F16, resolving a Phase 2 review finding)

- **The circuit breaker cannot open across ticks, so it does not yet do the job it was built for.** `createQuoteService` is called inside the Edge Function's request handler, and its failure counts and cool-off timestamps are closure-local — `pg_cron` fires a fresh invocation every minute, so an upstream returning 429 gets a full `failureThreshold` of fresh attempts every minute, forever. That is precisely the 40-minute Yahoo IP block F14 hit and F15 built the breaker to prevent. Harmless while the simulator is the whole chain (it cannot fail), but **the feature that adds Yahoo must move the state somewhere that survives an invocation** — module scope only helps when the isolate happens to be warm, so a table is the honest answer. Found by the Phase 2 review. (F15, F16)

- **The `instruments.prev_close` invariant is narrower than F15 wrote it.** "Nothing writes it into `quotes`" was false as shipped — the tick writes it as `quotes.prev_close`, correctly, because that column means the previous session's close. What still holds absolutely: never an `ltp`, no `NSE_BHAVCOPY` value in `quote_provider`, no provenance derived from it, never rendered as a live price. Corrected by migration `20260821190523` rather than by rewriting applied history. (F15, F16)


- **Refresh and seed are separate acts.** `fetch-reference-data.mts` hits NSE and Yahoo and rewrites committed JSON; `seed-reference.mts` reads that JSON and upserts. NSE's endpoints are undocumented — its warm-up URL already 403s from this machine while the API call succeeds — so a seed depending on them live breaks unpredictably and offers no diff to review before ~200 rows change. (F14)

- **Every `yahoo_symbol` is probed at refresh time, not sampled.** `${symbol}.NS` is wrong for a few names every year, and Yahoo's clean 200/404 makes full validation cheap; the fetch refuses to write on any failure. The build plan's five-symbol spot check would sample 2.5% of the universe and miss a symbol that never quotes until Phase 5. (F14)

- **Yahoo is deferred to the end of the project (decided 2026-08-21), so Phase 3 ships simulator-backed.** With Twelve Data ruled out and NSE's `quote-equity` answering 403, the simulator is the only provider that can serve a price until Yahoo returns. The chain, circuit breaker, limiter and provenance helpers are still built in F15 — a provider is dropped into a finished chain, not the other way round — and every price badges `SIMULATED`, which is honest by construction. **The thing that must not ship is that state alongside copy promising real prices:** `/` and `/about` claim "real NSE prices, honestly delayed", and either Yahoo lands or that copy is reconciled before F39 deploys. (F14)

- **Twelve Data's free plan does not include NSE symbols**, so it cannot serve as the secondary quote provider for this project. Verified 2026-08-21 against the live API with a real key: `AAPL` returns a quote, `RELIANCE` with or without `exchange=NSE` returns 404 "available starting with the Grow or Venture plan". A plan entitlement, not a symbol-format issue. Its limits are 8 requests/minute and 800 credits/day, which could not sustain a one-minute tick over a ~375-minute session even with access. The chain is therefore Yahoo → simulator, and `architecture.md`'s stack table, tick diagram and quote-service example were reconciled to that at the Phase 2 checkpoint — they had still named a `TwelveDataProvider` and a `QuoteService` class that no longer exist. (F14, closed 2.00.02)

- **Yahoo throttles bursts at the IP level and the block outlasts any in-process backoff.** ~16 requests/second across 200 symbols got every one back as 429 — and the first version of the probe reported that as "200 symbols do not resolve", condemning a good universe. Never treat 429 as a verdict on a symbol: only 404 means the symbol is unknown. `curl` succeeding while `node fetch` gets 429 is a recovery-window artefact, not a client difference — both are blocked together once tripped. Probe sequentially (~1.5s apart) and cache results so a throttled run resumes instead of restarting. (F14)

## Charges and the trading contract

- **The home page quotes no charge rates.** CNC vs MIS is explained as settlement versus 15:20 square-off, shorting rules, and the no-leverage point from `trading-contract.md` §1. §3 still carries a TODO that every rate needs a dated source before F06, and a second copy on the home page would be a second thing to keep in sync. Rates live on `/pricing` only. (F04)

- **`trading-contract.md` §3 had three things wrong, all corrected against Zerodha's published charge list on 2026-08-21.** NSE exchange transaction charge was stale at 0.00297% and is 0.00307%; the DP charge is ₹15.34 **inclusive** of GST, not "₹15.34 + 18% GST", which would have double-charged GST on every CNC sell; and DP is charged once per **scrip per day** in reality. This unblocks F06 and F22. (F06)

- **DP is charged once per sell order in this simulator — a deliberate divergence, documented in F08's simplifications.** Per-scrip-per-day would make `execute_order` query the user's same-day trades inside the locked transaction and give account reset another case to handle. (F06)

- **`charge_breakdown` splits DP into `dp_charge` ₹13.00 with its ₹2.34 GST rolled into `gst`**, so every rupee of GST sits in one key and `gst` never changes meaning depending on whether a DP charge was involved. The pricing page still shows ₹15.34, footnoted, because that is the number on a real contract note. (F06)

- **GST is computed on unrounded sub-components and rounded once**, resolving an ambiguity §2 left open. §13's sweep grep is also extended to charge terms — it matched only margin and P&L identifiers, so it could not detect drift caused by a §3 rate edit. (F06)

## Next.js behaviour

- **The 404 carries full public chrome; the error boundary carries none.** A mistyped URL is ordinary navigation and wants the nav, so `PublicShell` is extracted and shared — an unmatched URL never enters the `(marketing)` group, so the route-group layout cannot supply it. An error means this subtree already failed, so the fallback depends on as little as possible and stays a small client bundle. (F08)

- **A Server Component throw renders nothing server-side; the boundary appears on hydration.** `curl` shows an empty body and a 500, which looks like the white screen the criterion forbids — the check only means something in a browser. Proven with a temporary throwing route, then deleted. (F08)

- **Moving or renaming a route file leaves a stale `.next/types/validator.ts`** that fails `pnpm typecheck` *and* `pnpm build` on a module that no longer exists. `rm -rf .next` clears it. Every feature that moves a route will hit this. (F03)

- **Next treats leading-underscore directories as private and does not route them.** A `__boom/` test page builds clean and simply does not exist — an absence that reads as a routing bug. (F08)
