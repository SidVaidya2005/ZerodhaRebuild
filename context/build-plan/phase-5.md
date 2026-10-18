> Part of `context/build-plan.md`; see that index for the build principle and phase order.
> Read the feature needed for the current task. `progress-tracker.md` holds current status.
> These specifications retain implementation-time decisions and dated verification results. Check
> current rules in the authoritative context files before reusing an older plan. Ongoing constraints
> live in `constraints.md`; the account of past work lives in `build-journal.md`.

## Phase 5 — Portfolio Pages

### 30 Holdings page

Show delivery holdings with automatically updated valuations. Reuse F21's `portfolio_holdings`
and `portfolio_summary`, which already calculate every figure. `(terminal)/layout.tsx` already
includes held symbols in the quote channel, so this feature needs no migration or new SQL.

**UI:**

- Columns: instrument, quantity, average cost, invested, LTP, current value, overall P&L, day change — P&L coloured by sign, with an explicit +/− so colour never carries it alone.
- Day change is rupees (`day_pnl`, the column the footer sums) with the stock's own per-share % beneath it, on the same `prev_close` basis the watchlist uses (§9).
- `<tfoot>` totals aligned under the columns they total: invested, current value, overall P&L, day P&L. **Invested is a row column for this reason** — a footer total with no column above it cannot be read as the sum of anything.
- Every column sortable, client-side and persisted nowhere. Default symbol ascending; money columns default to descending. `aria-sort` on the header, arrow for sighted users.
- Per-row Exit opens the layout's single ticket pre-filled `SELL` / `CNC` / full quantity.
- Empty state for a user holding nothing — distinct from the dashboard's, which speaks to an account that has never traded at all.
- Aggregate provenance line under the table, and the unpriced-holding disclosure, both as F21's tiles do.

**Logic:**

- Read `portfolio_holdings` and `portfolio_summary` on the server. Check nullable values explicitly; never coerce them with `Number(null)`, which produces `0` and would turn an unknown valuation into a stated one.
- Update the entire row, including its LTP, from the server anchor. No value on this page reads the store's interpolated `ltp`. Use one `useHoldingPrices` call for `recomputeHolding` and `recomputeSummary`, so rows and footer totals change in the same render.
- Describe LTP with `anchorProvenance()`. `provenanceOf` describes the store's interpolation state and would incorrectly label the anchor as interpolated during an animation. For a symbol not yet in the store, fall back to `serverProvenance` (F20).
- Rows sort on the restated anchor values, so ordering always matches what is on screen; an unpriced holding sorts last in both directions rather than reading as the worst performer.
- `OrderChannel` is mounted so a fill re-renders the page — holdings are server state and a full sell deletes the row (§8).

**Verify:**

- Footer totals equal the sum of the rows — tier 1, `recomputeSummary` against the sum of `recomputeHolding` over one hand-computed fixture, both sides also asserted against the hand figures. `pnpm test`
- A CNC sell of the entire holding deletes the row rather than leaving quantity zero — tier 2, `10-orders.sql` §M, asserting both that the sell fills _and_ that the table is empty, since either alone passes on a build where the sell failed. `pnpm test:db`
- An unpriced holding renders em dashes and is counted, never valued at zero — tier 1.
- The LTP announces itself as reported rather than interpolated while a tween is in flight — tier 1 on `anchorProvenance`.
- Provenance is present in the **server-rendered** HTML, not only after hydration (F20). Browser.
- A live tick moves a row's P&L and the footer total together. Browser, market hours.
- Exit opens a CNC sell pre-filled with the full quantity, and focus returns to the Exit button on close (F25). Browser.
- Sort headers flip `aria-sort`; the scroll region is focusable and labelled at 375px. Browser.

### 31 Positions page

Show intraday positions, including shorts. F21 supplied holdings views but no equivalent for
positions, so this feature adds a migration with two `security_invoker` views. These run with
the caller's permissions, letting RLS control whose positions are returned. The page reads and
narrows their results.

**UI:**

