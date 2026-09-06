# Standing Constraints

> **Role:** What still binds — the decisions and non-obvious facts that constrain future work, grouped by topic.
> **Read before any decision that might conflict with past work.**
> **Relates to:** receives decisions displaced from `progress-tracker.md` and decisions promoted out of `build-journal.md` at phase checkpoints.

## How this file is maintained

This file is read **every session**, so every line costs on every session. It is the one place where
brevity is a hard rule rather than a preference.

- **One or two sentences per bullet:** the rule, and the reason it exists. Worked examples, measured transcripts, and the story of how something was found belong in `build-journal.md`. Git history holds anything trimmed from here.
- **Grouped by topic** (auth, testing, theming…), never by date. Add a `##` heading when a new topic is needed.
- **Holds only what still binds.** Never a narrative of what happened — that is the journal's job.
- **Two things feed it,** both moves and never copies: the oldest bullet of `progress-tracker.md` → Key Decisions when that section would exceed 10, and each phase's still-binding decisions promoted out of `build-journal.md` at the phase checkpoint.
- **Cite the feature each bullet came from,** e.g. `(F02)`.
- **Deduped on write.** A new constraint that supersedes one already here replaces that bullet in place.
- **Removed only when verifiably dead** — reversed by a later decision, or the thing it describes no longer exists. A sequencing decision that has since been carried out is dead; a rule the code still depends on is not.
- **Don't restate `trading-contract.md`.** It is authoritative and always read. Where a bullet exists only to explain why the contract says what it says, keep the reason and point at the section.

## Build plan sequencing

- **Candles and their retention both belong to F33**, not F15 or F16. No source covers the 1D/1W intraday ranges, and F33 is the first feature that draws a chart — retention logic before then would run against a table nothing populates. (F15, F16)
- **F07 shipped as two slices under one number**, A in Phase 1 and B after F09. Renumbering would have invalidated every journal and commit reference already written — the precedent to follow if another feature straddles a phase boundary. (F07, F08)
- **The market-status pill belongs to F17 and recomputes on a client timer.** Server-rendering it once would leave a tab open past 15:30 still reading OPEN, so the server passes the holiday set as a `string[]` and a client component calls the same pure `marketStatusAt` the tick gates on. (F17)
- **Watchlist search filters a preloaded universe in `cmdk`** — no trigram index, no migration, no round trip per keystroke. 200 rows is ~12KB and Postgres seq-scans a table that small whatever index sits on it. (F18)

## Environment and secrets

- **There is exactly one Supabase project and it is the real one:** `zerodha-rebuild-dev` / `kefggygenlprjzhiocai` / ap-south-1, in a separate Supabase account (`wolfgunblood214@gmail.com's Org`) the workspace MCP cannot see — the CLI authenticates by personal access token instead. A second test project was created and deliberately deleted: one project cannot silently pause while the other stays warm. (F08, revised 1.00.03)
- **`pnpm db:push:test` does not exist and must not be reintroduced.** One database means one push command, and `pnpm supabase db push` already is it. (F09)
- **`TEST_DATABASE_URL` must use the session-mode pooler, port 5432.** Tier 3 holds a transaction open across statements, which transaction-mode pooling on 6543 structurally cannot express. The port is load-bearing. (1.00.03)
- **The seed authenticates as the service role**, not through a test connection string. `instruments` and `market_holidays` grant `select` only, and seeding reference data is the administrative act that key exists for. (F14)
- **Environment validation is split across two modules.** `env.ts` holds the `NEXT_PUBLIC_*` variables and is safe anywhere; `env.server.ts` carries `import 'server-only'` so a client-side import of the service-role key fails the build rather than throwing at runtime. `register()` in `src/instrumentation.ts` forces validation at boot, and Next skips it during `next build` — so `build` stays green without secrets while `dev` and `start` fail by name. (F01)

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

