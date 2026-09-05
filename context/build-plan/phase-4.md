> **One phase of `context/build-plan.md`.** That index carries the Core Principle and the phase list.
> **Read only the phase you are building.** A finished phase is history — its still-binding decisions
> live in `constraints.md`, its narrative in `build-journal.md`, and re-reading it here costs tokens for nothing.

## Phase 4 — Trading Engine

### 22 Charge calculator

The Postgres side of the charge model, and the proof that it and the TypeScript estimator are the
same calculator. **`src/lib/trading/charges.ts` already exists — feature 06 built it** so the pricing
page could compute its worked example from real code rather than typed-in totals. This feature does
not create the estimator and does not rewrite it: the TypeScript one stays **display-only**, per
`trading-contract.md` §1.

**Build the carried-over items first** (below). They pin the TypeScript side to hand-computed
figures, and until that happens the Postgres side has nothing trustworthy to be equal *to* — building
against a test that restates the implementation would only copy a possibly-wrong expression into a
second language.

**Logic:**

- **Re-verify the §3 rate table against <https://zerodha.com/charges/> before writing anything.** §3
  requires a re-check at the start of each phase that touches money, and Phase 4 is that phase; the
  exchange transaction rate has already moved once during this project. Any drift is reconciled in
  `constants.ts`, §3 and the pricing page together, and §13's sweep runs if §3 changes.
- `charge_rates()` — every rate as one composite row, `IMMUTABLE`, with the dated source in
  `comment on function`. **One definition, not literals scattered through the calculator.** Postgres
  inlines immutable SQL functions, so there is no per-call cost when F24 calls this inside
  `execute_order` under a row lock, and the parity test can read the rates directly rather than only
  inferring them from results.
- `calculate_charges(side order_side, product product_type, quantity integer, price numeric)`
  returning `(total numeric, breakdown jsonb)`. The composite is what F24 wants: `select … into` and
  insert both columns, with `total` already `numeric` so nothing casts on the money path.
  - Enums, not `text`. The type system already knows what a side and a product are.
  - Breakdown keys are `brokerage`, `stt`, `exchange_txn`, `sebi_turnover`, `stamp_duty`,
    `dp_charge`, `gst` — snake_case, **already pinned by the `trades_breakdown_has_all_components`
    CHECK constraint**, so this is not a fresh choice.
  - §2 exactly: GST on the **unrounded** sub-components rounded once, and the total as the sum of the
    **already-rounded** components — never a rounding of the unrounded sum.
- Both functions revoked from `public`, `anon` and `authenticated`. `code-standards.md` lists
  `calculate_charges` as internal-only; it runs inside `execute_order`, never from a browser.

**A fourth test tier, because none of the three can host this.** Proving the two calculators equal
needs TypeScript *and* a database connection in one process: tier 1 has no database, tier 2 is
SQL-only, and tier 3 is gated behind `ALLOW_RACE_TESTS` because it commits. `calculate_charges`
writes nothing, so it needs no commit gate — `pnpm test:parity` runs read-only over one `pg`
connection and joins `test:all`. Putting it in tier 3 would leave this feature's headline test
skipped inside a green `test:all`.

**Verify:**

- **The four worked examples match to the paisa** — a delivery buy, a delivery sell, an intraday buy
  and an intraday sell, in `07-charges.sql`, each expected figure computed by hand in a comment above
  its assertion. **If Zerodha's published calculator cannot be reached, these are hand-computed from
  the §3 table and labelled as such** — that proves internal consistency, not external agreement, and
  which one shipped is recorded rather than blurred.
- **TypeScript and Postgres agree exactly over ≥100 random inputs** — `pnpm test:parity`, asserting
  all seven keys *and* the total, seed printed so a failure reproduces. Exact equality, not "within a
  paisa": measured before committing to it, across 600k random component comparisons and 6,000
  constructed exact half-paisa midpoints, the epsilon-nudged `roundToPaise` never diverged from exact
  decimal half-up. Covers all four side/product combinations and straddles the ₹20 brokerage cap.
- **The parity test can fail** — perturb one rate in `charge_rates()` only, watch `test:parity` go
  red, revert. A parity test never seen failing proves nothing, which is the lesson Phase 1 recorded
  and Phase 3 had to relearn.
- **GST is computed on unrounded sub-components** — a case where rounding first and multiplying after
  differs by a paisa, asserted on both sides.
- **`dp_base` is ₹13.00 with its GST inside the single `gst` key** — a CNC sell where `dp_charge` is
  `13.00` and `gst` carries the ₹2.34, asserted in pgTAP. Treating ₹15.34 as the base over-charges
  every delivery sell, which an earlier draft of §3 did.
- Delivery brokerage is exactly zero; intraday brokerage is capped at ₹20 — asserted at the cap
  boundary and above it, on both sides.
- **Neither function is callable by a client role** — `throws_ok(…, '42501')` for `anon` and
  `authenticated`, which is a different failure from a policy filtering rows and must be asserted as
  such.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and
  `pnpm format:check` all exit zero.

**Carried over from the Phase 1 checkpoint**, both in `src/lib/trading/charges.test.ts` and
`constants.ts`, and both **falsified by changing a constant and watching them fail** rather than
merely passing:

- The §2 reconciliation case recomputes `roundToPaise(Object.values(breakdown).reduce(…))` —
  character-for-character the expression `charges.ts` uses to produce `total`. It does still catch a
  switch to rounding the *unrounded* sum, so it is not inert, but it proves the property by
  restating the implementation rather than by independent expectation. Pin it to figures computed by
  hand, so the Postgres side this feature adds has something to be equal *to*.
- `DP_CHARGE_INCLUSIVE` is a hand-entered `15.34` with nothing tying it to
  `DP_CHARGE_BASE * (1 + GST_RATE)`. The file's own comment warns these rates move by circular;
  change the base and `/pricing` keeps showing ₹15.34 while the worked example updates, with the
  suite green. Assert the derivation.

### 23 Margin reservation and release

Reservation and release, built and proven before any order can consume them. Five internal-only
functions own every movement between `funds.available_cash` and `funds.used_margin`, and the
collateral held against an open short. **Nothing here fills an order or writes a position's
quantity** — F24 does that and calls these.

**`trading-contract.md` §6 and §7 are amended first, in their own commit.** Four statements in them
are false as written, and each one changes code:

- **§6 step 1's "using the post-fill `average_price`"** is a typo for `entry_reference_price`. It
  contradicts the formula printed directly above it, §12.11, §12.12, and this feature's own
  falsification test.
