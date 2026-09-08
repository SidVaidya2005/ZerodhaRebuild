> **One phase of `context/build-plan.md`.** That index carries the Core Principle and the phase list.
> **Read only the phase you are building.** A finished phase is history — its still-binding decisions
> live in `constraints.md`, its narrative in `build-journal.md`, and re-reading it here costs tokens for nothing.

## Phase 5 — Portfolio Pages

### 30 Holdings page

Delivery holdings, priced and live. No migration and no new SQL: F21's
`portfolio_holdings` and `portfolio_summary` already compute every figure, and
`(terminal)/layout.tsx` already unions held symbols into the quote channel.

**UI:**

- Columns: instrument, quantity, average cost, invested, LTP, current value, overall P&L, day change — P&L coloured by sign, with an explicit +/− so colour never carries it alone.
- Day change is rupees (`day_pnl`, the column the footer sums) with the stock's own per-share % beneath it, on the same `prev_close` basis the watchlist uses (§9).
- `<tfoot>` totals aligned under the columns they total: invested, current value, overall P&L, day P&L. **Invested is a row column for this reason** — a footer total with no column above it cannot be read as the sum of anything.
- Every column sortable, client-side and persisted nowhere. Default symbol ascending; money columns default to descending. `aria-sort` on the header, arrow for sighted users.
- Per-row Exit opens the layout's single ticket pre-filled `SELL` / `CNC` / full quantity.
- Empty state for a user holding nothing — distinct from the dashboard's, which speaks to an account that has never traded at all.
- Aggregate provenance line under the table, and the unpriced-holding disclosure, both as F21's tiles do.

**Logic:**

- Server-side read of `portfolio_holdings` and `portfolio_summary`; nullables narrowed, never coerced, because `Number(null)` is `0` and a zero is a valuation.
- **The whole row jumps on the anchor, LTP included.** Nothing on this page reads `ltp`. `recomputeHolding` restates each row and `recomputeSummary` the footer, both from the one `useHoldingPrices` call, so a tick moves row and total in the same render.
- `anchorProvenance()` supplies the LTP's claim — `provenanceOf` describes the store's tween state, so it announces an anchor as interpolated. `serverProvenance` remains the fallback for a symbol the store has not seen (F20).
- Rows sort on the restated anchor values, so ordering always matches what is on screen; an unpriced holding sorts last in both directions rather than reading as the worst performer.
- `OrderChannel` is mounted so a fill re-renders the page — holdings are server state and a full sell deletes the row (§8).

**Verify:**

- Footer totals equal the sum of the rows — tier 1, `recomputeSummary` against the sum of `recomputeHolding` over one hand-computed fixture, both sides also asserted against the hand figures. `pnpm test`
- A CNC sell of the entire holding deletes the row rather than leaving quantity zero — tier 2, `10-orders.sql` §M, asserting both that the sell fills *and* that the table is empty, since either alone passes on a build where the sell failed. `pnpm test:db`
- An unpriced holding renders em dashes and is counted, never valued at zero — tier 1.
- The LTP announces itself as reported rather than interpolated while a tween is in flight — tier 1 on `anchorProvenance`.
- Provenance is present in the **server-rendered** HTML, not only after hydration (F20). Browser.
- A live tick moves a row's P&L and the footer total together. Browser, market hours.
- Exit opens a CNC sell pre-filled with the full quantity, and focus returns to the Exit button on close (F25). Browser.
- Sort headers flip `aria-sort`; the scroll region is focusable and labelled at 375px. Browser.

### 31 Positions page

The intraday counterpart to F30. Unlike it, this one needs a migration: F21 built
`portfolio_holdings` and `portfolio_summary` but no positions equivalent, so the arithmetic has
nowhere to live yet. Two `security_invoker` views supply it, and the page selects and narrows.

**UI:**

- Columns: instrument, net quantity (negative for shorts), average price, LTP, unrealised P&L, realised P&L, collateral — P&L coloured by sign with an explicit +/−, so colour never carries it alone.
- **Collateral is `positions.blocked_margin`, em dash for longs.** A short blocks real cash and no screen explains why until F32 ships.
- `<tfoot>` totals under the columns they total: unrealised, realised, collateral.
- Every column sortable, client-side, persisted nowhere. Default symbol ascending; money columns default to descending. `aria-sort` on the header.
- Per-row Exit opens the layout's single ticket pre-filled MIS MARKET for the whole position — `SELL net_quantity` for a long, `BUY |net_quantity|` for a short.
- A banner counting down to the 15:20 square-off, and an empty state distinct from the dashboard's.
- Aggregate provenance line and the unpriced disclosure, as F21's tiles and F30's table do.

**Logic:**

- **`portfolio_positions`** — `positions ⋈ instruments`, `left join quotes` so an unpriced position still appears. **Unrealised P&L is one signed expression for both directions**: `net_quantity × (ltp − average_price)`. A short of 100 at ₹99.70 against an LTP of ₹90 gives `−100 × −9.70 = +970`, agreeing with §9's `(average_price − exit_price) × quantity`; a `case` on direction would be two formulas free to drift.
- **`entry_reference_price` is not selected.** Identity 12 makes it collateral-only and `average_price` the P&L figure, so leaving it out of the view makes crossing them impossible on this page rather than forbidden.
- **`portfolio_positions_summary`** — driven from `funds`, so an account with no positions still returns a row and the page can tell an empty portfolio from a failed read. Carries `position_count` and `unpriced_count` through `count(col) filter`, since `count(*)` would report the left-joined phantom.
- **Exit goes through `place_order`, never through a collateral function.** `execute_order` takes `orders → funds → positions`; `recompute_position_collateral` inverts the last pair and is safe only because `execute_order` already holds both. A direct call from here is the ABBA cycle `constraints.md` names F31 as the likely source of.
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

The cash side of the account. One new view and one Server Action; no new money SQL, because
`reset_account()` already exists, is `security definer`, derives its user from `auth.uid()` and is
already granted to `authenticated`.

**UI:**

- Cards: available cash, used margin, opening balance, **realised P&L**.
- **Realised only — `Σ trades.realised_pnl`, closed legs net of their closing charges (§9).** This keeps Funds a cash page that reads no quotes at all, so it needs no provenance disclosure, no anchor plumbing and no unpriced-count. Unrealised already has two homes in Dashboard and Holdings, and §9 is explicit that the two answer different questions.
- Ledger table: type, amount, running balance, related order, timestamp. Server-paginated and filterable by type through `searchParams`, so the view is shareable and back-button correct.
- "Reset account" behind a confirmation dialog naming exactly what is destroyed — with counts read from the database, not estimated — and what survives.

**Logic:**

- **`funds_overview`** — `security_invoker`, driven from `funds` so a never-traded account still returns a row. Carries the three `funds` columns, the realised-P&L sum, and the five counts the dialog names. The alternative is seven round trips and a money sum computed outside Postgres. Its `where user_id = f.user_id` clauses are subquery **correlation**, not the hand-written security predicate F18 removed from `watchlist_rows`.
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