- **The money tables grant `select` and nothing else** — no insert, update or delete for any client role on `funds`, `fund_ledger`, `orders`, `trades`, `holdings` or `positions`, and no write policy for any command. Every write arrives through a `security definer` function, so a write grant would exist only to be unused. (F11)
- **Supabase grants `anon` and `authenticated` ALL privileges on new public tables by default** — verified on `support_messages`, where SELECT, UPDATE, DELETE and TRUNCATE were all present, leaving RLS as the single layer. Revoke, then grant back only what a role needs. (F07B)
- **`revoke execute … from public` does not revoke a function from `anon` or `authenticated`.** Supabase sets default privileges granting EXECUTE directly to all three roles, so name all three in the revoke and assert `has_function_privilege(...)` is false rather than assuming. (F13)
- **On a public-write table, prefer a missing grant to a filtering policy** — if a permissive policy is ever added by mistake, the absent grant still refuses. (F07B)
- **No `anon` grant on any reference table.** The publishable key ships in the browser bundle, so granting `anon` select would publish the whole Nifty 200 universe to anyone who reads the JavaScript. (F10)
- **`security_invoker` is the boundary on a view, not a hand-written predicate.** The watchlist view carried both; falsification showed the predicate was holding the line and the invoker setting was free to drop with every test still green. The predicate is application code doing RLS's job, so it was removed. (F18)
- **Supabase's `verify_jwt` accepts any valid project key, including the publishable one in the browser bundle** — measured against the deployed `market-tick`. Any Edge Function that writes data therefore needs a second layer: a Vault-held secret compared in constant time before it touches the database, refusing rather than falling open when unset. (F16)
- **A table's write path ships with the feature that uses it, not with the table.** A granted, callable, untested function with no caller for eight features is the thing being avoided. (F10)
- **Three of `trading-contract.md` §12's identities are CHECK constraints, not test assertions** — identities 8, 12 and 6 are all row-level, so a violating row is unstorable rather than merely detectable later. (F11)
- **A CHECK constraint passes when its expression evaluates to NULL**, not only when it is true, so any nullable operand turns it into a suggestion. Wrap anything nullable (`coalesce(jsonb_typeof(...), '')`) and test the expression against malformed input before trusting it. (F11)
- **Retire an order's margin before its status leaves `OPEN`.** `orders_no_margin_unless_open` is a non-deferrable CHECK, so a statement moving an order out of `OPEN` while `blocked_margin` is non-zero fails with 23514. Release first, or write both columns in one `UPDATE`. (F11)
- **Foreign keys cascade from `orders` and from `profiles`** as a backstop against a future path that forgets a table; `reset_account` still deletes each one explicitly per §11. (F11)
- **Client-ID generation is its own function so exhaustion is testable.** `generate_client_id()` is separate from `handle_new_user()` because proving the 10-attempt bound requires stubbing it, and exhaustion must fail the signup loudly — a user admitted without a `funds` row would break every money function after it. (F13)
- **`OPENING_BALANCE` is a literal in SQL, pinned from both sides.** The migration writes `100000.00` citing `trading-contract.md` §11, pgTAP asserts a bootstrapped account holds exactly that, and a tier-1 test pins the TypeScript constant — both anchored to the contract rather than to each other. (F13)
- **The default watchlist seeds by `INSERT…SELECT` against `instruments`**, which is FK-safe by construction and idempotent whatever the seed contains. (F13)

## Charges and the trading contract

`trading-contract.md` is authoritative and always read. These record *why* it says what it says, and
the shape of the code that implements it.

