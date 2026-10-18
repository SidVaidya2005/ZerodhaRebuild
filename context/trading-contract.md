# Trading & Accounting Contract

This document defines how simulated cash, orders, positions, and charges behave. Its rules are
binding. Read it before changing SQL or logic involving `funds`, `fund_ledger`, `orders`, `trades`,
`holdings`, or `positions`. It takes priority over other documents for anything involving money.

The schema and application must implement this contract. Rates are mirrored in `src/lib/constants.ts`;
features 22–32 verify the accounting rules. Brief definitions of trading terms are in
`project-overview.md` → Terms used in these docs.

## 1. Principles

- Postgres calculates every stored monetary figure using exact `numeric` arithmetic. TypeScript
  displays results and may show a clearly labelled estimate in the order ticket; that estimate
  must never be stored. TypeScript must not calculate any monetary value for storage.
- Store money in rupees as `numeric(14,2)` and quantities as `integer`. Do not use floating-point
  arithmetic in the authoritative money path.
- Fills are all-or-nothing: `filled_quantity` is either `0` or `quantity`. There is no simulated
  counterparty order book and no partial fill.
- There is no leverage. CNC and MIS both require the full trade value; the product distinction is
  about settlement and intraday closing, rather than borrowing to increase buying power.
- The ledger records available cash. Every `fund_ledger` row corresponds to one change in
  `funds.available_cash`, with `balance_after` showing the resulting balance. Every cash movement
  must have a ledger entry.

## 2. Rounding

- Calculate each charge component at full `numeric` precision, then round half-up to two decimal places.
- Calculate GST from the unrounded components and round once:
  `round(0.18 × (brokerage + exchange + SEBI + dp_base))`. Do not apply GST to already-rounded
  components. This gives GST the same single rounding step as every other charge. (F06)
- `trades.charges` is the sum of the rounded components. Do not round the unrounded total instead:
  `charge_breakdown` must add up to `charges` exactly, including every paisa.
- Trade value is exactly `quantity * price`; both operands are exact `numeric` values, so it needs
  no additional rounding.
- Express percentages as decimal rates in `constants.ts`: for example, `0.0003`, not `0.03`.

## 3. Charge model

Calculate charges per executed order, on turnover = `quantity * price`.

| Component                  | CNC buy                                          | CNC sell              | MIS buy                      | MIS sell                     |
| -------------------------- | ------------------------------------------------ | --------------------- | ---------------------------- | ---------------------------- |
| Brokerage                  | ₹0                                               | ₹0                    | `min(0.03% × turnover, ₹20)` | `min(0.03% × turnover, ₹20)` |
| STT                        | 0.1%                                             | 0.1%                  | —                            | 0.025%                       |
| Exchange transaction (NSE) | 0.00307%                                         | 0.00307%              | 0.00307%                     | 0.00307%                     |
| SEBI turnover fee          | 0.0001%                                          | 0.0001%               | 0.0001%                      | 0.0001%                      |
| Stamp duty                 | 0.015%                                           | —                     | 0.003%                       | —                            |
| GST                        | 18% of (brokerage + exchange + SEBI + `dp_base`) | same                  | same                         | same                         |
| DP charge (`dp_base`)      | —                                                | ₹13.00 flat per scrip | —                            | —                            |

Source: <https://zerodha.com/charges/>, checked on 2026-08-21, 2026-08-22 at the start of Phase 4,
and 2026-09-09 during Phase 5. Rates were unchanged across those recorded checks, including the
₹15.34-inclusive DP amount and the GST presentation explained below. These are dated verification
records, rather than a claim that rates were checked again during a wording edit.

STT, stamp duty, SEBI fees, exchange charges, and GST are set by regulators or the exchange and can
change by circular. Recheck this table at the start of every phase that changes money behaviour,
and on any Union Budget. The exchange rate already changed from 0.00297% to 0.00307% during this project.

- Stamp duty applies only on buys. MIS STT applies only on sells. DP charges apply only to CNC
  sells and are flat regardless of quantity.