- Columns: instrument, net quantity (negative for shorts), average price, LTP, unrealised P&L, realised P&L, collateral — P&L coloured by sign with an explicit +/−, so colour never carries it alone.
- Show `positions.blocked_margin` as collateral for a short and an em dash for a long. This explains the blocked cash in the simulated account before F32 adds the Funds page.
- `<tfoot>` totals under the columns they total: unrealised, realised, collateral.
- Every column sortable, client-side, persisted nowhere. Default symbol ascending; money columns default to descending. `aria-sort` on the header.
- Per-row Exit opens the layout's single ticket pre-filled MIS MARKET for the whole position — `SELL net_quantity` for a long, `BUY |net_quantity|` for a short.
- A banner counting down to the 15:20 square-off, and an empty state distinct from the dashboard's.
- Aggregate provenance line and the unpriced disclosure, as F21's tiles and F30's table do.

**Logic:**

- Create `portfolio_positions` from `positions ⋈ instruments`, with `left join quotes` so missing prices do not hide positions. Use one signed formula for unrealised P&L in both directions: `net_quantity × (ltp − average_price)`. For a short of 100 at ₹99.70 and LTP ₹90, this gives `−100 × −9.70 = +970`, the same result as §9's `(average_price − exit_price) × quantity`. Do not maintain separate formulas with a direction-based `case`.
- **Do not select `entry_reference_price`.** It is the gross basis for collateral and short-cover cash settlement (§6–§7), while reported P&L uses `average_price` (§12.11). Excluding it from this view prevents the page from using the wrong average for valuation.
- **`portfolio_positions_summary`** — driven from `funds`, so an account with no positions still returns a row and the page can tell an empty portfolio from a failed read. Carries `position_count` and `unpriced_count` through `count(col) filter`, since `count(*)` would report the left-joined phantom.
- Exit through `place_order`; **never call a collateral function directly**. `execute_order` locks `orders → funds → positions`. `recompute_position_collateral` takes the last pair in reverse order and is safe only when `execute_order` already holds both locks. Calling it directly could deadlock with another order, the ABBA cycle described in `constraints.md`.
- No new margin arithmetic: `src/lib/trading/margin.ts` is already position-aware and proven equal to the engine at tier 4, so a covering buy reserves only its charges (§6).
- The whole row jumps on the anchor, LTP included — `anchorProvenance()` for its claim, `serverProvenance` as the fallback (F20). Rows sort on restated values; an unpriced position sorts last in both directions.
- The countdown reuses `MarketStatusPill`'s shape — `holidays: string[]` plus `serverNow`, the same pure `marketStatusAt`, a client timer. Server-rendering it would be wrong within a minute.
- The scroll wrapper gets a positioned ancestor, so this table does not become the third instance of the `sr-only` escape measured on `/orders` and `/holdings`.
- `OrderChannel` is mounted: a full exit deletes the row (§8), and positions are server state that never enters Zustand.

**Verify:**

- An intraday buy appears here and not in Holdings; a CNC buy does the opposite — tier 2 in `06-portfolio.sql`, asserting each view returns exactly its own row. `pnpm test:db`
- Exiting writes the closing trade, `trades.realised_pnl` matches §9 by hand, and the position row is **deleted** — tier 2 over both a long exit and a short cover, since either assertion alone passes on a build where the exit silently failed.
- Unrealised P&L is correct in both directions and a short's moves opposite to price — tier 1 over `recomputePosition` against hand figures, plus a tier-2 assertion that the view agrees with the same fixture.
- A short shows negative quantity and non-zero collateral; a long shows an em dash there — tier 1 on the value mapping, confirmed in the browser.
- Footer totals equal the sum of the rows — tier 1, `recomputePositionsSummary` against the sum of `recomputePosition`, both sides pinned to hand figures.
- `entry_reference_price` reaches no component — `grep -rn 'entry_reference_price' src/` returns nothing under `components/`.
- The scroll region is focusable and labelled at 375px and the page does not scroll sideways — browser, measuring `document.body.scrollWidth` against `clientWidth`, the check that caught 521px on `/holdings`.
- Provenance is present in the **server-rendered** HTML, not only after hydration (F20). Browser.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and `pnpm format:check` all exit zero.

### 32 Funds page

Show account cash, margin and the cash ledger. Add one view and a Server Action for reset;
the reset's money logic already lives in `reset_account()`. That function is `security definer`,
gets the user from `auth.uid()`, and is granted to `authenticated`.

**UI:**