- **The §6 collateral formula is written in exactly one place**, `short_collateral_requirement()`, called by `reserve_margin`, `transfer_margin_to_position` and `recompute_position_collateral`. A second copy is how a partial cover starts releasing the wrong amount. (F23)
- **`transfer_margin_to_position` owns the block path and `recompute_position_collateral` the release path.** The transfer runs *before* the trade and position rows are written and returns `(ok, required_collateral, entry_reference_price)`, so a shortfall has nothing to unwind; it is also the only writer of the `entry_reference_price` concept, which makes §12.11 structural rather than a rule to remember. (F23)
- **A short reserves its collateral up front, not its notional.** Reserving 100% of notional against a 120%-plus-charges requirement made `delta` positive on *every* short and let a user place a maximum-size short that its own fill then rejected. (F23)
- **A cover is reserved from its collateral, not from cash**, and an MIS sell crossing zero reserves only the shorting excess. Without both, a user who shorted most of their balance cannot close their own position. (F23, fixed at F24)
- **Reported P&L and settled cash are different numbers on a short cover** — see §7 and §12.11. Settling from `average_price` debits the entry charges twice and fails identity 1 on every cover. (F24)
- **A short entry writes three ledger rows, not two**, per §6 steps 4 and 6. The paired charge rows make "estimated charges are never paid twice" auditable in the ledger rather than netted away inside the function. (F23)
- **A fill crossing zero apportions charges pro-rata by quantity**, closing share rounded and the remainder to the opening leg, so the two always sum to `trades.charges`. (F24)
- **The success toast names the fill price, read back rather than returned.** One extra RLS-scoped select on `orders` after a `COMPLETE`; widening `place_order`'s return would have meant a migration against a function proven at three tiers, for one string. (F26)
- **`place_order` returns `(order_id, status, rejection_reason)`, not a bare uuid.** A business rejection returns normally, so `error` is null and the caller could not otherwise tell a fill from a rejection; raising would roll back the `REJECTED` row §4 requires. (F24)
- **Session logic is implemented exactly twice and proven equal at tier 4** — `_shared/market-hours.ts` and Postgres `market_state(at)`. `place_order` is granted to `authenticated`, so a gate living only in a Server Action is bypassed by anything calling the RPC directly. A third implementation is not permitted. (F24)
- **`execute_order` enforces §5's staleness window**, with `market_constants()` mirroring `_shared/market-constants.ts` as `charge_rates()` mirrors the rate table. Without it a Monday fill can execute against Friday's close. (F24)
- **Postgres holds the charge rates in one `IMMUTABLE` `charge_rates()` composite**, not literals or a table. Postgres inlines immutable SQL functions, so there is no per-call cost inside the locked transaction; a table would have made the function `STABLE` and put a lookup there instead. (F22)
- **`calculate_charges` returns `(total numeric, breakdown jsonb)`** so `execute_order` inserts both `trades.charges` and `trades.charge_breakdown` with no cast on the money path. (F22)
- **The charge parity test is its own read-only fourth tier.** Proving the TypeScript estimator and the Postgres calculator equal needs both in one process, and tier 3 is gated behind `ALLOW_RACE_TESTS` — putting it there would leave the feature's headline test skipped inside a green run. (F22)
- **`now()` ties every row a transaction writes**, so `fund_ledger.created_at`, `trades.traded_at` and `orders.placed_at` all use `clock_timestamp()`. F28 fills every crossed order in one run and F29 closes every position in one, so Reports would otherwise order a whole square-off arbitrarily. (F23, F24)
- **The rate table was corrected against Zerodha's published charges on 2026-08-21:** NSE transaction charge is 0.00307% (not 0.00297%), and ₹15.34 DP is *inclusive* of GST — treating it as the base double-charges GST on every CNC sell. `charge_breakdown` therefore splits `dp_charge` ₹13.00 with its ₹2.34 GST rolled into the single `gst` key. (F06)
- **GST is computed on unrounded sub-components and rounded once.** §13's sweep grep was extended to charge terms in the same change, since it matched only margin and P&L identifiers and could not detect a rate edit. (F06)
- **DP is charged once per sell order in this simulator** — a deliberate divergence disclosed on `/legal`. Per-scrip-per-day would make `execute_order` query the user's same-day trades inside the locked transaction. (F06)
- **The dashboard aggregates holdings only; MIS positions stay on `/positions`.** Kite's own split, and it keeps intraday sign handling out of a donut that would have to draw a negative slice. (F21)
- **Day's P&L is `Σ quantity × (ltp − prev_close)` over holdings**, now recorded in §9. Same basis as the watchlist's change column, so the two cannot disagree on screen, and it needs no read of `trades`. (F21)
- **The watchlist's change is computed in Postgres, in a `security_invoker` view**, which also makes the panel one round trip and gives F30 and F33 the same shape to read. (F18)
- **The home page quotes no charge rates.** Rates live on `/pricing` only; a second copy would be a second thing to keep in sync. (F04)

## Order entry

- **Margin shown in the ticket is position-aware, and proven exactly equal to the engine at tier 4.** `src/lib/trading/margin.ts` implements §6's reservation rules over the user's actual holding and position; the naive notional figure would demand ₹10,029 where the engine reserves ₹29. The build plan's "within one paisa" was corrected to exact — a looser bar hides the drift the test exists to catch. (F25)
- **The ticket fetches the symbol's holding and position when it opens**, one RLS-scoped query, rather than server-rendering the whole portfolio into every terminal page. Fresh by construction, one round trip per open rather than per keystroke. (F25)
- **The order ticket is mounted once in the terminal layout and opened through a `useOrderTicket` store.** F18's watchlist panel renders twice — the `md` rail and the mobile sheet — so a per-row dialog would mount two copies of the same form for one symbol. (F25)
- **A rejection closes the ticket.** The row is already filed as `REJECTED`; leaving the dialog open would imply it is still editable, and each retry would file another order. F25's inline `failure` state becomes unreachable and goes with it. (F26)
- **A rejection is `ok:false` with `code` set to the reason; a fault is the only thing that is not a normal return.** Every caller then uses the one failure branch it already has, and `code-standards.md`'s toast-on-failure rule applies unchanged. (F26)
- **The limit price is a `Controller` mapping empty to `null` at the field**, because an uncontrolled `type="number"` input has no single "empty" value: `''`, `null`, `undefined` and `NaN` all reach the schema depending on whether the user or `setValue` wrote last, and `Number(null)` is 0 — so a user who typed nothing was told their price must exceed zero. (F25)
## Testing