- Use ₹13.00 as `dp_base`. The ₹15.34 figure includes ₹2.34 GST: ₹3.50 CDSL plus ₹9.50 broker,
  multiplied by 1.18. Using ₹15.34 as the base would charge GST twice. The Pricing page displays
  ₹15.34 and explains the split.
- Zerodha's page describes GST as "18% on (brokerage + SEBI charges + transaction charges)" and
  puts DP's GST inside the ₹15.34 DP line. This contract puts that GST in the single `gst` field
  instead. The presentation differs; the total must agree. This distinction was rechecked on 2026-08-22.
- Include GST on `dp_base` in the same `gst` key as all other GST. Do not add a `dp_gst` key.
  Never apply GST to STT or stamp duty.
- Charge DP once per sell order. Real Zerodha charges once per scrip per day; a scrip means one
  stock. This simplification avoids checking same-day trades inside the locked fill transaction
  and adding reset cases. Disclose it on `/legal`, as specified in feature 08.
- `trades.charge_breakdown` is a `jsonb` object with one two-decimal-place number per component.
  Use `0` for absent charges; do not omit keys.
- Keep rates in `src/lib/constants.ts` and the Postgres equivalent. Feature 22's property test
  checks agreement over random inputs.

## 4. Order lifecycle

An order starts with placement and a margin reservation. The diagram summarises the fill and release
paths; cancellation is performed by `cancel_order`, not by `execute_order`.

```
                    place_order
                         │
                 reserve_margin()
                         │
              ┌──────────┴──────────┐
        can't reserve          reserved
              │                     │
          REJECTED            status = OPEN
       (INSUFFICIENT_FUNDS)         │
                        ┌───────────┼────────────┬─────────────┐
                    MARKET       LIMIT        user acts    matcher sees
                  immediate    waits for      cancel        crossing
                  execute_order  cross          │            price
                        │          │            │              │
                        └──────────┴────────────┼──────────────┘
                                                │
                                          execute_order
                                                │
                              ┌─────────────────┼─────────────────┐
                          COMPLETE          REJECTED          CANCELLED
                              │                 └────────┬────────┘
                   ┌──────────┴──────────┐         release_margin()
             opens a short        consumes cash
                   │                     │
      transfer_margin_to_position   release_margin()
       (collateral → position,       (whole reservation
        remainder released)           back to cash)
```

- Only `OPEN` orders may change status. After locking the order row, `execute_order`, `cancel_order`,
  and `modify_order` must reread its status and return without writing if it is no longer `OPEN`.
- `modify_order(order_id, quantity, limit_price)` changes only quantity and limit price. The order
  stays `OPEN`; changing other fields would require a different order and new pre-flight checks.
  Release the old reservation, write the new terms, and reserve again in one subtransaction.
  If the new terms cannot be funded, roll back the whole attempt, keeping both the original terms
  and original margin. A modification must never leave an underfunded order open.
- Retire a reservation exactly once when an order reaches a final status:
  - Rejection, cancellation, and cash-consuming fills (buys or sells closing longs) use
    `release_margin(order_id)` to return the full reservation to available cash.
  - A fill opening a short uses `transfer_margin_to_position(order_id)`. The short remains an
    obligation after the fill, so its collateral stays reserved against the position.
- Both retirement paths are idempotent: repeating a call has no effect once
  `orders.blocked_margin` is zero.
- Use stable rejection codes: `INSUFFICIENT_FUNDS`, `NO_HOLDING`, `NO_QUOTE`, `MARKET_CLOSED`,
  and `INVALID_QUANTITY`.

## 5. Fill pricing

Use observed server quotes. Never invent a fill price from browser animation or an unobserved move.

- MARKET fills at `quotes.ltp` when execution runs. If the quote is absent or its `fetched_at` is
  older than `QUOTE_STALE_AFTER_MS`, reject with `NO_QUOTE`.