- **§6 step 2's delta ignores collateral already held on the position**, so a fill that *adds* to an
  existing short double-blocks. It becomes
  `(required_collateral + actual_charges) − (orders.blocked_margin + positions.blocked_margin)`.
- **§6's table reserved 100% of notional for a short.** Collateral at fill is 120% of notional plus
  closing charges, so delta was positive by roughly a fifth of the trade on *every* short — which
  made §7's short-entry `MARGIN_RELEASE` row a block rather than a release, falsified §6's own claim
  that step 3's top-up is the gap-up case, and let a user place a maximum-size short that its own
  fill then rejected. A short-opening MIS sell now reserves the §6 collateral formula evaluated at
  the reservation price. Buys are unchanged at `notional + charges`.
- **§7's short-entry row shows two ledger rows; §6 steps 4 and 6 write three.** §6 wins and §7 is
  corrected: `MARGIN_RELEASE +|delta|`, `MARGIN_RELEASE +actual_charges`, `CHARGES −actual_charges`.
  The paired charge rows are what make "estimated charges are never paid twice" auditable in the
  ledger rather than netted away inside the function.

§13's sweep runs after those edits and every hit is reconciled.

**Logic:**

- `short_margin_buffer()` — `IMMUTABLE`, returning `0.20`, mirroring F22's `charge_rates()`.
  `SHORT_MARGIN_BUFFER` lands in `src/lib/constants.ts` at the same time because F25's ticket shows
  the margin a short requires, and **tier 4 parity compares the two** so they cannot drift.
- `short_collateral_requirement(p_quantity, p_entry_reference_price)` — `IMMUTABLE`, the **single
  site** where §6's formula is written:
  `|quantity| × entry_reference_price × (1 + buffer) + calculate_charges('BUY','MIS', |quantity|, entry_reference_price × (1 + buffer))`.
  Both the block path and the release path call it, which is what makes §6's "one collateral formula,
  everywhere" structural rather than a matter of care.
- `reserve_margin(p_order_id)` per §6: computes the requirement, moves it from `available_cash` into
  `used_margin`, stamps `orders.blocked_margin`, writes `MARGIN_BLOCK`. Returns false and **writes
  nothing** if the user cannot cover it; `place_order` writes the `REJECTED` row.
  - A buy reserves `quantity × price + estimated charges`. A short-opening MIS sell reserves
    `short_collateral_requirement(excess, price) + estimated entry charges`.
  - **Crossing zero:** an MIS sell of 10 against an existing MIS long of 4 closes 4 and shorts 6. The
    shorting excess is `quantity − max(net_quantity, 0)` and only that part is reserved; the closing
    part carries no obligation. A CNC sell, and an MIS sell fully covered by a long, reserve nothing.
  - "Price" is `limit_price` for a limit order and the current `ltp` for a market order.
- `release_margin(p_order_id)` reversing it exactly once and writing `MARGIN_RELEASE`; idempotent,
  returning `0` immediately when `blocked_margin` is already zero.
- `transfer_margin_to_position(p_order_id, p_fill_price, p_actual_charges)` returning
  `(ok boolean, required_collateral numeric, entry_reference_price numeric)`, per §6's six steps.
  - **Called before F24 writes the trade or the position**, while the order is still `OPEN`. On a
    shortfall it releases the whole reservation itself and returns `ok = false`, so there is no
    trade and no position row to unwind — F24 stamps `REJECTED`/`INSUFFICIENT_FUNDS` and returns.
  - It computes the new **gross** quantity-weighted `entry_reference_price` and hands it back for F24
    to write. Making the collateral module the only writer of that concept is what enforces §12.11
    structurally.
  - The collateral move itself writes **no ledger row**, because no cash changes.