- **Tier 3 commits into the production database.** It cannot be avoided — proving two connections cannot both fill an order requires the first to commit. Three guards are mandatory: `ALLOW_RACE_TESTS` must be set or `pnpm test:race` exits, seeded rows carry a recognisable prefix, and `afterEach` cleanup runs on failure too. A crashed process can still strand rows; that is the accepted residual risk. (1.00.03)
- **Through the pooler, find a blocked backend by pid, never by `pg_stat_activity.query`.** A `query ilike '%fn%'` poll timed out roughly one run in three with the block plainly present — the dump showed a backend `idle in transaction` on `Lock`/`transactionid` whose `query` still read `begin`. Capture the pid inside the transaction, which session mode pins, and poll `pg_blocking_pids($1)`. (F29)
- **A tier-3 test that pre-locks a row to stage an interleaving is asserting a lock order too.** `squareoff.race.test.ts` staged on the position row; when the sweep's own order was corrected, the staging became the inversion and deadlocked. Stage on the first lock the function under test takes. (F29)
- **A tier-3 pre-flight that excludes its own fixture symbol cannot see a stray from a crashed run**, and a stray makes the swept set multi-row so the staged interleaving is no longer the one being asserted about. Check before seeding, across every symbol. (F29)
- **`supabase test db` requires Docker even with `--db-url`** — it connects to the remote database, then shells out to `pg_prove` in a container and dies with `LegacyDockerRunError`. Tier 2 runs through `scripts/run-pgtap.mts`, which reads pgTAP's TAP output back as text rows. (F09)
- **The tier-2 runner must fail on a plan mismatch, not only on `not ok`.** A suite declaring `plan(2)` that runs one assertion has a bug; all three failure modes were observed failing before the runner was trusted. (F09)
- **pgTAP is enabled by a tracked migration, never created ad hoc by the runner** — an untracked extension the tests silently depend on means a fresh database looks healthy right up until the suite runs. (F09)
- **The tier-2 runner is a standalone TypeScript script**, run by `node scripts/run-pgtap.mts`. Keeping it out of Vitest means nothing about tier 2 can be picked up by `pnpm test`. (F09)
- **Tier 3 is gated by `scripts/run-race.mts`, which decides before Vitest starts**, so an un-permitted run never imports `pg` at all. (F09)
- **Prove a negative with a positive control.** A first attempt used `console.log` and saw nothing in *either* case, because Vitest suppresses it — an absence that looked like evidence and was not. (F09)
- **A pgTAP assertion running as the owning role is not filtered by RLS**, so an unscoped query sees every real row in the database. Scope owner-role assertions to their fixture; assertions under `set local role authenticated` are safe because RLS scopes them. (F13)
- **When the function under test is deliberately unscoped, the fixture must clear the world instead.** `select_demanded_symbols` asks what the whole system wants refreshed, so `04-market-tick` empties the demand tables outright. Safe only because the suite always rolls back. (F16)
- **Market-time logic takes its calendar as an argument so tier 1 can falsify it.** `marketStatusAt(at, holidays)` and `isTradingSessionAt(at, holidays)` are pure; the database-backed wrappers load the calendar and delegate. (F15)
- **The market-hours core is shared, not duplicated, so the planned drift test was never written.** An Edge Function cannot import from `src/`, but the dependency runs the other way: the pure logic lives in `supabase/functions/_shared/`, read relatively by Deno and through `@shared/*` by the app. Removing the duplication removes the failure instead of policing it. (F16)
- **Tier 1 runs in Vitest's node environment with no jsdom and no Testing Library** — neither is an approved dependency, and tier 1 is scoped to pure logic. Component behaviour is proven in the browser. (F01)
- **`server-only` cannot be imported by Vitest** and is aliased to the package's own `empty.js` in `vitest.config.mts`. `next build` still resolves the throwing entry for client bundles, which is what the falsifiability check exercises. (F01)
- **`fetch-reference-data.mts` treats any probe failure as "this symbol does not exist"**, so one transient Yahoo 5xx kills a ~5-minute 200-symbol run. Only 404 should be a verdict. **Not fixed** — the script is manual, rare and re-runnable. (F14)

- **A tier-2 suite that empties a reference table must empty its dependants too.** F26 made the app able to write `orders`, and the first real order turned `pnpm test:db` red permanently on `orders_symbol_fkey` — a failing test tier caused by using the product. The deletes roll back, so the fix is cheap; the bug it prevents is a suite whose result depends on what the account holds. (F26)

## Database concurrency