- A LIMIT BUY is eligible when observed `ltp <= limit_price`; fill at that observed `ltp`.
- A LIMIT SELL is eligible when observed `ltp >= limit_price`; fill at that observed `ltp`.
- The observed crossing price may improve on the limit. Do not model any improvement beyond that
  observed price.
- Reject out-of-session market orders with `MARKET_CLOSED`. Limit orders may be placed outside
  the session, but can fill only during a session, when quotes are refreshed.

## 6. Margin and collateral

Margin is cash reserved to cover an order. Collateral is the amount kept reserved against an open
short. There is no leverage: ordinary opening trades require full value plus estimated charges.
Shorts require the more conservative collateral amount described below.

| Order                    | Reserved at placement                                                                                        | Held after fill                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| CNC buy                  | `quantity × price + est. charges`                                                                            | Nothing; cash is spent.                                              |
| MIS buy                  | `opening quantity × price + est. charges`; any quantity covering a short is already collateralised.          | Nothing; cash is spent.                                              |
| CNC sell                 | Nothing; requires `holdings.quantity >= quantity`.                                                           | —                                                                    |
| MIS sell opening a short | `short_collateral(shorting excess, price) + est. charges`, using the formula below at the reservation price. | Required collateral moves to `positions.blocked_margin` until cover. |

Use `limit_price` to reserve a limit order and current `ltp` to reserve a market order.

### Reserve only the new exposure

A short reserves collateral rather than just its notional value (quantity multiplied by price).
Collateral includes a 20% price buffer and closing charges. Reserving only 100% would let users place
shorts that immediately fail their own fill margin check, even without a price move.

A buy covering an existing short reserves fresh cash only for the quantity opening a long. Buying
10 against a short of 4 covers 4 and opens a long of 6; the existing collateral covers the first 4.
Reserving their value again could prevent a user from closing a short. Reserve estimated charges
for the whole order.

A sell crossing from long to short reserves only its shorting excess:
`quantity − max(net_quantity, 0)`. Selling 10 against a long of 4 closes 4 and shorts 6.
Estimate charges for all 10. A sell fully covered by a long reserves nothing, like a CNC sell.

The open short's obligation moves from the order to `positions.blocked_margin`. Recompute it on
entry, additions, partial cover, and full cover. When quantity reaches zero, release it completely.

### One collateral formula

```
positions.blocked_margin = |net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER)
                         + estimated_close_charges
```

`entry_reference_price` is the quantity-weighted average of gross fill prices, before charges.
It determines collateral. The separate `average_price` includes charges and determines reported
P&L. Never use one in the other's calculation; the cash-settlement exception is explained in §7.

For example, shorting 100 shares at ₹100 with ₹30 entry charges gives a net average of ₹99.70.
Using that net average for collateral gives `100 × 99.70 × 1.20 = ₹11,964`, below the ₹12,000
needed to cover a move to ₹120. The buffer must apply to the observed gross price.

Calculate `estimated_close_charges` with `calculate_charges` for a buy of the remaining quantity
at the buffered price. The price buffer alone does not cover those closing charges. Recomputing
from the formula on every quantity change also avoids rounding drift from proportional releases.

`SHORT_MARGIN_BUFFER` is 0.20. NSE bands can cap a stock's daily move at 5%, 10%, or 20%, so this
covers the largest banded move. Many Nifty 200 stocks are in the F&O segment without hard bands;
the simulator's loss-cap rule below handles that remaining risk.

### Transfer an order's margin to a short

`transfer_margin_to_position(order_id, fill_price, actual_charges)` runs as one statement block,
before the caller writes the trade or position. It returns `(ok, required_collateral,
entry_reference_price)`; the caller writes the last two values to the position. This function alone
derives the `entry_reference_price` basis; callers must persist its returned value rather than
recalculate it. Passing in the fill price lets a shortfall be rejected before there are new trade
or position rows to undo.

1. Calculate `required_collateral` using the post-fill gross `entry_reference_price`, including
   any existing short and this fill. Never use net `average_price`. Use actual charges from §3.
