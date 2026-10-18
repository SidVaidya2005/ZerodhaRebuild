> Part of `context/build-plan.md`; see that index for the build principle and phase order.
> Read the feature needed for the current task. `progress-tracker.md` holds current status.
> These specifications retain implementation-time decisions and dated verification results. Check
> current rules in the authoritative context files before reusing an older plan. Ongoing constraints
> live in `constraints.md`; the account of past work lives in `build-journal.md`.

## Phase 4 — Trading Engine

### 22 Charge calculator

Implement the charge calculator in Postgres and prove that it agrees with the TypeScript
estimator. **F06 already created `src/lib/trading/charges.ts`** for the pricing page's worked
example. Keep that estimator display-only under `trading-contract.md` §1; this feature neither
creates nor rewrites it.

Complete the carried-over items below first. They check the TypeScript estimator against figures
calculated by hand. The Postgres implementation needs an independently verified reference;
copying an expression from one language to another would preserve the same error.

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

Add a fourth test tier for parity: checking that two implementations return identical results.
This needs TypeScript and a database connection in the same process. Tier 1 has no database,
tier 2 runs only SQL, and tier 3 requires `ALLOW_RACE_TESTS` because it commits data.
`calculate_charges` writes nothing, so `pnpm test:parity` can run read-only over one `pg`
connection without that gate. Include it in `test:all`; putting it in tier 3 would let the
main check be skipped while `test:all` still passed.

**Verify:**

- **The four worked examples match to the paisa** — a delivery buy, a delivery sell, an intraday buy
  and an intraday sell, in `07-charges.sql`, each expected figure computed by hand in a comment above
  its assertion. **If Zerodha's published calculator cannot be reached, these are hand-computed from
  the §3 table and labelled as such** — that proves internal consistency, not external agreement, and
  which one shipped is recorded rather than blurred.
- **TypeScript and Postgres agree exactly over ≥100 random inputs** — `pnpm test:parity`, asserting
  all seven keys _and_ the total, seed printed so a failure reproduces. Exact equality, not "within a
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
  switch to rounding the _unrounded_ sum, so it is not inert, but it proves the property by
  restating the implementation rather than by independent expectation. Pin it to figures computed by
  hand, so the Postgres side this feature adds has something to be equal _to_.
- `DP_CHARGE_INCLUSIVE` is a hand-entered `15.34` with nothing tying it to
  `DP_CHARGE_BASE * (1 + GST_RATE)`. The file's own comment warns these rates move by circular;
  change the base and `/pricing` keeps showing ₹15.34 while the worked example updates, with the
  suite green. Assert the derivation.

### 23 Margin reservation and release

Build and verify margin reservation, release and short collateral before any order uses them.
Five internal functions own transfers between `funds.available_cash` and `funds.used_margin`,
and the collateral held for an open short. Margin is cash reserved for an order; short collateral
remains blocked while the short is open. **These functions do not fill orders or change position
quantities.** F24 calls them as part of execution.

**First amend `trading-contract.md` §6 and §7 in a separate commit.** This implementation plan
identified four errors in the contract at that time. Each affects the code:

- **§6 step 1's "using the post-fill `average_price`"** is a typo for `entry_reference_price`. It
  contradicts the formula printed directly above it, §12.11, §12.12, and this feature's own
  falsification test.
- **§6 step 2's delta ignores collateral already held on the position**, so a fill that _adds_ to an
  existing short double-blocks. It becomes
  `(required_collateral + actual_charges) − (orders.blocked_margin + positions.blocked_margin)`.