- **One lock order everywhere: `orders` → `funds` → `holdings`/`positions`**, set by `execute_order` and pinned by `15-lock-order.sql`, which reads the sequence out of each live definition. `square_off_mis` held a position row across its `execute_order` call and deadlocked with any concurrent order on the same user and symbol — **adding a guard under a row lock is also a change to lock order.** (F29)
- **`transfer_margin_to_position` and `recompute_position_collateral` take `positions` before `funds`**, and are safe only because `execute_order` holds both before calling them. Any new caller — F31's exit button is the likely one — must already hold that user's funds row. (F29)
- **A `raise warning` + counter exception handler can make a concurrency bug look like a clean run.** `square_off_mis` swallows a deadlock (`40P01`) as a "fault" — and `match_open_orders` carries the identical handler — so removing the position lock left the end state identical and every end-state assertion green. Assert what a sweep returns, not only what it left behind. (F29)
- **`add_watchlist_item` still races on `sort_order`, and its own comment describes the wrong failure.** The real defect is that `select max(sort_order) + 1` is unserialised, so two concurrent adds take the *same* `sort_order` — the duplicate state that makes reorder a silent no-op until `move_watchlist_item` renumbers. **Not fixed**: the fix wants `select … for update` or an advisory lock plus a tier-3 test, and tier 3 commits into the one real database. Whoever next touches the watchlist writes owns this. (F18)

## Verification routine

- **`quotes` cannot show that a price advanced, and the per-minute record expires.** Its PK is `symbol`, so the tick upserts in place and the table only ever holds current state — "distinct minutes written" is always 1 however long the job has run. The per-run evidence is in `net._http_response`, which **`pg_net` retains for only ~6 hours**; gather it the same day, or fall back to `cron.job_run_details`, which is kept far longer. (F16, closed 2026-09-04)
- **A backgrounded tab freezes animations and dispatches no focus events.** `element.focus()` sets `document.activeElement` and fires nothing, not even native listeners bound directly; CSS animations never reach `animationend` and `requestAnimationFrame` never fires. **Read `document.visibilityState` before believing an automated check that says an interaction does nothing** — five features have lost time to this. Two consequences bite hardest: a Radix dialog closed while hidden never reaches `animationend`, so it stays mounted and its `z-50` overlay swallows every later click (`elementFromPoint` returns the overlay, not the button), and a minimised window can stop delivering synthetic clicks altogether — no `click` event reaches the document at all. Hover coordinates are also in screenshot space, not CSS pixels: at `innerWidth` 1640 against a 1456-wide capture they differ by ~12%. (F17, F19, F20, F27)
- **Kill `next start` by PID from `lsof -nP -iTCP:3000 -sTCP:LISTEN` before trusting any post-rebuild check.** `pkill` does not reliably stop it, and the surviving process keeps port 3000 and serves the *previous* build — which has silently invalidated a verification pass twice. (F03, F04)
- **`resize_window` does not change `window.innerWidth`** in macOS fullscreen; it reports success and does nothing. Measure inside a 375×760 `<iframe>`, or drive headless Brave through the `puppeteer-core` that ships under `lighthouse`. (F03, 1.00.06)
- **pnpm appends extra script arguments rather than substituting `$1`**, so `audit:a11y` silently audited `/` and returned a plausible score. The script is wrapped in a shell function; confirm the target by reading `finalDisplayedUrl` out of the report, not by trusting the score. (F05)

## Local development environment

- **A blank white page on `localhost:3000` is usually HTTP 431, not a rendering bug.** Cookies are scoped by host and ignore port, so every Supabase app ever run on `localhost` piles its `sb-<ref>-auth-token` chunks into one jar; crossing Node's 16 KB header limit kills the request **before Next.js sees it** — no error page, no log line. The same limit silently kills Server Action POSTs. Diagnose with `document.cookie.length`, then clear the foreign `sb-*` cookies or set `NODE_OPTIONS=--max-http-header-size=32768`. (F12)

## Supabase CLI

- **`src/types/database.ts` is in `.prettierignore` and must stay there.** `supabase gen types` emits double quotes where Prettier wants single, so formatting it makes `format:check` fail after every regeneration — on a file that is never hand-edited. (F10)
- **Dropping a function discards its ACL, and Supabase's defaults then re-grant EXECUTE to `public`, `anon` and `authenticated`.** `create or replace` cannot change an OUT-parameter row type, so widening a `returns table (...)` means a drop — and the recreated function is callable from the browser unless the revoke is repeated. Caught by `11-order-identities.sql`, which asserts exactly which functions a browser can reach. (F29)
- **`supabase migration new` can hang past a 120s timeout having already written the file.** Check before assuming it failed and re-running. (F09)
- **There are two Supabase CLIs on this machine** — Homebrew 2.111.0 and the project's pinned 2.115.0 — and authenticating one does not authenticate the other. An absent `~/.supabase/` proves nothing; `supabase projects list` failing is the only reliable check. (1.00.03)

## Accessibility