2. Calculate `delta = (required_collateral + actual_charges) − (orders.blocked_margin + positions.blocked_margin)`.
   Include the existing position's collateral so an addition to a short does not reserve it twice.
3. If `delta > 0`, extra cash is needed. If `available_cash < delta`, release the whole reservation
   and return `ok = false`; the caller marks the order `REJECTED` with `INSUFFICIENT_FUNDS` and
   writes nothing else. Otherwise write `MARGIN_BLOCK −delta`.
4. If `delta < 0`, write `MARGIN_RELEASE +|delta|`.
5. Set `orders.blocked_margin` to zero and move `required_collateral` to `positions.blocked_margin`.
   This transfer alone changes neither cash nor `used_margin`, so it writes no ledger row.
6. Release the charge portion with `MARGIN_RELEASE +actual_charges`, then debit it with
   `CHARGES −actual_charges`. This removes charges from `used_margin` without paying them twice;
   the two cash rows net to zero.

Across the block, `available_cash` changes by `−delta`, `used_margin` by `delta − actual_charges`,
and their sum by `−actual_charges`. Only charges leave the account; collateral moves between
reservations. Test that identity to catch double spending.

### Release collateral when covering

`recompute_position_collateral(user_id, symbol, new_net_quantity, order_id)` handles fills reducing
a short. Calculate the requirement for the quantity the position is about to become and return the
difference to cash with a `MARGIN_RELEASE` row. Include the causing `order_id` so §12.9 can reconcile
cash across the trade's lifetime.

Call it before writing the new quantity: a full cover deletes the position, and a flip to long
cannot retain short collateral. The target quantity supports partial cover, full cover, and flips
through the same rule. This function must refuse to increase collateral; increases belong to
`transfer_margin_to_position`, which knows how to retire the new order's reservation.

### Closing and opening in one fill

Settle the closing leg before retiring the reservation. When a sell crosses from long to short,
post its `SELL_CREDIT` before checking the new short's collateral. Otherwise a trade could be
rejected without counting its own sale proceeds. Use one subtransaction so an unfundable opening
leg rolls back the entire flip, including the credit.

A short limit sell reserved at ₹100 may fill at an observed ₹110. Although the sale price improves,
its collateral requirement increases. Step 3 handles that shortfall. A fill at the limit normally
has `delta = 0`, apart from estimated-versus-actual charge differences. A limit buy cannot have
this price-driven shortfall because it fills at or below its limit.

Do not transfer the whole reservation and then debit charges: that would keep charge money as
collateral while also spending it. Steps 5 and 6 separate those effects.

### A cover must remain affordable

A short's possible loss is unbounded, while reserved collateral is finite. When a cover or square-off
would require more than collateral plus available cash:

- Close the position anyway. Never leave it open because the account cannot cover its loss.
- Cap the cash debit at `min(loss, blocked_margin + available_cash − closing_charges)`.
  Available cash floors at zero; retain `CHECK (available_cash >= 0)`.
- Record the uncovered remainder as a `SIMULATION_ADJUSTMENT` credit so the ledger still reconciles.
- Keep the full uncapped loss in `trades.realised_pnl` so Reports shows the trade's actual result.

Rejecting all unbanded stocks would remove essentially the whole Nifty 200 shorting feature, so the
simulator uses this explicit adjustment instead. Real brokers may issue margin calls and pursue
the remaining debt; this project does neither. Disclose the difference on `/legal`.

The guaranteed close applies to covers and square-offs that open no new exposure. A flip also has
an opening leg, and fills are all-or-nothing: if the opening leg cannot be collateralised, reject
the whole order. The original position stays open and can still be closed with a pure cover.
(Phase 4 checkpoint)

The margin identity must hold at all times:

```
funds.used_margin = Σ orders.blocked_margin   WHERE status = 'OPEN'
                  + Σ positions.blocked_margin
```

Change both sides in the same statement block. Never set `used_margin` from an independent estimate.