- Cards: available cash, used margin, opening balance, **realised P&L**.
- Show realised P&L as `Σ trades.realised_pnl`: closing legs after their closing charges (§9). Funds reads no quotes, so it needs no price provenance, anchor handling or unpriced count. Unrealised P&L belongs on Dashboard and Holdings; §9 defines why it answers a different question.
- Ledger table: type, amount, running balance, related order, timestamp. Server-paginated and filterable by type through `searchParams`, so the view is shareable and back-button correct.
- "Reset account" behind a confirmation dialog naming exactly what is destroyed — with counts read from the database, not estimated — and what survives.

**Logic:**

- Create `funds_overview` as a `security_invoker` view starting from `funds`, so an account that has never traded still returns a row. Return the three `funds` columns, realised P&L and the five counts used by the reset dialog in one read; otherwise the page would need seven requests and a money sum outside Postgres. The view's `where user_id = f.user_id` clauses connect each subquery to its outer account row. They are correlation, not replacements for RLS like the predicate F18 removed from `watchlist_rows`.
- `resetAccount` Server Action calls `reset_account`, then `revalidateTerminal()` — a reset moves cash and margin, which the terminal chrome renders on every page. No redirect: the user watches Funds return to the opening state.
- **The dialog is a self-contained component, because F35 mounts the same control** and its Verify requires the two behave identically. Page-local markup would guarantee a second copy.
- Ledger reads order `created_at desc, id desc` before `.range()` — `.range()` is 0-based inclusive and needs a companion order or the page boundaries are non-deterministic. The related order arrives through the `orders(symbol, side, product)` embed; `fund_ledger` has a single FK to `orders`, so no disambiguating hint is needed.
- Invalid `?type=` or `?page=` falls back to defaults. A hand-edited URL must not produce an error boundary.
- The scroll wrapper is positioned, focusable and labelled, as F31's is.

**Verify:**

- Realised P&L equals `Σ trades.realised_pnl` and the five counts match their tables — tier 2, new suite, against a hand-built fixture; plus a never-traded account returning a zeroed row rather than none. `pnpm test:db`
- The view is caller-scoped, proven by the `security_invoker = off` falsification that made F18's lesson stick — tier 2.
- Pagination and filtering are correct at the boundaries — tier 1: page 1 → `range(0, 49)`, page 2 → `range(50, 99)`, `?page=0` and `?page=abc` clamp to 1, an unknown `?type=` falls back to unfiltered. `pnpm test`
- No path resets without the dialog — browser: the page exposes no form or button calling `resetAccount` outside the dialog's confirm.
- Reset returns the account to the post-signup state **through the UI** — browser, end to end: the cards read ₹1,00,000 / ₹0 / ₹1,00,000 and the ledger holds exactly one `SIGNUP_CREDIT`.
- **Already proven, cited rather than rewritten:** §11's database guarantee is `10-orders.sql` section L (everything wiped, one fresh `SIGNUP_CREDIT`, balance restored, watchlist untouched, no other account affected); identity 3 is `09-margin-identities.sql`; §12.2's `balance_after` currency is `10-orders.sql:107`. A second copy of a passing assertion is not coverage.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and `pnpm format:check` all exit zero.

### 33 Stock detail page

Build the stock chart and the candle pipeline deferred from F15 and F16. A candle summarises
opening, high, low and closing prices for a time interval. Four UI ranges use three stored
intervals in `candles`; `candle_sync` records when each interval was fetched so its time to live
(TTL) can control caching. Retention runs as a separate job.

**At implementation time Yahoo was deferred to the end of the project (F14).** Ship only the
simulator behind the `CandleProvider` interface. Do not write a Yahoo candle parser here; keep
`library-docs.md`'s unverified response-shape TODO. The later permanent-simulator scope decision
means Yahoo is no longer a promised addition; this records why the interface was introduced.

**UI:**

- Header: symbol, name, LTP, day change, market status. The LTP is the store's anchor described by `anchorProvenance()`, never `provenanceOf` (F30), with `serverProvenance(row, now)` as the SSR fallback — `provenance={live ? … : null}` renders every price as an em dash in the fetched HTML, and hydration hides it (F20).
- Candlestick chart with 1D / 1W / 1M / 1Y switching through a `?range=` search param, so each range is a server render and the URL is shareable and back-button correct.
- OHLC, volume, and a 52-week high and low **derived from the stored `ONE_DAY` series** — `quotes` has no 52-week columns, Yahoo is not live, and `range=1y` spans exactly that window, so this costs no schema change and no second fetch.
- Buy and sell buttons calling `openTicket({ symbol, side })`; the ticket is mounted once in the terminal layout and every call site gets a button, never its own dialog. The user's current holding or position in this symbol, if any.
- A symbol not in `instruments` is `notFound()`, not an echoed heading.