- **Lighthouse cannot audit any `(terminal)` page.** It carries no session, follows the redirect, and reports a perfect score for the login page — a 1.00 that says nothing about the page requested. Signed-in pages need an authenticated run or a DOM-level check. Applies to all of Phase 5 and F38. (Phase 3 checkpoint)
- **A Lighthouse 100 is not evidence about tap targets** — target size is not in its audit set. `/support` scored 100 with every `<summary>` 20px tall, under WCAG 2.2's 24px minimum. Measure `getBoundingClientRect()` at 375px. (F07)
- **A horizontally scrollable region needs `tabIndex={0}` and a labelled `role="region"`**, or keyboard users cannot reach the overflowing columns. Lighthouse does not audit this; axe does. Applies to every table in Phase 5. (F05)
- **A dialog opened from a store restores focus itself; Radix cannot.** Radix returns focus to its `DialogTrigger`, and a dialog mounted once and opened imperatively has none. The store captures `document.activeElement` at the click and `onCloseAutoFocus` puts it back, guarding `isConnected`. Applies to every call site F31 and later add. (F25)
- **A Radix `DropdownMenuItem asChild` must wrap the interactive element, never a `<form>`.** The menu item handles Enter and Space with `event.currentTarget.click()`, and `HTMLFormElement.click()` has no default action — so a form-as-menu-item is mouse-operable and dead to the keyboard. (F17)
- **Recharts stamps `role="application"` on its SVG**, which hands a screen reader every keystroke and breaks browse mode. Pair every chart with a table carrying the same numbers and mark the chart `aria-hidden`. (F21)
- **Reorder ships as move-up / move-down, not drag.** Drag alone is unreachable by keyboard and the project has no drag-and-drop dependency; buttons write the same `sort_order`. (F18)

## Theming and design tokens

- **Every `dark:` utility is stripped from added components.** Tailwind v4 binds `dark:` to `prefers-color-scheme`, so a leftover `dark:` class follows the visitor's OS rather than this project's theme class. A grep guard enforces it. (F02)
- **Interpolated class names generate no CSS.** Tailwind scans source for complete strings, so `bg-chart-${n}` produces nothing. Write every variant out literally. (F02)
- **`cn()` silently deletes a custom type size when it meets a colour.** tailwind-merge cannot tell `text-number-sm` (a size) from `text-ink` (a colour) and drops one with no warning. `src/lib/utils.ts` declares the project's `--text-*` scale to `extendTailwindMerge`; **a size added to `globals.css` and not to that list starts disappearing.** (F19)
- **Every text token clears WCAG AA against canvas, surface and surface-elevated in both themes**, and `theme-tokens.test.ts` computes the ratios rather than trusting the eye. The muted tones invert in `.light`, because on a light ground "more prominent" means darker. (1.00.01)
- **`text-brand` is only legible on dark surfaces — the one contrast failure still open.** Brand yellow is 11–13.5:1 on dark and 1.37–1.43:1 on light, because F02's invariant keeps `--color-brand` byte-identical across themes. Use `text-ink` for figures and headings and reserve brand for CTA *backgrounds*. Filed against F38. (F06)
- **`--color-muted` is for links, captions and column headers — never running paragraph copy**, which uses `--color-body`. The misuse also fails WCAG AA, and `--color-muted-strong` does not fix it; a real fix needs `.light` overrides for both and belongs to F38. (F04)
- **Validation errors are `text-body`, not `text-down`.** `--color-down` means "price fell" everywhere in the app. The red signal comes from the shadcn bridge instead, where `--color-destructive` maps onto `--color-down`. (F25)
- **The `--color-chart-*` ramp is measured, not chosen, and `chart-ramp.test.ts` holds it that way.** Three rules bind any edit: hue alone cannot separate ten categories for a deuteranope, so the ramp steps *lightness* too; the contrast target is `--color-surface`, not `--color-canvas`, because every chart ships beside a table carrying the same numbers; and **no green and no red at all**, since any green reads as "up" on a trading screen. (F21)
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
- **The watchlist rail lives in the layout beside `<main>`; only the sheet trigger lives in the nav.** One component rendering both shells put the 288px `aside` inside the header's 64px flex row. `WatchlistRail` and `WatchlistSheet` are separate exports over one shared `WatchlistPanel`. (F17)

## Marketing site

