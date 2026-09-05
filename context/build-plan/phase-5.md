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



**UI:**

- MIS positions with net quantity (negative for shorts), average price, LTP, unrealised and realised P&L.
- Exit button per position; a banner showing time remaining until auto square-off.
- Empty state.

**Verify:**

- An intraday buy appears here and not in Holdings; a CNC buy does the opposite.
- Exiting a position writes the closing trade and the realised P&L matches a hand calculation.
- A short position shows negative quantity and P&L that moves opposite to price.

### 32 Funds page



**UI:**

- Cards: available cash, used margin, opening balance, total P&L.
- Ledger table with type, amount, running balance, related order, and timestamp; paginated and filterable by type.
- "Reset account" with a confirmation dialog spelling out exactly what is destroyed.

**Logic:**

- `resetAccount` Server Action calling the `reset_account` database function.

**Verify:**

- Every trade produces a matching ledger entry; the count matches the trade count.
- `balance_after` on the newest entry equals `funds.available_cash` exactly.
- `used_margin` equals `Σ orders.blocked_margin` over `OPEN` orders plus `Σ positions.blocked_margin`, checked after a randomised sequence of placements, fills, partial covers and cancels.
- Reset restores the post-signup state exactly: orders, trades, holdings, positions and all ledger rows deleted, cash back to `OPENING_BALANCE`, `used_margin` zero, and a single fresh `SIGNUP_CREDIT` row — per `trading-contract.md` §11.
- The confirmation dialog is required — no path resets without it.

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