- `recompute_position_collateral(p_user_id, p_symbol, p_new_net_quantity)` — the release side.
  Recomputes the requirement over the quantity the position is **about to become** and moves the
  difference to `available_cash` with a `MARGIN_RELEASE` row (§7's short-cover row). Called **before**
  F24 writes the new quantity: a full cover deletes the row and a flip to long cannot carry collateral,
  so neither case can be expressed afterwards. Refuses to *increase* collateral — an add carries a
  reservation only `transfer_margin_to_position` knows how to retire.
- All five are `security definer` with `set search_path = ''`, fully schema-qualified, lock `orders`
  then `funds` with `for update` in that order, re-check `status = 'OPEN'` after taking the lock, and
  are **revoked from `public`, `anon` and `authenticated`** per the grant policy in
  `code-standards.md`.

**Verify:** — tier 2, which rolls back, so even the randomised suite needs no commit gate. Split in
two: `08-margin.sql` holds the hand-computed cases and `09-margin-identities.sql` the randomised one.
They catch different things — an arithmetic slip shows up in 08, while a path that forgets one side of
§12.3 only shows up in 09.

- **`fund_ledger.created_at` must be `clock_timestamp()`, not `now()`**, or §12.2 cannot be asserted at
  all: `now()` is the transaction start time, so the three rows a short entry writes tie, and "the
  newest row" is decided by the planner.

- Test: reserving on a CNC buy lowers `available_cash` and raises `used_margin` by the identical
  amount; the ledger row's `balance_after` matches `available_cash`.
- Test: releasing restores both exactly; releasing a second time returns `0`, writes no row and
  changes no column.
- Test: a reservation larger than `available_cash` returns false and writes nothing — `funds`,
  `orders.blocked_margin` and `fund_ledger` all unchanged.
- Test: an MIS sell of 10 against an MIS long of 4 reserves against 6, not 10 and not 0; an MIS sell
  fully covered by a long reserves nothing.
- Test, **three assertions on one short round trip**, because each catches a different error:
  1. Pre-placement → completed: `available_cash` falls by exactly `required_collateral + actual_charges`.
     The collateral sits in `used_margin`, not in free cash.
  2. Post-reservation → post-transfer: `available_cash` moves by exactly `−delta`, the reservation
     adjustment and nothing else.
  3. `available_cash + used_margin` falls by exactly `actual_charges` — the collateral moved rather
     than vanished, and charges are the only non-recoverable part. This is the assertion that catches
     a double-spend.
- Test: **a clean fill needs no top-up.** A short limit sell at ₹100 filling at ₹100 produces
  `delta = 0`. This is the assertion that proves the amended reservation basis; under the old 100%
  reservation it fails by a fifth of the notional.
- Test: `orders.blocked_margin` is zero after transfer and the ledger contains **no row** for the
  collateral amount; the three rows §6 writes are present and sum to `reservation − collateral − charges`.
- Test: reserved estimated charges are not also debited — total cash out for a short entry equals the
  actual charges exactly, never charges twice.
- **Gap-up test:** a short limit sell at ₹100 that fills at an observed ₹110 requires more collateral
  than it reserved. With sufficient cash it tops up via `MARGIN_BLOCK` and returns `ok = true`; with
  insufficient cash it returns `ok = false`, releases the whole reservation, and leaves
  `blocked_margin = 0` so F24's `REJECTED` write is legal under `orders_no_margin_unless_open`.
  Assert both branches — with the reservation basis corrected, a gap-up fill is now the **only** case
  where a better fill price demands more margin.
- Test: `positions.blocked_margin` equals
  `|net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges`
  after entry, after adding to the position, and after a partial cover — each expected figure
  computed by hand in a fixture comment, never restated as the expression the function uses.
- Test: collateral computed from `entry_reference_price` covers a full 20% adverse move **including
  closing charges**. Recompute it from `average_price` instead and confirm the assertion fails — that
  substitution under-collateralises by a small, easily-missed amount.
- Test: covering half a short releases exactly half the collateral, not zero and not all of it; a full cover releases all of it and a flip to long releases all of it.
- Test: the margin identity in §12.3 holds after a randomised sequence of 500
  reserve/release/fill/cancel operations on a **pinned seed**, alongside identities 1, 2, 4, 8 and 12.
  The suite asserts the churn actually happened first — a loop that quietly did nothing would
  otherwise satisfy every identity.
- **Falsification, twice:** perturb `short_margin_buffer()` and watch `08-margin.sql` and
  `test:parity` go red; remove the `positions.blocked_margin` term from §6 step 2's delta and watch
  `08-margin.sql` fail on cash and `09-margin-identities.sql` fail identity 3 independently. Revert
  both. A collateral test never seen failing proves nothing.
- Test: none of the five is callable by a client role — `throws_ok(…, '42501')` for `anon` and
  `authenticated`, which is a different failure from a policy filtering rows.
- `pnpm test:parity` compares `short_margin_buffer()` against `SHORT_MARGIN_BUFFER`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and
  `pnpm format:check` all exit zero.

### 24 Order execution function

The heart of the project. Built and tested entirely in SQL before any UI touches it. F23 already
owns every movement of margin and collateral; this feature **sequences** those functions and adds
everything else a fill does — pricing, charges, trades, holdings, positions, the ledger.

**Two primitives first**, because two rules in `trading-contract.md` §5 currently have no
implementation anywhere:

- `market_state(at timestamptz)` reading `market_holidays` — a **second implementation** of session
  logic, and deliberately so. `place_order` rejects a MARKET order placed outside the session with
  `MARKET_CLOSED`; a LIMIT order may be placed then and simply waits. A Server Action gate would sit
  outside the security boundary, and `place_order` is granted to `authenticated` — anyone calling the
  RPC directly would trade at any hour. `architecture.md`'s "one place decides market time" invariant
  is amended to name both implementations, and **tier 4 proves them equal** rather than asking the
  reader to trust the amendment.
- `market_constants()` — the IST offset, the three session bounds and `quote_stale_after_ms`, as one
  `IMMUTABLE` composite mirroring `_shared/market-constants.ts`, exactly as `charge_rates()` mirrors
  the rate table. One composite rather than a function per constant, so tier 4 makes one comparison
  and `market_state` has no magic numbers in its body. Without the staleness figure §5's "never filled
  at a stale price" is unimplemented and a Monday fill can execute against Friday's close.

**Logic:**

- `place_order(p_symbol, p_side, p_order_type, p_product, p_quantity, p_limit_price)` returning
  **`(order_id uuid, status order_status, rejection_reason text)`**. It inserts the order, applies the
  pre-flight rejections, calls `reserve_margin`, and calls `execute_order` inline for a MARKET order.
  - **The composite is not decoration.** A business rejection returns normally per
    `code-standards.md`, so `error` is null and a bare uuid leaves the Server Action unable to tell a
    fill from a rejection. Raising instead would roll back the REJECTED row that §4's lifecycle and
    the Orders page both require. `architecture.md`'s example and `toRejectionCode`'s role are
    corrected in the same change.
  - Pre-flight rejections, each writing the order row first so it exists to be read:
    `MARKET_CLOSED`, `INVALID_QUANTITY`, `NO_HOLDING` (a CNC sell beyond `holdings.quantity`),
    `INSUFFICIENT_FUNDS` (`reserve_margin` returned false).
  - Derives the user from `auth.uid()` and never accepts a `user_id` argument.
- `execute_order(order_id)` per the golden pattern: lock the order row, **return unless it is still
  `OPEN`**, lock the funds row, price it per §5, reject `NO_QUOTE` when there is no row or
  `fetched_at` is beyond the staleness window, compute charges, retire the reservation, insert the
  trade, upsert the holding or position, update funds, append the ledger, complete the order.
- On completion the function retires the reservation the right way, **before writing the trade and the
  position**: `release_margin` for buys, long closes, cancellations and rejections;
  `transfer_margin_to_position(order_id, fill_price, actual_charges)` for a fill that opens a short.
  That one returns `(ok, required_collateral, entry_reference_price)` — on `ok = false` the
  reservation is already released and this function only has to set `REJECTED`/`INSUFFICIENT_FUNDS`;
  otherwise its two returned figures are written into the `positions` row.
- A fill that **reduces** a short calls `recompute_position_collateral(user_id, symbol, new_net_quantity)`
  **before** writing the new quantity, which releases that fill's share of the collateral and handles
  full cover and flip-to-long uniformly. F23 owns both; F24 only sequences them.
- `average_price` computed with the direction-correct formula from `trading-contract.md` §8 — charges
  added for a long, subtracted for a short.
- **A fill that crosses zero apportions its charges pro-rata by quantity.** An MIS buy of 10 against an
  open short of 4 covers 4 and opens a long of 6: the closing share reduces realised P&L per §9 and the
  opening share capitalises into the new position's `average_price` per §8. The closing share is
  rounded to the paisa and the **remainder** goes to the opening leg, so the two always sum to
  `trades.charges` and §12.6 cannot fail by a paisa. §8 never covered this case; rejecting it instead
  would make F23's shorting-excess reservation and its flip-to-long path unreachable.
- **The §6 capped-loss path**: a cover that would drive `available_cash` below zero debits only
  `min(loss, blocked_margin + available_cash − closing_charges)`, credits the remainder as
  `SIMULATION_ADJUSTMENT` so identity 1 still holds, and still records the **true, uncapped** loss in
  `trades.realised_pnl`. Built here for user-initiated covers; F29 reuses it for square-off.
- `cancel_order(order_id)` for open orders only, retiring the reservation through `release_margin`.
- `reset_account()` per §11, wiping orders, trades, holdings, positions and **all** ledger rows,
  restoring the opening balance and inserting a single `SIGNUP_CREDIT`, and leaving `profiles`,
  `watchlist_items`, `instruments` and `quotes` untouched. F35 only adds the button that calls it.
- `place_order`, `cancel_order` and `reset_account` granted to `authenticated`; `execute_order`,
  `market_state` and `market_constants` revoked, per the grant policy in `code-standards.md`.

**Not built here:** `modify_order`, which `code-standards.md`'s grant list names but no feature builds.
Filed against F27 rather than invented into scope.

**Verify:** — tier 2 (`10-orders.sql` hand-computed, `11-order-identities.sql` randomised), tier 3 for
the two concurrency cases, tier 4 for the two primitives.

- Test: a CNC buy of 10 at a known price debits exactly (10 × price + charges) and creates the holding
  with that average price, hand-computed in a fixture comment.
- Test: a second buy at a different price recomputes the weighted average correctly.
- Test: **short entry charges lower `average_price`, they do not raise it.** Short 100 @ ₹100 with ₹30
  charges gives `₹99.70`; covering flat at ₹100 reports a loss of ₹30 plus closing charges, never a
  ₹30 profit. Run this against a build using the long formula and confirm it reports `+₹30`.
- Test: a short with entry charges plus a partial cover reports realised P&L matching a hand
  calculation to the paisa.
- Test: **a fill crossing zero apportions charges and they still reconcile** — the closing and opening
  shares sum to `trades.charges`, and `trades_breakdown_sums_to_charges` accepts the row.
- Test: a buy exceeding available cash is `REJECTED` with `INSUFFICIENT_FUNDS` and leaves `funds`
  byte-identical.
- Test: a CNC sell without a holding is `REJECTED` with `NO_HOLDING`.
- Test: a MARKET order outside the session is `REJECTED` with `MARKET_CLOSED`, and a LIMIT order placed
  at the same instant stays `OPEN` — driven at 09:14:59, 09:15:00, 15:29:59, 15:30:00, a Saturday and a
  seeded holiday.
- Test: a quote older than the staleness window is `REJECTED` with `NO_QUOTE` rather than filled, and a
  symbol with no quote row at all is too.
- Test: **the SQL and TypeScript session logic agree** — `pnpm test:parity` over the same boundary
  table, falsified by shifting `MARKET_CLOSE_IST` in SQL only and watching it fail.
- Test: **the capped-loss path** — a cover exceeding the account leaves `available_cash` at exactly
  0.00, writes a `SIMULATION_ADJUSTMENT` credit for the uncovered remainder, and still records the
  true uncapped loss in `trades.realised_pnl`. Identity 1 holds across it.
- Test, **two concurrent sessions**: two buys that each individually fit but together exceed the
  balance produce exactly one fill and one rejection — the row lock holds.
- Test, **two concurrent sessions**: both call `execute_order` on the same open order at the same time.
  Exactly one trade, one ledger entry, and one debit. Run this against a build with the status guard
  removed and confirm it fails — a test that cannot fail is not a test.
- Test: an open limit buy reserves margin at placement; `used_margin` rises and `available_cash` falls
  by the same amount.
- Test: cancelling that order restores both figures exactly; cancelling twice is a no-op.
- Test: an MIS short reserves margin, and a user with zero available cash cannot open one.
- Test: `available_cash` never goes negative across a randomised sequence of 500 orders on a **pinned
  seed**, and every §12 identity holds afterwards. The suite asserts the churn happened before it
  asserts the identities.
- Test: `reset_account` returns every table to the post-signup state — row counts zero, cash at
  `OPENING_BALANCE`, `used_margin` zero, exactly one `SIGNUP_CREDIT`, and `watchlist_items` untouched.
- Test: `place_order`, `cancel_order` and `reset_account` are executable by `authenticated`;
  `execute_order`, `market_state` and `market_constants` raise `42501`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:race`, `pnpm test:parity`,
  `pnpm build` and `pnpm format:check` all exit zero.

### 25 Order ticket UI

The first Phase 4 feature with a screen. The engine is complete and proven in SQL, so this feature
adds no money arithmetic that reaches the database — it shows a **labelled estimate** of what the
engine will do, per `trading-contract.md` §1, and hands the values to a caller.

**The seam with F26 is the `onSubmit` prop.** This feature ships the dialog, the schema, the
estimates and the in-flight guard, calling an injected handler that returns `ActionResult`; F26
supplies the real `placeOrder` action and the toasts. That keeps the whole ticket tier-1 testable
with no database, and the double-submit guard is a UI concern that belongs here either way.

**UI:**

- Modal dialog with the system's trading buttons: `--color-up` for buy, `--color-down` for sell,
  `--radius-sm`, tight padding. The final confirm action is the brand CTA (`bg-brand text-on-brand`)
  — `DESIGN.md` reserves the trading colours for explicit price-direction meaning, so they mark the
  **side selector** and nothing else.
- Quantity, product toggle (CNC/MIS), order type toggle (MARKET/LIMIT), limit price shown only for
  limit orders.
- Live margin required, available cash, and the estimated charge breakdown, all updating as inputs
  change **and as the price ticks** — a MARKET order estimates against the live `ltp` from F19's
  store, so the panel moves with the price it will fill at.
- Inline validation errors and a disabled submit while in flight.
- **Mounted once, in the terminal layout**, beside `<QuoteChannel/>`. A `useOrderTicket` store holds
  `{ open, symbol, side }` and any call site imports `openTicket({ symbol, side })` — a button, not a
  dialog. This is not premature: F18's panel renders **twice** (the `md` rail and the mobile sheet),
  so a per-row dialog would mount two copies of the same form for the same symbol, and F31's
  exit-position button then costs three lines.
- F25 wires one call site: the watchlist rows' B/S buttons, in the existing `focus-within` hover
  cluster so they are never keyboard-hidden.

**Logic:**

- `react-hook-form` with `zodResolver(placeOrderSchema)`. `architecture.md`'s stack table already
  pins 7.85.0 / 5.9.1 for this feature and records that the ticket therefore **requires JavaScript** —
  which is exactly why the support form deliberately does not use this stack.
- `placeOrderSchema` in `src/lib/trading/schemas.ts`, shared with F26's action so the client and the
  server validate the same shape.
- Charge estimate from `src/lib/trading/charges.ts`, labelled as an estimate.
- **`src/lib/trading/margin.ts` — the TypeScript half of §6's reservation rules**, and the reason
  this feature has a parity test. Margin required is what `reserve_margin` will actually block: for a
  buy, `opening quantity × price + charges`; for an MIS sell,
  `short_collateral_requirement(shorting excess, price) + charges`. A figure that ignores the
  existing position tells a user covering a 100-share short that they need ₹10,029 when the engine
  reserves ₹29.
- **The position is fetched on open**, one RLS-scoped select against `holdings` and `positions` for
  that symbol. Fresh by construction, one round trip per dialog open rather than per keystroke, and
  nothing extra loads on pages where the ticket is never opened. The margin panel shows a skeleton
  while it resolves.

**Verify:**

- **Tier 1 covers the pure logic; the interactions are proven in the browser.** `constraints.md`
  records F01's decision that tier 1 runs with no jsdom and no Testing Library, neither being an
  approved dependency — so component behaviour is driven in Chrome here exactly as it was for
  F17–F21. The arithmetic that can silently go wrong lives in the schema and the estimator, and both
  are covered automatically.
- Test: zero, negative and fractional quantities are rejected — asserted over `placeOrderSchema`,
  which is the same object the rendered form validates against and the same one F26's action parses.
- Test: a limit order without a price, and a market order carrying one, are both rejected —
  `orders_limit_price_iff_limit` is an equivalence, so both directions must fail.
- Browser: selecting LIMIT reveals the price field, and MARKET hides it again.
- Browser: submitting a LIMIT order with the price empty shows a field error and no order is
  attempted.
- Browser: **double-clicking submit calls the handler exactly once** — F25 has no action to place an
  order with, so the guard is what is under test: `formState.isSubmitting` disables the button for
  the whole await, and the second click lands on a disabled control. Proven with a temporary probe
  supplying a slow counting `onSubmit`, then deleted.
- **`pnpm test:parity`: the margin shown is the margin the engine reserves, exactly.** Ten hand-picked
  cases plus seeded-random ones, across buy, short entry, full cover, partial cover and a fill that
  crosses zero, compared against `short_collateral_requirement` + `calculate_charges`. **Exact
  equality, not "within one paisa"** — that is the bar the charge estimator already meets, and a
  looser one here would hide precisely the drift the test exists to catch. Falsified by perturbing
  `SHORT_MARGIN_BUFFER` in TypeScript only.
- Test: a cover shows charges-only margin — short of 100 open, covering 100 @ ₹100 reserves the
  charges alone, not ₹10,029.00. Asserted at tier 1 against `estimateMargin`, and again against the
  engine at tier 4.
- Browser: the panel ticks with the price for a MARKET order, and holds still on a LIMIT one.
- Read: every money figure in the ticket is labelled an estimate. §1 forbids an unlabelled TypeScript
  money figure anywhere.
- Browser: the ticket opens from the watchlist at both breakpoints, and the rail and the sheet open
  **one** dialog rather than two.
- Browser: focus moves into the dialog on open and returns to the trigger on close.
- Read: `--color-up`/`--color-down` appear on the side selector only; the confirm action is
  `bg-brand text-on-brand`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and
  `pnpm format:check` all exit zero.

### 26 Place order end to end

The action behind F25's seam, and the toast layer that reports what it did. No new SQL: `place_order`
is exactly what F24 proved at tiers 2–4, and this feature is the boundary between it and the screen —
parsing the input, mapping the row it returns onto `ActionResult`, and revalidating what a fill moved.

**The three outcomes are the whole design.** `place_order` returns `(order_id, status,
rejection_reason)` with `error` null in all three cases: `REJECTED` with a stable code, `OPEN` for a
limit order that rests, `COMPLETE` for a market order filled in the same transaction. A *fault* — a
raised Postgres error or a transport failure — is a fourth thing, and is the only one that is not a
normal return.

**UI:**

- **`<Toaster/>` mounted in the `(terminal)` layout.** It exists in `src/components/ui/sonner.tsx` and
  is currently rendered nowhere. The terminal, not the root: the marketing side uses `useActionState`
  with inline state and needs no toast, and this keeps `sonner` out of the public bundle. It moves up
  if that ever changes.
- **Success and failure both toast, and the ticket closes either way.** A rejection is a *recorded
  outcome* — the row is already filed as `REJECTED` and F27 will list it — so leaving the dialog open
  would imply it is still editable, and each retry would file another order. F25's inline `failure`
  state becomes unreachable and is deleted with it.
- **The success toast names the price**: "Bought 10 TCS at ₹2,999.50" for a fill, "Limit order placed
  — 10 TCS at ₹2,950.00" for one that rests.
- Rejection copy is specific and actionable — `MARKET_CLOSED` says when the market opens, `NO_HOLDING`
  says what is held.

**Logic:**

- **`placeOrder` in `src/server/actions/orders.ts`**, the standard shape: parse through
  `placeOrderSchema`, then the client, then the RPC. A `REJECTED` row returns
  `{ok:false, error:{code: <reason>, message: ORDER_ERROR_COPY[code]}}` — the user's intent failed, so
  it lands on the failure branch every caller already has and the toast rule applies with no second
  branch. The rejected order's id is deliberately not returned; F27's page is where one is inspected.
- **`src/lib/trading/order-copy.ts`** — pure and tier-1 testable: `REJECTION_CODES`,
  `ORDER_ERROR_COPY`, `toRejectionCode(error)` for faults, a narrowing for the returned
  `rejection_reason`, and `orderPlacedMessage`. The five codes are the closed set in
  `trading-contract.md` §4; anything else becomes `UNKNOWN` with generic copy rather than being
  rendered. `PlacedOrder` lives in `schemas.ts` beside `PlaceOrderInput`, so the client component
  imports no `'use server'` module for a type.
- **The fill is read back, not returned by the function.** After `COMPLETE`, one extra RLS-scoped
  select on `orders` for `average_price` and `filled_quantity`. Widening `place_order`'s return would
  have meant a migration against a function already proven at three tiers, for one string.
- **Revalidation reuses `revalidateTerminal()`**, lifted out of `watchlist.ts` into
  `src/server/revalidate.ts`. It over-revalidates `/settings`, which no fill touches — deliberately
  cheaper than a second list that can silently under-list, which is the failure `code-standards.md`
  warns about.
- **A transport failure is its own case.** The action never returns, so the ticket cannot know whether
  the order was filed: it says so — "check Orders before placing it again" — and closes. Retrying
  blind is the one thing that could double-place.
- `architecture.md`'s Server Action example is corrected in the same change: it still reads
  `data as string` and maps rejections off `error`, neither of which has been true since F24.

**Verify:**

- Test: every member of `REJECTION_CODES` has copy, and a reason string that is not one of them
  degrades to `UNKNOWN` — asserted over the map, so a sixth code added in SQL cannot ship unmapped.
- Test: `orderPlacedMessage` across buy/sell × `COMPLETE`/`OPEN`, four cases.
- Read: **the action has no `throw` on any path**, and the transport catch wraps the `await` rather
  than sitting inside the success branch.
- Read: every `ok:false` message comes from `ORDER_ERROR_COPY`; the raw Postgres error reaches
  `console.error` and nowhere else.
- Browser: a CNC sell with no holding is rejected, the toast carries the `NO_HOLDING` copy, and the
  dialog closes.
- Browser: a MARKET order is rejected `MARKET_CLOSED` outside a session — free to check on any
  non-trading day, and the common weekend state.
- Browser + SQL: a LIMIT order rests as `OPEN`, toasts, and its blocked margin has left
  `available_cash` — read `orders` and `funds` for that id rather than trusting the screen.
- Browser: **revalidation reaches the layout with no manual reload** — place the limit order from
  `/dashboard` and the server-rendered available cash has already moved, with
  `performance.getEntriesByType('navigation').length` still 1 so it cannot have been a reload. The
  *row* appearing under a tab is F27's check; `/orders` is still a stub here.
- **Blocked until a live session: a market buy fills and appears in Holdings without a reload.** Every
  MARKET order is rejected outside market hours, so this rides along with F16's pending items on the
  next trading day. The fill itself is already proven at tiers 2–4 by F24; what waits is the action,
  the revalidation and the toast on a `COMPLETE`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and
  `pnpm format:check` all exit zero.

### 27 Orders page

The page that makes an order inspectable after it is placed, and the two write paths that act on one
still open. Most of the engine beneath it is already proven: `cancel_order` shipped in F24, locks the
row and re-checks `status = 'OPEN'`, and `orders` is already in the `supabase_realtime` publication.
What this feature owns is `modify_order` — which `code-standards.md`'s grant list names and F24
deliberately left unbuilt — and the surface over both.

**Scope is today's orders plus every `OPEN` order, whatever its age.** An open order has to escape the
date filter or a Friday limit order vanishes from the terminal on Monday while still holding margin.
F34 covers completed *trades*, not orders, so a strict today-only page would leave a cancelled order
with no surface at all; the open-order exemption is what makes the today filter safe.

**UI:**

- Tabs — Open, Executed, Cancelled, Rejected — with counts, over the shadcn `tabs` primitive.
  `COMPLETE` is the Executed tab: this build fills all-or-nothing, so there is no partial state.
- Columns: time, symbol, side, product, type, quantity, price, average price, status. Rejection
  reason inline on a rejected row, mapped through `ORDER_ERROR_COPY` — never the bare code.
- **No LTP column.** The live price would drag in `PriceWithProvenance` and the `serverProvenance`
  server-render fallback the Phase 3 checkpoint filed, for a figure the build plan never asked for.
- Cancel is a one-click button with a toast; Modify is a dialog, because it has fields to collect.
  Both render only on an `OPEN` row.
- Empty state per tab, and it distinguishes "nothing today" from "nothing ever" — the date filter
  makes those different states, and one message for both would read as a broken query.
- **No `loading.tsx` or `error.tsx`.** No terminal segment has them yet; F36 owns that pass, and one
  route having them would be the inconsistency.

**Logic:**

- **`modify_order(p_order_id, p_quantity, p_limit_price)` returning `(ok, reason)`** — `security
  definer`, `set search_path = ''`, deriving the user from `auth.uid()` and taking no user id.
  Locks the order, then: not found or not the caller's → `(false,'NOT_FOUND')`, the same answer
  either way so it declines to confirm an id exists, as `cancel_order` already does; `status <>
  'OPEN'` → `(false,'NOT_OPEN')`; a limit price against a MARKET order → `(false,'NOT_MODIFIABLE')`.
  Granted to `authenticated`, revoked from `public, anon`.
- **The re-reservation reuses `reserve_margin` rather than recomputing the requirement.**
  `release_margin` → write the new terms → `reserve_margin`, wrapped in a plpgsql block with an
  `EXCEPTION` clause. A failed re-reservation raises inside that block, rolling back only that block,
  and the function returns `(false,'INSUFFICIENT_FUNDS')` normally — the order keeps its original
  terms *and* its original reservation. Computing the requirement here instead would put a second
  copy of §6 in the codebase, which `constraints.md` rules out. The release must come first:
  `reserve_margin` returns early when `blocked_margin <> 0`.
- **No third writer of `blocked_margin`.** `architecture.md`'s invariant names `release_margin` and
  `transfer_margin_to_position` as the only functions that zero it and forbids any other path writing
  the column; a delta-adjust inside `modify_order` would be exactly that.
- **Modify never executes inline.** `place_order` does not execute a resting LIMIT order either —
  F28's matcher owns crossing, and a modified limit that already crosses fills on the next tick.
- `istDayStart(at)` exported from `_shared/market-hours.ts`, built on the `toIst`/`fromIst` pair
  already proven exact against `Intl` across the year, and re-exported by `src/lib/market/market-hours.ts`.
  The page query is one call: `.or('status.eq.OPEN,placed_at.gte.<istDayStart>')`.
- `cancelOrder` and `modifyOrder` Server Actions in the standard shape — parse, client, RPC — both
  calling `revalidateTerminal()` on success. `cancel_order`'s bare `false` becomes `{ok:false}` with
  copy: already filled, already cancelled and not yours are one answer to the user.
- **Realtime on `orders` calls `router.refresh()`; it does not patch client state.** Orders are server
  state and never enter Zustand, per `library-docs.md`, and a refresh also picks up the cash and
  margin the same fill moved. The channel filters `user_id=eq.<uuid>` server-side — RLS scopes
  delivery already, but an unfiltered subscription still has every row delivered to and authorised
  for every subscriber. `event: '*'`, so a new order from another tab arrives as well as a fill.

**Verify:**

- Test (tier 2, `12-modify-order.sql`): raising the quantity blocks more margin and lowers
  `available_cash` by exactly the difference; lowering it returns exactly the difference. Identities
  1, 3 and 8 hold after each.
- Test (tier 2): a modify beyond the balance returns `(false,'INSUFFICIENT_FUNDS')` and leaves
  `orders.quantity`, `orders.blocked_margin`, `available_cash` and `used_margin` byte-identical. The
  subtransaction is the whole point of the feature, so this is the case that falsifies it.
- Test (tier 2): a modify on a `COMPLETE` order is refused, and another user's order id returns
  `(false,'NOT_FOUND')`.
- Test (tier 1): every modify reason has copy, asserted over the map rather than case by case, so a
  fifth reason added in SQL cannot ship unmapped.
- Test (tier 1): `istDayStart` across an instant just after IST midnight, one just before, and one
  where the UTC date and the IST date differ.
- **Test (tier 3): cancelling at the moment the matcher fills.** Session A holds the order lock
  through `execute_order` and commits while session B's `cancel_order` blocks on it — exactly one
  outcome, a `COMPLETE` with one trade or a `CANCELLED` with none, never both. **Falsifiability: re-run
  against a build with `cancel_order`'s post-lock status guard removed and confirm it fails.**
- Browser: a limit order appears under Open immediately after placement, with its blocked margin
  already gone from the header's available cash.
- Browser + SQL: cancelling moves it to Cancelled and restores `available_cash` to the paisa — read
  `funds` for that id rather than trusting the screen.
- Browser: modifying an executed order is refused — the action is absent on a non-open row, and the
  RPC refuses it directly.
- Browser: a fill moves the row from Open to Executed with no reload —
  `performance.getEntriesByType('navigation').length` stays 1. **Read `document.visibilityState`
  first**: a backgrounded tab is why three features have lost time to a working interaction that
  reported as dead.
- DOM at 375px: the scroll region carries `tabIndex` and a label, the table a `<caption>` and `scope`
  on every header. Lighthouse cannot audit a terminal page — it follows the redirect and scores the
  login page.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and
  `pnpm format:check` all exit zero.


### 28 Limit order matching

The resting side of the book. A LIMIT order placed away from the market waits as `OPEN`; this is the
function that notices a quote has crossed it. It adds **no fill logic and no pricing** — `execute_order`
is still the only place a fill happens, and it was already built to be called on any open order.

**Logic:**

- `match_open_orders()` returning `(filled integer, faulted integer)`, `security definer`, `set search_path = ''`, revoked from `public, anon, authenticated`. It selects `OPEN` `LIMIT` orders joined to `quotes` — fresh quote, buys at or below, sells at or above — and calls `execute_order` for each.
- **The selection is an optimisation, not a correctness boundary.** `execute_order` re-checks `status = 'OPEN'` *and* re-checks limit eligibility under the row lock, so a bug in the predicate here can cost a fill a tick; it cannot cause a wrong one. It exists to avoid taking row locks on orders that would decline anyway.
- **No symbol argument.** Sweeping every crossing order is simpler than passing the refreshed list, and strictly better: it also catches an order placed between ticks that already crosses the last quote.
- **`order by placed_at, id`**, load-bearing twice. Fairness: where a user's cash covers only one of two crossing orders, the one resting longer fills — the exchange's time-priority rule. Deadlock avoidance: two simultaneous runs take the same order-row locks in the same sequence.
- **One subtransaction per order**, the `BEGIN/EXCEPTION` shape `modify_order` established (F27). A faulting order rolls back alone, logs `raise warning`, and the run continues; the alternative lets one poisoned order block every user's fills on every tick. Business rejections never come through here — `execute_order` files those as `REJECTED` rows and returns normally.
- **`filled` counts orders that reached `COMPLETE`**, read back after the call, because `execute_order` returning is not the same as a fill. Under two overlapping runs both may report the same fill; the count is per-run bookkeeping for the tick's log line, never a claim of exclusivity.
- Called by `market-tick` **strictly after the quote upsert**, inside the existing session gate — matching before the upsert would match this tick's orders against last tick's prices. `matched` and `faulted` join the tick's response body so `cron.job_run_details` shows them.

**Verify:**

- Test (tier 2, `13-match-open-orders.sql`): a buy limit above the market fills and one below keeps resting; a sell limit below fills and one above rests. `pnpm test:db`.
- Test (tier 2): a stale quote fills nothing however far the order has crossed, and leaves it resting rather than rejected — §5's window, not the price, is what stops it.
- Test (tier 2): a crossing order the account can no longer afford is `REJECTED` and `available_cash` stays at or above zero. The setup is artificial by necessity and says so: a buy reserves at its limit and fills at or below it, so the branch is unreachable through the product's own flows.
- Test (tier 2): two crossing orders both fill, and the older one's trade carries the earlier `traded_at` — pinning the `ORDER BY` without starving the account.
- Test (tier 2): with a fault injected on one order, `faulted` is 1, `filled` is 1, the following order fills normally, and the faulting order is rolled back to `OPEN` so the next tick retries it. **Falsifiability: remove the `EXCEPTION` clause and this suite dies on the injected fault.**
- Test (tier 2): identities 1, 3 and 8 all hold after the run.
- **The fixture empties `orders` and `quotes` first.** The matcher takes no user and no symbol, so a suite that left real resting orders in place would fill them and its result would depend on what the developer happens to be holding (F16's rule). Orders are retired with `cancel_order`, never `delete` — `fund_ledger` and `trades` reference `orders on delete cascade`, so a delete would take the `MARGIN_BLOCK` row with it while the cash stayed moved, and §12.1 would pass for the wrong reason.
- Test (tier 3, `matcher.race.test.ts`): two simultaneous `match_open_orders()` runs produce exactly one trade, one `BUY_DEBIT`, and `filled_quantity` 10. **The interleaving is forced, not hoped for**: session A takes the order's row lock first, B's sweep selects the still-`OPEN` order and blocks inside `execute_order`, and A only proceeds once `pg_stat_activity` confirms B is waiting. Issuing B's sweep and immediately committing A is *not* enough — if B's query has not reached the wire, its own SELECT filters the filled order out and the test passes with the guard removed, the selection having deduplicated instead of the guard. **Falsifiability: remove `execute_order`'s post-lock status re-check and this fails with two trades.**
- **Tier 3 commits, and the matcher sweeps every symbol**, so the test first asserts that no *other* fresh-quoted crossing order exists and fails loudly if one does. Outside market hours nothing qualifies, because quotes go stale within minutes; during a session it would fill a real user's order into their real ledger.
- Observed live: a limit order placed just off the market fills within two minutes during market hours. **Needs an open session** — pair it with F27's remaining items and F26's filled path.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and `pnpm format:check` all exit zero.

### 29 MIS auto square-off

Intraday positions do not survive the day. At or after 15:20 IST every open MIS position is exited at
the last traded price — the same thing a user exit does, which is why this feature settles nothing of
its own.

**Logic:**

- `square_off_mis(p_at timestamptz default now())` returning `(squared integer, faulted integer)`, `security definer`, `set search_path = ''`, revoked from `public, anon, authenticated`. `p_at` exists so the 15:19/15:20 boundary is testable, mirroring `market_state(at)`.
- **The exit is a real order filled by `execute_order`**, because `architecture.md`'s invariant admits no other route: a square-off is a fill. So it writes a MARKET order and calls `execute_order`, inheriting §3's charges, §6's collateral release and loss cap, §7's ledger rows and §9's P&L without restating any of them. The order appears on the Orders page under Executed, as Kite presents an auto square-off.
- **`is_auto_squareoff` is set by `square_off_mis` after the fill**, matching on `order_id`, rather than by widening `execute_order`. Atomic — `execute_order` runs inside its transaction — and it leaves a function proven at three tiers alone.
- **It re-reads the position under its own lock before writing the exit order**, and skips when it has gone. Without this, two overlapping runs both select a position, the first closes it, and the second's exit order executes against nothing — which `execute_order` correctly reads as *opening* a short. The job could create a naked position at 15:20 with collateral blocked against it. Same guard `execute_order` applies to an order's status, for the same reason.
- **It takes the user's `funds` row before that position row**, because it holds the position lock across its `execute_order` call and `execute_order` acquires the two in the opposite order. Taking them the other way round made this function the only path in the system that inverted the pair, and any concurrent order on the same user and symbol closed an ABBA cycle. Ordering, not extra locking: the funds lock is redundant on its own, since `execute_order` takes the same row moments later.
- No margin is reserved: the exit is entirely a closing leg.
- Oldest position first (`opened_at`), one subtransaction per position — the fairness and deadlock reasoning of F28.
- A stale quote rejects the exit with `NO_QUOTE` and the next run retries; §5's window is not bypassed for this caller. Called by `market-tick` **after** the matcher, so an order crossing on this tick fills on this tick before being squared off.
- `market_constants()` gains `square_off_ist`, mirroring `SQUARE_OFF_TIME_IST`.

**Verify:**

- Test (tier 2, `14-square-off.sql`, 25 assertions): a position open at 15:19 survives with no square-off trade; at 15:20 all three close, their rows are deleted, and each exit trade carries `is_auto_squareoff` while the user's own entry does not.
- Test (tier 2): the short's collateral is fully released and identities 1 and 3 hold after it.
- Test (tier 2): the CNC holding is untouched and no exit order is written for a CNC-only account.
- Test (tier 2): a short whose loss exceeds collateral plus cash still closes — cash lands at exactly `0.00`, a `SIMULATION_ADJUSTMENT` carries the remainder, and `trades.realised_pnl` keeps the true uncapped loss.
- Test (tier 2): **two underwater shorts on one account both close.** The case that found `execute_order` rejecting a *closing* leg for want of funds — its solvency check demanded `available_cash >= charges` with no opening leg, while the collateral about to pay them sat in `positions.blocked_margin` where the check could not see it. **Falsifiability: drop `v_open_quantity > 0` and this goes red with the second position stranded.**
- Test (tier 2): after a square-off, a duplicate exit order opens a naked short — characterising, deterministically, the hazard the position lock exists to prevent.
- Test (tier 2): a second run in the same minute squares off nothing.
- Test (tier 3, `squareoff.race.test.ts`): two simultaneous runs exit a position exactly once. **Falsifiable — apply `20260905150000_square_off_mis.sql` (the body with no re-read) and it goes red on B returning `(1, 0)`,** having filled its exit against a position A had already closed. Confirmed 2026-09-05; restore with `20260905190000_square_off_funds_before_position.sql`. Two earlier versions of this test were weaker and both failures are recorded in its header: it asserted only the end state, which was *identical* on the broken build, and it staged the interleaving by locking the position row, which the corrected lock order turns into a deadlock with the sweep. It blocks B on the funds row now — the lock `square_off_mis` takes first — and the hazard reports as itself rather than as a fault counter.
- Test (tier 2, `15-lock-order.sql`, 5 assertions): the acquisition sequence read back out of each live definition, pinning `orders → funds → holdings → positions`. **Falsifiability: inject `20260905180000`'s body after the suite's own `begin;` and assertion 2 fails with `have: {positions}` against `want: {funds,positions}`** — done that way so the rollback restores the function and the live database is never changed. An audit of all eight lock-taking functions found two more inversions: `transfer_margin_to_position` and `recompute_position_collateral` take `positions` before `funds`, safe today only because `execute_order` holds both before calling them. Asserted as they are rather than changed, and the precondition is now on each function's own comment (`20260905200000`).
- Test (tier 3, `squareoff-lockorder.race.test.ts`): a sweep and a user's own order on the same position do not deadlock. **Falsifiable — apply `20260905180000_square_off_locks_position.sql` and it goes red.** The test asserts *both* possible victims, so it does not depend on which backend Postgres aborts: the user's `execute_order` must not carry a `40P01`, and the sweep must return `(1, 0)` with no MIS position left open. Confirmed 2026-09-05 — the sweep was the victim, returning `(0, 1)` with the position still open.
- The intermittent timeout was `waitUntilBlocked` identifying the blocked backend by `pg_stat_activity.query`, which is not dependable through Supavisor. It polls `pg_blocking_pids()` on the watched pid now, and the pre-flight check runs before seeding across every symbol so a stray fixture cannot make the sweep multi-row. `seedRaceTrader`, `assertNoOpenMisPositions` and `waitUntilBlocked` moved into `helpers.ts` rather than being copied a third time.
- **Follow-up, still undecided — narrowed.** `square_off_mis`'s `exception when others` swallows `40P01` and `40001` alongside a genuine row fault, and **`match_open_orders` carries the identical handler**, so whatever is decided applies to both. The inversion that made that reachable is fixed, so a deadlock here now means a *new* one, which argues for making it loud rather than counting it. Re-raising is still wrong — it would abort the sweep for every other user, which is exactly what the per-position subtransaction exists to prevent (F28). The open question is therefore narrower: whether to return a third counter separating a concurrency abort from a bad row. Widening `returns table` forces a DROP, and a dropped function is re-granted to `anon` and `authenticated` by Supabase's defaults — so this waits until something actually reads the counter, in Phase 5.
- Constants stay mirrored: `pnpm test:parity` asserts `square_off_ist` field by field.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and `pnpm format:check` all exit zero.

### Phase checkpoint

The engine is correct and covered by tests. Re-run the full suite, reconcile a randomised trading session end to end, and confirm every identity in `trading-contract.md` §12 holds.

---