**Logic:**

- `getCandles(symbol, range)` server-side in `src/lib/market/candles/service.ts`: map range to interval, serve from `candles` when `candle_sync` is fresh, otherwise generate, upsert, and stamp `candle_sync`.
- **It runs through `createAdminClient()`.** `candles` and `candle_sync` grant nothing to `authenticated` and carry no write policy — F10 made the service role the only writer deliberately. This is `admin.ts`'s first caller since F01, so its `server-only` guard is finally load-bearing.
- 1M and 1Y are two windows over the one `ONE_DAY` series, windowed in memory rather than fetched separately.
- Seed simulated candles from `(symbol, interval, ts)` so regenerating a candle produces identical bytes. Upserts must be idempotent, and TTL refreshes must append without rewriting history. Anchor the daily series' last close to `quotes.prev_close`, which also seeds F16's quote simulator. Use `instruments.prev_close` only for a cold start. The chart and header must agree on that basis.
- **No token bucket and no circuit breaker.** F15 already established that a limiter in front of a local simulator caps nothing; both arrive with Yahoo. `architecture/patterns.md` promised them on this path and is corrected rather than satisfied with dead code.
- On provider failure with rows present, serve the cached rows with their true age surfaced; never an empty chart, never a fabricated candle inside a real series.
- Pass plain serialisable data and resolved theme colours to the chart. **Draw once per server render** using `setData()`; do not animate a growing last candle. With a `FIVE_MIN` TTL, the series is at best five minutes fresh and must not imply tick-level precision. This also avoids rerendering the canvas about 60 times a second during quote interpolation, the F19 problem. The header LTP continues to update.
- Canvas cannot read CSS variables: `--color-up` and `--color-down` are resolved once in a `'use client'` wrapper and re-applied with `series.applyOptions()` when `next-themes` changes, or a chart built under dark tokens keeps them after a switch to light.
- Schedule `prune_candles()` separately in `pg_cron`. Retention needs no HTTP call and can be tested directly in SQL at tier 2, without deploying and waiting for `market-tick`. Keeping the schedules separate also lets F33 ship while F16 is parked until the project's end. Correct the opposite example in `code-standards/boundary-patterns.md` in the same change.

**Verify:**