## 7. Cash and ledger effects

Each row below changes `available_cash` and records the resulting `balance_after`.
The ledger types are `SIGNUP_CREDIT`, `MARGIN_BLOCK`, `MARGIN_RELEASE`, `BUY_DEBIT`, `SELL_CREDIT`,
`CHARGES`, `REALISED_PNL`, and `SIMULATION_ADJUSTMENT`.

| Event                                           | Ledger rows                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signup / reset                                  | `SIGNUP_CREDIT` `+100000.00`.                                                                                                                                                                                                                                           |
| Order placed (buy or short sell)                | `MARGIN_BLOCK` `−reservation`.                                                                                                                                                                                                                                          |
| Order cancelled or rejected                     | `MARGIN_RELEASE` `+reservation`.                                                                                                                                                                                                                                        |
| Order modified                                  | `MARGIN_RELEASE` `+old reservation`, then `MARGIN_BLOCK` `−new reservation`. Keep both rows to show the actual movements. An unfundable modification rolls back and writes nothing.                                                                                     |
| Buy fill (CNC or MIS long)                      | `MARGIN_RELEASE` `+reservation`, `BUY_DEBIT` `−trade_value`, `CHARGES` `−charges`.                                                                                                                                                                                      |
| Sell fill closing a long                        | `SELL_CREDIT` `+trade_value`, `CHARGES` `−charges`.                                                                                                                                                                                                                     |
| Short entry (MIS sell without an existing long) | Per §6 steps 4 and 6: `MARGIN_RELEASE` `+\|delta\|`, then `MARGIN_RELEASE` `+charges` and `CHARGES` `−charges`. Net cash is `+(reservation − collateral − charges)`. Collateral transfers to the position without a ledger row. No sale proceeds are credited at entry. |
| Short cover                                     | `MARGIN_RELEASE` `+position.blocked_margin`, `CHARGES` `−charges`, `REALISED_PNL` `±(entry_reference_price − cover_price) × quantity`, using the gross basis.                                                                                                           |
| Short cover exceeding the account               | The same rows, with the cash effect capped under §6 and a `SIMULATION_ADJUSTMENT` `+uncovered_remainder`. Available cash floors at zero; `trades.realised_pnl` retains the full loss.                                                                                   |

The table specifies the rows and their signs. Their order is binding only where explicitly stated
with "then", as in short entry's separate steps. For example, a buy fill writes `CHARGES` before
`BUY_DEBIT`; the reverse would have the same result. The solvency gate checks value plus charges,
so neither intermediate balance violates the cash constraint.

Short sale proceeds settle on cover rather than being credited and immediately blocked at entry.
This avoids offsetting rows that could make an obligation look like spendable cash.

### Cash settlement differs from reported P&L

The short cover's `REALISED_PNL` ledger row uses gross `entry_reference_price`.
`trades.realised_pnl` uses net `average_price`. Entry charges were already paid as a separate cash
row; using the net average again for settlement would pay them twice.

For example, shorting 100 at ₹100 with ₹6.42 entry charges gives `average_price` ₹99.94.
Covering at ₹90 settles `(100.00 − 90.00) × 100 = ₹1,000.00`, rather than ₹994.00.
The reported P&L separately accounts for charges through the net average and closing charges.
Using one figure for both purposes breaks reconciliation identity 1.

A ledger row always means cash moved. Transferring short collateral writes none because
`available_cash` does not change. Releasing the full reservation at short entry would make
collateral spendable while the obligation remains open, which is forbidden.

## 8. Holdings vs positions

- A CNC buy creates or updates `holdings`. Its weighted average includes charges:
  `new_avg = (old_qty × old_avg + trade_value + charges) / (old_qty + new_qty)`.
- A CNC sell reduces the holding quantity. Reject with `NO_HOLDING` if the requested quantity
  exceeds the holding; CNC short selling is not allowed.