- **The support form uses React 19's form action and `useActionState`, not react-hook-form**, so it submits and validates without JavaScript. `code-standards.md` carries the exception to its own Server Action shape rule. (F07B)
- **FAQ disclosure is native `<details>`/`<summary>`** — zero JavaScript, and keyboard operation, focus handling and screen-reader semantics come from the browser rather than being hand-written and audited at F38. (F07)
- **`support_messages` carries CHECK length bounds and a honeypot, and volume abuse is deliberately unmitigated.** The publishable key ships in the browser bundle, so bounds cap the damage per request and real rate limiting is out of scope for a portfolio contact form. (F07B)
- **The three honesty sections divide by purpose, not subject.** Home carries price provenance, About carries the Real / Simulated inventory, `/legal` carries the consequences and divergences — because a notice has to stand alone. (F05)
- **The home page documents all four provenance states and says plainly that `LIVE` never appears in this build.** `PROVIDER_IS_REALTIME` is `false` for all three providers. (F04)
- **The About page's stack table renders from a typed `src/lib/stack.ts` guarded by a bidirectional drift test** — every `installed` row's version must equal `package.json`'s, and every `planned` row's package must be absent from it. Packages later phases install render as "planned", never with an invented version. (F05)
- **All external links go through a shared `ExternalLink`** carrying `target="_blank" rel="noreferrer"` and an sr-only "opens in a new tab", which turns a recurring requirement into a grep for raw `target="_blank"`. (F05)
- **The hero is typographic — no mock terminal UI.** F40 can screenshot the finished terminal, which beats maintaining a hand-built fake. (F04)
- **The simulator disclaimer is dismissible and remembered, with no flash.** A blocking inline script stamps `data-disclaimer` on `<html>` before first paint and CSS hides the strip off that attribute — the same technique `next-themes` already uses, keeping the layout a Server Component. (F03)
- **Mobile nav is the shadcn `sheet` primitive**, which is Radix Dialog — no new dependency, and it brings focus trap, Escape handling and scroll lock rather than leaving all three to F38. (F03)

## Live prices and interpolation

- **The interpolation loop tweens between server anchors and invents nothing.** The displayed value always lies on the closed segment between the previous and current anchor — strictly stronger than "within X% of the anchor", and testable at tier 1 with no DOM. The build plan's "micro-ticks bounded to a small band" was bounded jitter and was rewritten. (F19)
- **Dashboard money tiles jump on the anchor and never tween.** `architecture.md` contradicted itself; the invariant wins — every monetary total renders the server anchor. Tiles still recompute from anchors so they do not sit frozen beside a ticking watchlist. The index strip stays ambient. (F21)
- **Never subscribe a component to `state.quotes` wholesale.** The interpolation loop rebuilds that map every frame, so the component re-renders ~60×/s for ~800ms after each tick — one of them a Recharts SVG. Select flat maps of primitives through `useShallow`. (Phase 3 checkpoint)
- **Rows read `store ?? prop` with the store seeded in an effect**, so server and first client render match and a symbol with no quote keeps its em dash. (F19)
- **`seedQuotes` adopts a server row that is *fresher*, not merely one for an unseen symbol.** The store lives in the terminal layout and survives client-side navigation, so skipping on presence alone pinned a symbol to its first seed for the whole session whenever Realtime never delivered. Compare `fetchedAt`. (F19)
- **Realtime can subscribe successfully and deliver nothing, silently.** It authorises each subscriber against RLS by JWT, and the cookie session loads asynchronously — subscribing before the token exists opens a socket that reports `SUBSCRIBED` and never fires. Await `getSession()` and `realtime.setAuth(token)` before `.subscribe()`, and always pass a status callback. (F19)
- **The Realtime channel subscribes to `UPDATE` only, so a symbol's *first* quote row never reaches an open browser.** Any feature that adds a symbol to a live page needs an `INSERT` subscription or a `router.refresh()`. (Phase 3 checkpoint)
- **Every surface that renders a price must pass provenance for the *server* row too, not only the live one.** `PriceWithProvenance` renders an em dash whenever provenance is null, so `provenance={live ? … : null}` renders every price as an em dash in the SSR HTML. Use `serverProvenance(row, now)` as the fallback. **Hydration hides this** — only the fetched HTML shows it. Applies to F30, F31 and F33. (F20)
- **Provenance is announced, not merely hoverable** — the facts render as `sr-only` text tied to the price by `aria-describedby` as well as in a HoverCard, because hover does not exist on touch and never fires for a screen reader. (F20)
- **Only STALE prices are muted, not SIMULATED.** Every price in this build is simulated, so muting them all would grey the whole terminal and the treatment would stop carrying information. (F20)
- **Only symbols currently rendering a price feed the data-source badge.** `worstSource([])` returns STALE by design, so counting symbols with no quote row would pin the badge to STALE on account of absent data. A row showing an em dash makes no claim. (F20)
- **One ticking clock provided from the terminal layout, so the badge and every price read the same instant** — otherwise a row can render DELAYED under a badge saying STALE. F17's market-status pill keeps its own timer, because it must land *on* the session boundary. (F20)
- **The watchlist's day change is recomputed on the client once prices are live.** Display-only and never persisted, so the money rule — which forbids computing a figure in TypeScript *and storing it* — is untouched. (F19)
- **The index strip is a derived composite over our own priced universe, never a named index.** NIFTY 50, SENSEX and BANK NIFTY exist nowhere in the data, so the strip shows an equal-weighted mean day change with advances/declines and the constituent count on screen. Simulating an index level would have fabricated data in the most prominent chrome on the page. (F17, F21)
- **`touch_symbol_demand` fires twice while the mobile sheet is open**, because `WatchlistPanel` is mounted by both the rail and the sheet. Harmless — the RPC is idempotent — but worth hoisting the hook when F37 touches this. (F18)
- **Realtime on `orders` calls `router.refresh()` rather than patching client state.** Orders are server state and never enter Zustand, and a refresh also picks up the cash and margin the same fill moved — which a row-level patch would leave stale in the header beside a row that had updated. The channel still filters `user_id` server-side: RLS scopes delivery, but an unfiltered subscription has every row delivered to and authorised for every subscriber. (F27)