- The chart renders for ten different symbols with no console errors — browser, console clean.
- Switching between 1M and 1Y issues **no** new upstream request — both window the same cached daily series; `candle_sync.fetched_at` for `ONE_DAY` is unchanged after toggling both ways.
- A second visit inside the TTL issues no upstream request at all; `candle_sync.fetched_at` is unchanged.
- With the provider forced to fail and cached rows present, the chart still renders and shows the data's real age.
- Navigating away and back leaves no leaked canvas — `chart.remove()` confirmed in cleanup, canvas count stable across five round trips in DevTools.
- A symbol with no available history shows an explanatory empty state, not a broken chart; a symbol not in `instruments` is a 404.
- History is stable: generating the same `(symbol, interval, ts)` twice is deep-equal, and a refetch after a day appends only. `pnpm test`
- Retention keeps exactly the right window per interval and leaves the other two untouched — `18-candles.sql`. `pnpm test:db`
- The page does not scroll sideways at 375px — `documentElement.scrollWidth === clientWidth` measured **on the page**, not on the chart container (F31, F30).
- The SSR price is not an em dash — `curl` the route and read the HTML; hydration hides this (F20).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` and `pnpm format:check` all exit zero.

### 34 Reports and trade history

Build the completed-trade statement with date filters. Ship it in two slices: first the history
table, filters and summary; then CSV export over the verified filter. Reuse F32's URL-based
filters, ordinary pagination links and Server Component layout. Reports also shows a figure
derived from current prices, so it needs the provenance disclosures that Funds does not.

**UI:**

- Completed trades, newest first, 50 to a page. Scroll region carries `relative`, `role="region"`, `tabIndex={0}` and an `sr-only` caption (F27, F30, F31, F05).
- Filters as a no-JS `<form method="get">` — two `<input type="date">` plus a symbol `<select>` populated from `traded_symbols` — beside preset links (This month / Last 30 days / This FY). Every view has a URL; changing any filter returns to page 1, because page 4 of everything is rarely page 4 of one symbol (F32).
- Summary cards: realised P&L and total charges **over the filtered set**, both from Postgres; unrealised P&L on open CNC holdings beside them.
- **Unrealised is holdings-only, and the page says so**, linking `/positions`. F21's split, and MIS is flat after 15:20, so the gap exists only intraday and is disclosed rather than hidden. `unpriced_count` is disclosed with it, or the total silently omits an unpriced holding (F21, F31).
- Per-trade `charge_breakdown` expandable from the row as a native `<details>`/`<summary>` — no JavaScript, and keyboard and screen-reader behaviour come from the browser rather than being hand-written and audited at F38 (F07).
- An auto square-off is marked as one, so a 15:20 exit is distinguishable from a user exit (§10).
- CSV export as a plain `<a href>` — not `next/link`, which would attempt a client navigation to a non-page route.

**Logic:**

- `trade_history` view, `security_invoker`: `trades` ⋈ `orders` ⋈ `instruments`, one row per trade, with `value` (`quantity * price`) computed in SQL.
- **`traded_on` is a `date` column on the view**, `(traded_at at time zone 'Asia/Kolkata')::date`, so the range filter is a `date` comparison and no caller does timezone arithmetic. F33 lost a session to exactly that trap in the other direction, and a date filter is where it recurs.
- `reports_summary(p_from, p_to, p_symbol)` — `stable`, invoker rights so RLS scopes it — returns the filtered `trade_count`, `realised_pnl`, `charges_total`, `buy_value` and `sell_value`. Calculate totals across the entire filtered set. The visible page is only part of that set, so summing its rows in TypeScript would give the wrong result and violate `CLAUDE.md`'s money rule.
- **The filter is written once for the rows.** PostgREST's `count: 'exact'` returns the row count under the same clause the rows came from, which then cross-checks the function's own `trade_count` — two independently derived counts that must agree (F32's pattern, extended).
- `traded_symbols` view (`select distinct user_id, symbol from trades`) feeds the filter's `<select>`, so the vocabulary is what the user actually traded and a typo cannot produce an empty page.
- `parseReportsQuery` falls back **per field**, as `parseLedgerQuery` does: a hand-edited `?page=0` or a `from` later than `to` renders page 1 unfiltered rather than an error boundary or an empty page that reads as an empty account.
- Both views and the function `revoke ... from anon, authenticated` and grant back to `authenticated` only — naming all three roles, since `revoke ... from public` leaves Supabase's direct grants standing (F13). No `anon` grant: the publishable key ships in the browser bundle (F10).
- Serve CSV through a GET route handler at `/reports/export`. Export is a read, so the rule requiring Server Actions for mutations does not apply. Add this third handler to `code-standards.md` in the same change; its former two-handler list would otherwise contradict the implementation. A GET URL gives users a native browser download that can be bookmarked and works without JavaScript.
- The handler applies the same filter with **no** `.range()` — the export covers the filtered set, not the page — and returns 401 when `getUser()` is null. RLS would return an empty set, and an empty CSV reads as "no trades" rather than "not signed in".
- `toCsv` is pure and tier-1 tested: RFC 4180 quoting, CRLF, a UTF-8 BOM, and money written as raw `numeric` strings so the file is machine-readable.
- `OrderChannel` is mounted, as on Holdings and Funds: a fill writes a trade, and trades are server state that never enters Zustand (F27).

**Verify:**

- Realised P&L equals `Σ trades.realised_pnl` over the filtered range — `19-reports.sql` asserts the function against a direct sum under the same filter. `pnpm test:db`
- Filters narrow the set correctly at both IST day boundaries — a trade at 00:05 and one at 23:45 IST each land on their own `traded_on` and are excluded from the neighbouring days. `pnpm test:db`
- Neither view nor the function is reachable by `anon`, and a second user's trades are invisible through both — grant assertions plus an RLS falsification. `pnpm test:db`
- Bad querystring degrades rather than erroring: `?from=abc&page=0&symbol=NOPE` renders page 1 unfiltered, no error boundary — browser.
- Per-field fallback, range boundaries and href round-tripping. `pnpm test`
- CSV quoting survives a field containing a comma, a quote and a newline; an empty set yields the header alone. `pnpm test`
- The exported CSV row count equals the filtered total in the pager — filter, read "N trades", download, `wc -l` minus the header, then a direct SQL count over the same filter. **Not** the row count on screen, which is one page of it.
- The page does not scroll sideways at 375px — `documentElement.scrollWidth === clientWidth` measured **on `/reports` itself**, not on the table's scroll region (F31, F30).
- The unrealised figure carries honest provenance and discloses what is unpriced and what is excluded — read the **fetched** HTML, not the hydrated DOM (F20).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and `pnpm format:check` all exit zero.

### 35 Profile and settings

Show the signed-in identity, the theme preference that follows the account between browsers,
and controls for reset and sign-out. Most of the page is read-only. Theme persistence is its
new write path and the first supported application update to `profiles`.

**UI:**

- Google avatar, name and email, with the simulated client ID beside them. The avatar is `next/image` against `lh3.googleusercontent.com`, falling back to the existing `initials()` monogram when the URL is absent.
- A light/dark control that persists to `profiles.theme`, with the failure said out loud: if the write fails the theme still changed locally, and a silent failure would misreport it as saved.
- Account reset, mounting `ResetAccountDialog` unchanged — built self-contained at F32 _for_ this feature, so identical behaviour is structural rather than a matter of matching copy.
- Sign out as a real `<form>` posting to `signOut`, the F07B no-JS standard the `AvatarMenu` already follows.

**Logic:**

- **Name, email and avatar come from the live session; only `client_id` comes from Postgres.** The bootstrap trigger fires on insert only (F13), so `profiles.full_name` and `avatar_url` freeze at signup and would show a stale name after the user changes it at Google. Reading `user.user_metadata` needs no migration and no sync write path.
- **The `update` grant narrows to `update (theme)`.** `grant select, update on public.profiles` currently lets any authenticated user rewrite their own `client_id`, `full_name` and `avatar_url` by direct PostgREST call. This is the feature that first writes the table, so it is where the grant stops exceeding what a role needs (F07B).
- Apply the stored theme with `setTheme` in an effect. Context7 confirmed that `next-themes` accepts no server-supplied value: its script reads `localStorage`, and `setTheme` is the write path. Let the library own both the class and storage key. On a browser new to the account, the terminal may show one frame in the previous theme. Accept that cost rather than add a blocking script that writes the library's key and races hydration.
- Persist theme changes from both terminal controls: `TopNav` and Settings share the same write path through a Server Action prop. Otherwise the stored account value would undo a top-bar change on the next full load. Keep `SiteHeader`'s marketing toggle in `localStorage` only. Reading a session there would make every public page dynamic and break F12's session-free `(marketing)` boundary.
- **A theme write does not revalidate.** `revalidateTerminal()` exists for writes that move server-rendered numbers; the client has already applied the theme itself, so revalidating six routes would buy nothing.
- The action takes the standard shape — `input: unknown`, Zod-parsed, `ActionResult<null>` — unlike `resetAccount`, which has no input, and the auth actions, which end in a redirect.

**Verify:**

- `authenticated` can update `theme` and nothing else — `has_column_privilege(…, 'client_id', 'update')` is false and `'theme'` is true. `pnpm test:db`
- An invalid theme is unstorable, and one user cannot write another's — the `profiles_theme_allowed` CHECK rejects `'blue'`, and an update under `set local role authenticated` cannot cross users. `pnpm test:db`
- The schema accepts exactly two values. `pnpm test`
- **The choice survives a different browser** — toggle on `/settings`, confirm the row by direct SQL, then load the terminal in a clean profile and read `documentElement.className` before touching anything. This is the criterion the whole feature exists to meet.
- The top-bar toggle is not reverted: toggle in `TopNav`, navigate to another terminal page, hard-reload, and the theme holds — browser.
- Marketing is unaffected: `/` still toggles with no session and no network write — browser.
- The client ID matches the one issued at bootstrap — compare the rendered value against `select client_id from profiles`.
- Reset from here behaves identically to reset from Funds — same component, so confirm the counts render and a reset returns cash to the opening balance.
- The page does not scroll sideways at 375px — `documentElement.scrollWidth === clientWidth` measured on `/settings` itself (F31, F30).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and `pnpm format:check` all exit zero.

### Phase checkpoint

Before closing Phase 5, confirm every page in `project-overview.md` exists and reads the
application data it needs. Walk from signup through opening and closing a position, and
reconcile every money figure.

---