- MIS trades update `positions` with `product = 'MIS'`. Negative `net_quantity` means a short.
- A partial close reduces quantity, accumulates `realised_pnl`, and leaves both `average_price`
  and `opened_at` unchanged. For a short, recompute the remaining collateral under §6 and release
  the difference immediately.
- Keep both averages on a short: net `average_price` for reported P&L and gross
  `entry_reference_price` for collateral and §7's cash settlement. Recompute both when adding to
  the short. Longs need only `average_price`; their `entry_reference_price` is null.

Charges raise a long's cost per share and lower a short's net proceeds per share. Use the formula
for the position's direction:

```
long   new_avg = (old_qty × old_avg + trade_value + charges) / (old_qty + new_qty)
short  new_avg = (old_qty × old_avg + trade_value − charges) / (old_qty + new_qty)
```

For a short of 100 at ₹100 with ₹30 charges, the correct average is ₹99.70. Covering at ₹100
therefore reports the ₹30 entry loss before closing charges. The long formula would produce ₹100.30
and report a ₹30 profit instead: an error of twice the entry charges.

Adding to a position leaves its original `opened_at` unchanged. Delete a holding or position when
its quantity reaches zero; do not leave zero rows in portfolio pages or the top-ten chart.

## 9. Realised P&L

- Record realised P&L only on the closing leg, net of that leg's charges:
  `realised_pnl = (exit_price − average_price) × quantity − closing_charges` for a long;
  `(average_price − exit_price) × quantity − closing_charges` for a short.
- Entry charges are already included in `average_price`; do not subtract them again.
- Set `trades.realised_pnl` to `0.00` on an opening leg, never null.
- This is the reported trading result. A short's cash settlement uses the separate gross-basis
  calculation in §7; do not substitute one for the other.
- A fill crossing zero has a closing and an opening leg within one order. Calculate charges once
  on the whole order and write one `CHARGES` row. Allocate
  `round(charges × closing_quantity / quantity, 2)` to the closing leg's realised P&L; capitalise
  the remainder in the new position's average. The allocations must sum exactly to `trades.charges`.
  This supports the crossing-zero reservations in §6.
- Compute unrealised P&L from `quotes.ltp` at read time. Never store it.

Day's P&L measures today's move in the currently held portfolio against the previous close:

```
day_pnl = Σ over holdings of  quantity × (ltp − prev_close)
```

Unrealised P&L instead compares price with `average_price`, answering what an open position has made
since entry. Day's P&L uses the watchlist's previous-close basis, so a stock up 2% there cannot
contribute a loss to the day's tile.

Return null when `prev_close` is missing; zero would falsely claim no change. Shares bought today
also use the previous close. Real brokers may measure today's purchases from their purchase price;
this simulator avoids that additional dependency on trades and discloses the simplification.
Compute day's P&L at read time, never store it.

## 10. Auto square-off

- At or after `SQUARE_OFF_TIME_IST` (15:20) on the position's trading day, close every open MIS
  position at current `ltp`. Flag the trade with `trades.is_auto_squareoff = true` for Reports.
- Release `positions.blocked_margin` and delete the position, as with a user-initiated exit.
- Every position has a price seed: it exists because a fill required a fresh quote, so its symbol
  already has a `quotes` row the simulator can refresh. No unpriceable-position path is needed.
- Apply §6's loss cap so a position never remains open for lack of cash.
- Record the closing price's provenance so Reports identifies a simulated exit.
- Do nothing before 15:20. Two simultaneous square-off calls must be safe.

## 11. Account reset

`reset_account()` runs in one transaction:

1. Delete the user's `orders`, `trades`, `holdings`, `positions`, and all `fund_ledger` rows.
2. Set `funds.available_cash = OPENING_BALANCE`, `used_margin = 0`, and `opening_balance = OPENING_BALANCE`.
3. Insert one `SIGNUP_CREDIT` ledger row.
4. Keep `profiles`, `watchlist_items`, `instruments`, and `quotes` unchanged.