## Quote providers

- **Yahoo is deferred to the end of the project, so the build ships simulator-backed** and every price badges `SIMULATED`, which is honest by construction. **What must not ship is that state alongside copy promising real prices:** either Yahoo lands or `/` and `/about` are reconciled before F39 deploys. (F14)
- **Twelve Data's free plan carries no NSE symbols at all** — verified against the live API with a real key. A plan entitlement, not a symbol-format issue, and its 800 credits/day could not sustain a one-minute tick even with access. The chain is Yahoo → simulator. (F14)
- **Yahoo throttles bursts at the IP level and the block outlasts any in-process backoff.** Never treat 429 as a verdict on a symbol — only 404 means the symbol is unknown. Probe sequentially (~1.5s apart) and cache results so a throttled run resumes. (F14)
- **The circuit breaker cannot open across ticks, so it does not yet do its job.** `createQuoteService` is called inside the request handler and its counts are closure-local, so a fresh invocation every minute gets a full `failureThreshold` of fresh attempts forever. Harmless while the simulator is the whole chain; **the feature that adds Yahoo must move that state to a table.** (F15, F16)
- **The provider seam is built but the limiter is not.** A token bucket in front of a local simulator caps nothing, so it waits for a provider that makes outbound requests. (F15)
- **The simulator walks from a real NSE close, seeded into `instruments.prev_close` from bhavcopy.** The close is a seed and never a quote — no `NSE_BHAVCOPY` provider value, no provenance derived from it, never rendered as a live price. (F15, narrowed F16)
- **`quotes.prev_close` rolls at the first in-session tick, derived from the row rather than scheduled.** A 15:30 job would leave the roll undone whenever a run was missed; because the condition is a fact about the row, the next tick repairs it and it is idempotent within a session. **`loadAnchors` must therefore prefer `quotes.prev_close` over `instruments.prev_close`** — reading the seed trapped every simulated price within 5% of the day the universe was seeded. (F16)
- **Watchlists join the tick's demand union.** `symbol_demand` had no write path until F18, so the union as originally specified would have selected zero symbols and shipped the whole write path untested. (F16)
- **Refresh and seed are separate acts.** `fetch-reference-data.mts` hits NSE and Yahoo and rewrites committed JSON; `seed-reference.mts` reads that JSON and upserts. NSE's endpoints are undocumented, so a seed depending on them live breaks unpredictably and offers no diff to review. (F14)
- **Every `yahoo_symbol` is probed at refresh time, not sampled**, and the fetch refuses to write on any failure. A five-symbol spot check would sample 2.5% of the universe and miss a symbol that never quotes until Phase 5. The universe is seeded with `yahoo_validated: false` recorded in the JSON, because `${symbol}.NS` remains a derivation nothing has confirmed live. (F14)

## Next.js behaviour

- **Moving or renaming a route file leaves a stale `.next/types/validator.ts`** that fails `pnpm typecheck` *and* `pnpm build` on a module that no longer exists. `rm -rf .next` clears it. (F03)
- **A Server Component throw renders nothing server-side; the boundary appears on hydration.** `curl` shows an empty body and a 500, which looks like a white screen — the check only means something in a browser. (F08)
- **Next treats leading-underscore directories as private and does not route them**, so a `__boom/` test page builds clean and simply does not exist. (F08)
- **The 404 carries full public chrome; the error boundary carries none.** An unmatched URL never enters the `(marketing)` group, so `PublicShell` is extracted and shared; an error means the subtree already failed, so its fallback depends on as little as possible. (F08)

## Documentation upkeep

- **Nothing sweeps the non-money documents, so the phase checkpoint is where they get reconciled.** `trading-contract.md` §13 has a sweep because money rules are restated in four files; the same restatement problem exists outside money with no equivalent guard. Re-read the non-money docs against the code at every checkpoint. (1.00.06)
- **`context/` is read in tiers, not whole.** Reading every document at session start cost >100k tokens, most of it phases already shipped and libraries the session never touched. `CLAUDE.md` carries the always list and the trigger table; the cost of adding a line to an always-read file is paid by every future session. (4.00.02)