- **§6's table reserved 100% of notional for a short.** Collateral at fill is 120% of notional plus
  closing charges, so delta was positive by roughly a fifth of the trade on _every_ short — which
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
  - A buy reserves `opening quantity × price + estimated charges`. For CNC the opening quantity
    is the whole order; an MIS buy covering a short reserves fresh cash only for any quantity
    opening a long. Estimated charges still cover the whole order. A short-opening MIS sell
    reserves `short_collateral_requirement(excess, price) + estimated entry charges`.
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
- `recompute_position_collateral(p_user_id, p_symbol, p_new_net_quantity, p_order_id)` — the release side.
  Recomputes the requirement over the quantity the position is **about to become** and moves the
  difference to `available_cash` with a `MARGIN_RELEASE` row (§7's short-cover row). Called **before**
  F24 writes the new quantity: a full cover deletes the row and a flip to long cannot carry collateral,
  so neither case can be expressed afterwards. Refuses to _increase_ collateral — an add carries a
  reservation only `transfer_margin_to_position` knows how to retire.
- All five are `security definer` with `set search_path = ''`, fully schema-qualified, and
  **revoked from `public`, `anon` and `authenticated`** per `code-standards.md`'s grant policy.
  The original plan prescribed `orders` then `funds` locks with `for update` and a post-lock
  `status = 'OPEN'` check. **F29's installed-function audit supersedes that blanket lock rule:**
  `transfer_margin_to_position` and `recompute_position_collateral` take `positions` before
  `funds` and require `execute_order` to hold both already. Follow those helper preconditions
  and the current lock protocol in `architecture.md`; do not call either helper directly.

**Verify:** Use tier 2, which rolls back its work; the randomised suite therefore needs no commit
gate. Put hand-computed cases in `08-margin.sql` and the randomised sequence in
`09-margin-identities.sql`. The first checks individual calculations; the second catches paths
that update only one side of §12.3's margin identity.

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
- Test: a short entry reduces `available_cash + used_margin` by exactly the actual charges,
  never twice that amount. Available cash itself falls by collateral plus charges; the collateral
  remains in used margin.
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
- Test: covering half a short releases the old collateral minus the §6 requirement recomputed
  for the remaining quantity, with the expected amount calculated by hand. Do not assume a
  proportional half-release: closing charges and rounding can make it differ. A full cover and
  a flip to long each release all collateral.
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

Implement and test order fills entirely in SQL before connecting a UI. F23 owns margin and
collateral movements. F24 calls those functions in the right order and adds fill pricing,
charges, `trades`, `holdings`, `positions` and the cash ledger.

Start with two supporting functions needed to enforce `trading-contract.md` §5 in the database:

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
  - Return all three fields. Business rejections return normally under `code-standards.md`, so
    `error` is null; an order id alone cannot tell the Server Action whether the order filled or
    was rejected. Raising an error would roll back the `REJECTED` row required by §4 and the
    Orders page. Update `architecture.md`'s example and its account of `toRejectionCode` in the
    same change.
  - Pre-flight rejections, each writing the order row first so it exists to be read:
    `MARKET_CLOSED`, `INVALID_QUANTITY`, `NO_HOLDING` (a CNC sell beyond `holdings.quantity`),
    `INSUFFICIENT_FUNDS` (`reserve_margin` returned false).
  - Derives the user from `auth.uid()` and never accepts a `user_id` argument.
- `execute_order(order_id)` per the golden pattern: lock the order row, **return unless it is still
  `OPEN`**, lock the funds row, price it per §5, reject `NO_QUOTE` when there is no row or
  `fetched_at` is beyond the staleness window, compute charges, settle any closing leg before
  retiring the reservation (§6), insert the trade, upsert the holding or position, finish the funds
  and ledger changes, and complete the order. A sell crossing from long to short posts its
  `SELL_CREDIT` before the new collateral check; an unfundable opening leg rolls the entire fill
  back in one subtransaction.
- On completion the function retires the reservation the right way, **before writing the trade and the
  position**: `release_margin` for buys, long closes, cancellations and rejections;
  `transfer_margin_to_position(order_id, fill_price, actual_charges)` for a fill that opens a short.
  That one returns `(ok, required_collateral, entry_reference_price)` — on `ok = false` the
  reservation is already released and this function only has to set `REJECTED`/`INSUFFICIENT_FUNDS`;
  otherwise its two returned figures are written into the `positions` row.
- A fill that **reduces** a short calls `recompute_position_collateral(user_id, symbol, new_net_quantity, order_id)`
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
  Exactly one trade and one `BUY_DEBIT`, with each ledger row required by §7 written once.
  Run this against a build with the status guard removed and confirm it fails; duplicate calls
  must never produce a second fill or debit.
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

Build the order-entry dialog on top of the engine already verified in SQL. The dialog shows a
**labelled estimate** of the engine's money calculations, as `trading-contract.md` §1 permits.
Its TypeScript arithmetic must never produce a value stored in the database.

Use an `onSubmit` prop to connect this feature to F26. F25 supplies the dialog, validation schema,
estimates and submission guard; the injected handler returns `ActionResult`. F26 supplies the
real `placeOrder` action and toast notifications. This separation keeps the ticket's logic
testable in tier 1 without a database and keeps its double-submit guard here.

**UI:**

- Modal dialog with the system's trading buttons: `--color-up` for buy, `--color-down` for sell,
  `--radius-sm`, tight padding. The final confirm action is the brand CTA (`bg-brand text-on-brand`)
  — `DESIGN.md` reserves the trading colours for explicit price-direction meaning, so they mark the
  **side selector** and nothing else.
- Quantity, product toggle (CNC/MIS), order type toggle (MARKET/LIMIT), limit price shown only for
  limit orders.
- Live margin required, available cash, and the estimated charge breakdown, all updating as inputs
  change **and as server prices arrive**. A MARKET order estimates against the server `anchor`
  in F19's store, never its interpolated `ltp`, as `architecture.md` requires for the order ticket.
  A LIMIT order uses its entered limit price.
- Inline validation errors and a disabled submit while in flight.
- Mount one ticket in the terminal layout beside `<QuoteChannel/>`. The `useOrderTicket` store
  holds `{ open, symbol, side }`; each call site renders a button that calls
  `openTicket({ symbol, side })`. F18 renders its panel twice, in the `md` rail and mobile sheet,
  so mounting dialogs in rows would duplicate each form. F31's exit button can reuse the same
  ticket without another dialog.
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
  buy, `opening quantity × price + charges`; for an MIS sell opening a short,
  `short_collateral_requirement(shorting excess, price) + charges`. A CNC sell or an MIS sell fully
  covered by a long reserves nothing. A figure that ignores the
  existing position would tell a user covering a 100-share short that they need the full trade
  value plus estimated closing charges, when the engine reserves only those charges.
- Fetch the symbol's holdings and positions through one RLS-scoped select when the dialog opens.
  This gives the estimate current exposure without a request per keystroke or extra reads on
  pages where no ticket opens. Show a skeleton in the margin panel while the read resolves.

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
- Test: with a short of 100 open, covering 100 @ ₹100 reserves estimated closing charges alone,
  without reserving the trade value again. Assert this at tier 1 against `estimateMargin` and
  against the engine at tier 4.
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

Connect F25's dialog to `place_order` and show the outcome in a toast. No new SQL is needed:
F24 already verified the function at tiers 2–4. This feature parses the input, converts the
returned row to `ActionResult`, and revalidates pages affected by the order.

`place_order` returns `(order_id, status, rejection_reason)` with `error` null for three normal
outcomes: `REJECTED` with a stable reason code, `OPEN` for a resting limit order, or `COMPLETE`
for a market order filled in the same transaction. Treat a raised Postgres error or transport
failure separately; those are faults, not normal business outcomes.

**UI:**

- **`<Toaster/>` mounted in the `(terminal)` layout.** It exists in `src/components/ui/sonner.tsx` and
  is currently rendered nowhere. The terminal, not the root: the marketing side uses `useActionState`
  with inline state and needs no toast, and this keeps `sonner` out of the public bundle. It moves up
  if that ever changes.
- Show a toast and close the ticket after either success or failure. A rejection has already been
  recorded as a `REJECTED` order for F27 to display. Leaving its form open would suggest the same
  order could still be edited, when another submit creates another order. Remove F25's inline
  `failure` state, which is no longer reachable.
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
  _row_ appearing under a tab is F27's check; `/orders` is still a stub here.
- **Blocked until a live session: a market buy fills and appears in Holdings without a reload.** Every
  MARKET order is rejected outside market hours, so this rides along with F16's pending items on the
  next trading day. The fill itself is already proven at tiers 2–4 by F24; what waits is the action,
  the revalidation and the toast on a `COMPLETE`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and
  `pnpm format:check` all exit zero.

### 27 Orders page

Show orders after placement and provide cancel and modify controls for those still open.
`cancel_order` already shipped in F24 with a row lock and a post-lock `status = 'OPEN'` check;
`orders` is also in the `supabase_realtime` publication. Add `modify_order`, which the grant list
in `code-standards.md` names and F24 explicitly left for this feature, then build the page over
both write paths.

**Show today's orders and every `OPEN` order, regardless of age.** An older resting order still
holds margin and must remain visible. F34 covers completed trades rather than orders, so a
strict today-only page would leave a cancelled order with no surface. The original plan relied
on the open-order exemption to make the date filter safe.

**Open issue found at the Phase 4 checkpoint: an older order disappears when it fills today.**
A limit placed on 22 Aug and filled on 6 Sept was observed moving from Open to absent, rather
than Executed. Completion removes the `OPEN` exemption, and its placement date is outside the
filter. The trade remains in `trades` for F34, but the Orders page loses the fill confirmation.

No fix was chosen. The candidates were to include orders executed today as well as placed today
(one more `.or()` clause), retain filled orders until the session ends, or leave the record to
F34. The original follow-up was to decide this when F34 was built, once its history surface made
the remaining need clear. This note does not mark that decision resolved.

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
- Reuse `reserve_margin` to calculate the new reservation; do not duplicate §6's arithmetic.
  Run `release_margin` → write the new terms → `reserve_margin` inside a plpgsql block with an
  `EXCEPTION` clause. If re-reservation fails, raise inside that block so only those changes roll
  back, then return `(false,'INSUFFICIENT_FUNDS')` normally. The original terms and reservation
  must both survive. Release must come first because `reserve_margin` returns early when
  `blocked_margin <> 0`.
- **No third writer of `blocked_margin`.** `architecture.md`'s invariant names `release_margin` and
  `transfer_margin_to_position` as the only functions that zero it and forbids any other path
  zeroing the column. `modify_order` must use `release_margin` and `reserve_margin` rather than
  adjusting the reservation directly.
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

Match resting LIMIT orders when a fresh quote crosses their limit. This function finds eligible
orders and calls `execute_order`; **it must contain no fill logic or pricing rules**. Only
`execute_order` may fill an order.

**Logic:**

- `match_open_orders()` returning `(filled integer, faulted integer)`, `security definer`, `set search_path = ''`, revoked from `public, anon, authenticated`. It selects `OPEN` `LIMIT` orders joined to `quotes` — fresh quote, buys at or below, sells at or above — and calls `execute_order` for each.
- Use the selection to avoid unnecessary row locks. `execute_order` must still re-check both `status = 'OPEN'` and the limit condition while holding the row lock. A selection bug may delay a valid fill until another tick; it must never permit an invalid fill.
- **No symbol argument.** Sweeping every crossing order is simpler than passing the refreshed list, and strictly better: it also catches an order placed between ticks that already crosses the last quote.
- **`order by placed_at, id`**, load-bearing twice. Fairness: where a user's cash covers only one of two crossing orders, the one resting longer fills — the exchange's time-priority rule. Deadlock avoidance: two simultaneous runs take the same order-row locks in the same sequence.
- Use one subtransaction per order, following F27's `BEGIN/EXCEPTION` pattern. A subtransaction is a block whose changes can roll back without undoing the whole run. If one order faults, roll back that order, log `raise warning`, and continue; one bad row must not stop every user's fills. Business rejections do not enter this handler: `execute_order` records them as `REJECTED` and returns normally.
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
- Test (tier 3, `matcher.race.test.ts`): two simultaneous `match_open_orders()` runs must produce
  exactly one trade, one `BUY_DEBIT`, and `filled_quantity` 10. Force the overlap: A takes the
  order's row lock; B selects the still-`OPEN` order and blocks inside `execute_order`; A proceeds
  only after `pg_stat_activity` confirms B is waiting.

  Do not commit A immediately after starting B. If B has not sent its query yet, its SELECT
  excludes the completed order and the test passes even without the status guard. **Remove
  `execute_order`'s post-lock status re-check to prove the test fails with two trades.**

- **Tier 3 commits, and the matcher sweeps every symbol**, so the test first asserts that no _other_ fresh-quoted crossing order exists and fails loudly if one does. Outside market hours nothing qualifies, because quotes go stale within minutes; during a session it would fill a real user's order into their real ledger.
- Observed live: a limit order placed just off the market fills within two minutes during market hours. **Needs an open session** — pair it with F27's remaining items and F26's filled path.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and `pnpm format:check` all exit zero.

### 29 MIS auto square-off

Close every open MIS position at or after 15:20 IST using the last traded price. Reuse the same
order-execution path as a user exit, so this job adds no separate settlement rules.

**Logic:**

- `square_off_mis(p_at timestamptz default now())` returning `(squared integer, faulted integer)`, `security definer`, `set search_path = ''`, revoked from `public, anon, authenticated`. `p_at` exists so the 15:19/15:20 boundary is testable, mirroring `market_state(at)`.
- **The exit is a real order filled by `execute_order`**, because `architecture.md`'s invariant admits no other route: a square-off is a fill. So it writes a MARKET order and calls `execute_order`, inheriting §3's charges, §6's collateral release and loss cap, §7's ledger rows and §9's P&L without restating any of them. The order appears on the Orders page under Executed, as Kite presents an auto square-off.
- **`is_auto_squareoff` is set by `square_off_mis` after the fill**, matching on `order_id`, rather than by widening `execute_order`. Atomic — `execute_order` runs inside its transaction — and it leaves a function proven at three tiers alone.
- Lock and re-read the position before creating the exit order. Skip it if another run has already removed it. Otherwise, two overlapping runs could select the same position: the first closes it, then the second submits an exit against no position, which `execute_order` treats as a new short. Re-checking after the lock prevents the job from opening fresh exposure at 15:20, just as the order-status guard prevents duplicate fills.
- Acquire the user's `funds` row before the position row. The job holds both while calling `execute_order`, which also acquires funds before positions. The earlier reverse order allowed a deadlock with a concurrent order on the same user and symbol: each transaction held the row the other needed, an ABBA cycle. Taking funds first fixes the acquisition order; `execute_order` would take that same funds lock shortly afterwards anyway.
- No margin is reserved: the exit is entirely a closing leg.
- Oldest position first (`opened_at`), one subtransaction per position — the fairness and deadlock reasoning of F28.
- A stale quote rejects the exit with `NO_QUOTE` and the next run retries; §5's window is not bypassed for this caller. Called by `market-tick` **after** the matcher, so an order crossing on this tick fills on this tick before being squared off.
- `market_constants()` gains `square_off_ist`, mirroring `SQUARE_OFF_TIME_IST`.

**Verify:**

- Test (tier 2, `14-square-off.sql`, 25 assertions): a position open at 15:19 survives with no square-off trade; at 15:20 all three close, their rows are deleted, and each exit trade carries `is_auto_squareoff` while the user's own entry does not.
- Test (tier 2): the short's collateral is fully released and identities 1 and 3 hold after it.
- Test (tier 2): the CNC holding is untouched and no exit order is written for a CNC-only account.
- Test (tier 2): a short whose loss exceeds collateral plus cash still closes — cash lands at exactly `0.00`, a `SIMULATION_ADJUSTMENT` carries the remainder, and `trades.realised_pnl` keeps the true uncapped loss.
- Test (tier 2): **two underwater shorts on one account both close.** The case that found `execute_order` rejecting a _closing_ leg for want of funds — its solvency check demanded `available_cash >= charges` with no opening leg, while the collateral about to pay them sat in `positions.blocked_margin` where the check could not see it. **Falsifiability: drop `v_open_quantity > 0` and this goes red with the second position stranded.**
- Test (tier 2): after a square-off, a duplicate exit order opens a naked short — characterising, deterministically, the hazard the position lock exists to prevent.
- Test (tier 2): a second run in the same minute squares off nothing.
- Test (tier 3, `squareoff.race.test.ts`): two simultaneous runs exit a position exactly once.
  **The test was falsified on 2026-09-05:** applying `20260905150000_square_off_mis.sql`, whose
  body has no re-read, made B return `(1, 0)` after filling an exit against the position A had
  closed. Restore with `20260905190000_square_off_funds_before_position.sql`.

  The test header records two weaker earlier versions. Checking only the end state passed on
  the broken build; staging the overlap with a position lock caused a deadlock under the fixed
  acquisition order. The test now blocks B on funds, the first lock `square_off_mis` takes, so
  it exposes the duplicate exit directly rather than only a fault counter.

- Test (tier 2, `15-lock-order.sql`, 6 assertions): inspect the installed function definitions
  to pin acquisition order to `orders → funds → holdings → positions`. **Falsify it by injecting
  `20260905180000`'s body after the suite's `begin;`: assertion 2 must fail with
  `have: {positions}` against `want: {funds,positions}`.** The transaction rollback then restores
  the function; the live definition is never left changed.

  The audit of all eight lock-taking functions found two further inversions:
  `transfer_margin_to_position` and `recompute_position_collateral` take `positions` before
  `funds`. They are safe only because `execute_order` already holds both when calling them.
  Keep assertions for those existing definitions and the precondition in each function's comment
  (`20260905200000`), rather than silently treating them as ordinary entry points.

- Test (tier 3, `squareoff-lockorder.race.test.ts`): a sweep and a user's own order on the same position do not deadlock. **Falsifiable — apply `20260905180000_square_off_locks_position.sql` and it goes red.** The test asserts _both_ possible victims, so it does not depend on which backend Postgres aborts: the user's `execute_order` must not carry a `40P01`, and the sweep must return `(1, 0)` with no MIS position left open. Confirmed 2026-09-05 — the sweep was the victim, returning `(0, 1)` with the position still open.
- The intermittent timeout was `waitUntilBlocked` identifying the blocked backend by `pg_stat_activity.query`, which is not dependable through Supavisor. It polls `pg_blocking_pids()` on the watched pid now, and the pre-flight check runs before seeding across every symbol so a stray fixture cannot make the sweep multi-row. `seedRaceTrader`, `assertNoOpenMisPositions` and `waitUntilBlocked` moved into `helpers.ts` rather than being copied a third time.
- **Follow-up found at the Phase 4 checkpoint: lock ordering is consistent within a user, but not
  across users.** `15-lock-order.sql` checks the order inside each function and cannot detect this
  wider problem. `match_open_orders` visits `order by o.placed_at, o.id`; `square_off_mis` visits
  `order by p.opened_at, p.user_id, p.symbol`. Each `execute_order` call keeps its user's `funds`
  lock until the entire sweep transaction ends. The sweeps can therefore accumulate different
  users' locks in different orders.

  For example, matching may hold `funds(U1)` and wait for `funds(U2)` while square-off holds
  `funds(U2)` and waits for `funds(U1)`. Postgres ends this deadlock with `40P01`. Both handlers
  count it as a fault; square-off could then leave an MIS position open past 15:20, violating §10
  and identity 7.

  **No fix is planned yet.** A single tick runs the sweeps sequentially, so the problem needs
  overlapping ticks. F16 measured fewer than 10 seconds for 200 symbols against a 60-second
  schedule. If needed, the smaller fix is a tick overlap guard using `pg_try_advisory_lock`.
  Sorting both sweeps by `user_id` first would also align locks, but would remove the matcher's
  `placed_at` time priority. Consider this alongside the counter question below.

- **Follow-up still undecided: distinguish concurrency aborts from bad rows.** Both
  `square_off_mis` and `match_open_orders` use `exception when others`, so they count `40P01`
  and `40001` alongside ordinary row faults. The known per-user inversion has been fixed; a
  deadlock would now reveal another problem worth exposing.

  Re-raising would abort the sweep for other users and defeat F28's per-position
  subtransactions. The remaining proposal is a third result counter for concurrency aborts.
  Changing `returns table` requires a DROP, after which Supabase's defaults grant the recreated
  function to `anon` and `authenticated`; grants must be restored deliberately. The original
  decision was to wait until Phase 5 had a consumer for that counter. This remains an open note.

- Constants stay mirrored: `pnpm test:parity` asserts `square_off_ist` field by field.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm test:parity`, `pnpm build` and `pnpm format:check` all exit zero.

### Phase checkpoint

Before closing Phase 4, re-run the full suite and reconcile a randomised trading session end to
end. Every identity in `trading-contract.md` §12 must hold; passing UI checks alone does not
establish that the engine is correct.

---