This restores the post-signup trading balance and empty trading history while preserving preferences.
There is no `RESET` ledger type. Appending a reset event while also claiming to restore the signup
ledger would conflict with that requirement, so reset replaces the ledger with its single initial credit.

## 12. Reconciliation identities

These equations and rules must hold for every user at every instant. The tests check them separately so a correct
cash balance cannot hide an incorrect P&L calculation.

1. `funds.available_cash = Σ fund_ledger.amount` for that user.
2. The newest `fund_ledger.balance_after` equals `funds.available_cash`.
3. `funds.used_margin = Σ orders.blocked_margin (status='OPEN') + Σ positions.blocked_margin`.
4. `funds.available_cash >= 0`, enforced by a `CHECK` constraint.
5. Every existing holding has `holdings.quantity > 0`; no zero-quantity row remains.
6. Components in `trades.charge_breakdown` sum exactly to `trades.charges`.
7. No MIS position survives the first `market-tick` run at or after 15:20 IST. Since the job runs
   once a minute, the gap from 15:20:00 until that run is expected.
8. Every order whose status is not `OPEN` has `blocked_margin = 0`.
9. For a closed position, all ledger rows referencing its orders sum to the change in available
   cash over its lifetime. Include `MARGIN_BLOCK`, `MARGIN_RELEASE`, `BUY_DEBIT`, `SELL_CREDIT`,
   `CHARGES`, `REALISED_PNL`, and `SIMULATION_ADJUSTMENT`; omitting any type breaks the identity.
10. For each closing trade, `trades.realised_pnl` equals
    `(exit_price − average_price) × quantity − closing_charges` for a long, or
    `(average_price − exit_price) × quantity − closing_charges` for a short. Entry charges are
    already in the average. Check this independently of ledger sums.
11. Collateral calculations never read `average_price`; `trades.realised_pnl` never reads
    `entry_reference_price`. The gross-basis `REALISED_PNL` ledger row on short cover is a cash
    settlement, as §7 explains, and is the deliberate exception to the broader terminology.
12. An open short has `positions.blocked_margin` equal to
    `|net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges`.
    A long has zero blocked margin.

Keep identities 9 and 10 separate. Long closes settle through `SELL_CREDIT`, while short covers
settle through the gross-basis `REALISED_PNL` ledger row. Neither ledger path alone measures net P&L.

## 13. Keeping derived statements in sync

Other files repeat parts of this contract, and earlier reviews found outdated statements after its
rules changed. After any edit, run both sweeps below and reconcile every result before finishing.
The first finds margin, cash, and P&L statements; the second also finds charges and rates.

```bash
# Margin, cash and P&L rules.
grep -rn "release_margin\|transfer_margin_to_position\|blocked_margin\|available_cash\|used_margin\|MARGIN_\|average_price\|realised_pnl" \
  context/architecture.md context/architecture/ context/code-standards.md context/code-standards/ \
  context/build-plan.md context/build-plan/ CLAUDE.md

# Charge rules and rates. The grep above matches margin and P&L identifiers only, so it
# structurally cannot detect drift caused by editing a *rate* in §3 — which is exactly the
# edit feature 06 made. Sources are restated in code, so this one sweeps src/ as well.
# `stamp duty` not `stamp` — the latter matches every `timestamptz` in the schema.
grep -rn "charge_breakdown\|dp_charge\|dp_base\|STT\|stamp duty\|stamp_duty\|SEBI\|GST\|brokerage\|charges\.ts\|0\.00307\|15\.34" \
  context/architecture.md context/architecture/ context/code-standards.md context/code-standards/ \
  context/build-plan.md context/build-plan/ context/project-overview.md \
  CLAUDE.md src/lib/constants.ts src/lib/trading src/components/marketing
```

Every matching statement must agree with this document. Check `architecture.md` and its references,
`code-standards.md` and its references, the phase plans (especially features 22–32), and the code
paths included in the charge sweep. Keep the directory-wide phase search so newly added phase
files are checked too.
