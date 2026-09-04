# Trading & Accounting Contract

> **Role:** The authoritative definition of how money, orders, positions and charges behave. Every rule here is a decision, not a suggestion.
> **Read before writing any SQL or logic that touches** `funds`, `fund_ledger`, `orders`, `trades`, `holdings`, or `positions`.
> **Relates to:** the schema in `architecture.md` exists to serve this document; rates live in `src/lib/constants.ts`; the reconciliation identities below are what `build-plan.md` features 22–32 verify.

If this document and any other context file disagree, **this document wins** for anything involving money.

---

## 1. Principles

- **Postgres is authoritative.** Every stored monetary figure is computed in Postgres `numeric`. TypeScript renders numbers and may show a clearly-labelled *estimate* in the order ticket; it never produces a stored value.
- **Money is `numeric(14,2)` in rupees.** Quantities are `integer`. No floats anywhere in the money path.
- **Fills are all-or-nothing.** There is no simulated counterparty book, so `filled_quantity` is either `0` or `quantity`. Partial fills do not exist in this build.
- **No leverage.** MIS and CNC both require the full value of the trade. The CNC/MIS distinction is about settlement and square-off, not margin multiples.
- **The ledger is the record of `available_cash`.** Every row in `fund_ledger` corresponds to exactly one change in `funds.available_cash`, and `balance_after` is the value after that change. If a state change moves cash, it writes a ledger row.

---

## 2. Rounding

- Each charge component is computed at full `numeric` precision, then **rounded half-up to 2 decimal places**.
- **GST is computed on the *unrounded* sub-components and rounded once**, like every other component — `round(0.18 × (brokerage + exchange + SEBI + dp_base))`, not `0.18 ×` the already-rounded parts. Rounding once where the figure becomes money loses the least, and it keeps the rule above literally true for GST as for everything else (F06).
- `trades.charges` is the **sum of the already-rounded components**, never a rounding of the unrounded sum. This guarantees `charge_breakdown` always adds up to `charges` exactly, so reconciliation never fails by a paisa.
- Trade value is `quantity * price`, exact — both operands are exact in `numeric`, so no rounding is applied.
- Percentages are expressed as decimal rates in `constants.ts` (`0.0003`, not `0.03`).

---

## 3. Charge model

Charges are computed per executed order, on turnover = `quantity * price`.

| Component | CNC buy | CNC sell | MIS buy | MIS sell |
| --------- | ------- | -------- | ------- | -------- |
| Brokerage | ₹0 | ₹0 | `min(0.03% × turnover, ₹20)` | `min(0.03% × turnover, ₹20)` |
| STT | 0.1% | 0.1% | — | 0.025% |
| Exchange transaction (NSE) | 0.00307% | 0.00307% | 0.00307% | 0.00307% |
| SEBI turnover fee | 0.0001% | 0.0001% | 0.0001% | 0.0001% |
| Stamp duty | 0.015% | — | 0.003% | — |
| GST | 18% of (brokerage + exchange + SEBI + `dp_base`) | same | same | same |
| DP charge (`dp_base`) | — | ₹13.00 flat per scrip | — | — |

**Source: <https://zerodha.com/charges/>, confirmed 2026-08-21, re-confirmed 2026-08-22 at the start of Phase 4 with every rate unchanged.** Statutory components (STT, stamp
duty, the SEBI fee, exchange transaction charges, GST) are set by regulators and the exchange, not by
a broker, and change by circular — **re-check this table at the start of each phase that touches
money, and on any Union Budget**. The exchange transaction rate has already moved once (0.00297% →
0.00307%) during this project.

Rules:

- **Stamp duty is buy-side only.** **STT on MIS is sell-side only.** **DP charge applies only to a CNC sell** and is flat regardless of quantity.
- **`dp_base` is ₹13.00, not ₹15.34.** The familiar ₹15.34 is `dp_base` plus its own ₹2.34 of GST (₹3.50 CDSL + ₹9.50 broker = ₹13.00, ×1.18 = ₹15.34). Treating ₹15.34 as the base and adding GST again over-charges every CNC sell by ₹2.34 — an earlier draft of this table did exactly that. The pricing page displays ₹15.34 because that is the figure on a real contract note, footnoted with the split.
- **Zerodha's page prints GST as "18% on (brokerage + SEBI charges + transaction charges)" and does not name `dp_base` in it** — because it folds GST on DP into the ₹15.34 DP line instead (₹3.50 CDSL + ₹9.50 Zerodha + ₹2.34 GST). That is a presentation difference, not a rate difference, and the totals agree. Recorded here so a future re-check does not read it as drift and "correct" the GST base. (Re-verified 2026-08-22.)
- **GST covers `dp_base` too, and all of it lands in the single `gst` key.** There is no separate `dp_gst` key: `gst` means *all* GST on the trade, so its meaning never depends on whether a DP charge was involved. GST still never applies to STT or stamp duty.
- **DP is charged once per sell *order*. Zerodha charges once per scrip per *day*.** This is a deliberate simplification, not an oversight: matching reality would make `execute_order` query the user's same-day trades for that symbol inside the locked transaction, and give `reset_account` another case to reason about. It is disclosed in the simulation-simplifications list on `/legal` (build-plan feature 08).
- `trades.charge_breakdown` is a `jsonb` object with one key per component above, each a 2dp number. Absent components are `0`, not missing keys.
- Rates live in `src/lib/constants.ts` and in a Postgres equivalent; the TypeScript estimator and the SQL calculator are proven equal by a property test over random inputs (build-plan feature 22).

---

## 4. Order lifecycle

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

- `OPEN` is the only status from which any transition is legal. `execute_order`, `cancel_order` and `modify_order` all re-check it **after** taking the row lock and return without writing if it has changed.
- **A modify is not a transition.** `modify_order(order_id, quantity, limit_price)` changes the terms of an order that stays `OPEN`, so it retires nothing: it *re-reserves*, by releasing the existing reservation, writing the new terms, and calling `reserve_margin` again. Only `quantity` and `limit_price` are modifiable — every other field would be a different order with a different pre-flight. If the new terms cannot be covered the whole attempt is rolled back and the order keeps its original terms **and** its original reservation; the modify never leaves an order resting with less margin than its terms require.
- Every terminal transition retires the order's reservation **exactly once**, but not always the same way:
  - `REJECTED`, `CANCELLED`, and any `COMPLETE` that consumes cash (a buy, or a sell closing a long) → `release_margin(order_id)`, returning the whole reservation to `available_cash`.
  - A `COMPLETE` that **opens a short** → `transfer_margin_to_position(order_id)`. The obligation survives the fill, so the collateral must not become spendable.
- Both are idempotent: each returns immediately if `orders.blocked_margin` is already zero.
- Rejection reasons are stable codes: `INSUFFICIENT_FUNDS`, `NO_HOLDING`, `NO_QUOTE`, `MARKET_CLOSED`, `INVALID_QUANTITY`.

---

## 5. Fill pricing

The simulator only ever knows polled prices. It must never invent a price it did not observe.

- **MARKET:** fills at `quotes.ltp` at the moment of execution. If no quote row exists, or `fetched_at` is older than `QUOTE_STALE_AFTER_MS`, the order is `REJECTED` with `NO_QUOTE` — it is never filled at a stale price.
- **LIMIT BUY:** eligible when an observed `ltp <= limit_price`. Fills **at that observed `ltp`**, which is by definition at or better than the limit.
- **LIMIT SELL:** eligible when an observed `ltp >= limit_price`. Fills at that observed `ltp`.
- Filling at the observed crossing price rather than the limit gives realistic price improvement without fabricating it. **Never model improvement beyond an observed quote.**
- A market order placed outside the trading session is `REJECTED` with `MARKET_CLOSED`. A limit order may be placed outside the session and simply waits; it can only fill during a session, because only a session produces quotes.

---

## 6. Margin and collateral

No leverage: the requirement is the full value of the trade plus estimated charges. A **short** is the
one exception, and it is more conservative rather than less — it reserves the collateral it will have to
hold, so the reservation and the requirement at fill are the same figure.

| Order | Reserved at placement | Held after fill |
| ----- | --------------------- | --------------- |
| CNC buy | `quantity × price + est. charges` | nothing — cash is spent |
| MIS buy | `opening quantity × price + est. charges` — the quantity covering an open short is already collateralised | nothing — cash is spent |
| CNC sell | nothing; requires `holdings.quantity >= quantity` | — |
| MIS sell opening a short | `short_collateral(shorting excess, price) + est. charges` — the collateral formula below, evaluated at the reservation price | **moves to `positions.blocked_margin`** and is held until the short is covered |

- For a limit order, "price" in the reservation is `limit_price`. For a market order it is the current `ltp`.
- **A short reserves its collateral, not its notional**, because those are different numbers here. Collateral is 120% of notional plus closing charges, so reserving 100% would leave every short — not just a gap-up — short by roughly a fifth of the trade at fill. That would make the `MARGIN_RELEASE` in §7 a block, and would let a user place a maximum-size short that its own fill then rejects for want of funds. Reserving the collateral up front makes `delta` zero on a clean fill and leaves the gap-up as the genuine exception it is described as below.
- **A buy that covers a short reserves only the quantity that opens or adds to a long.** Buying 10 against an open short of 4 covers 4 and opens a long of 6; the 4 being covered are funded by the collateral already held against them, and reserving fresh cash for them would demand the money twice. Without this rule a user who shorted most of their balance **cannot close their own position** — the reservation for the covering buy asks for cash the collateral is already holding, and the order is rejected `INSUFFICIENT_FUNDS`. Estimated charges are still reserved in full.
- **A sell that crosses zero reserves only the shorting excess.** An MIS sell of 10 against an existing MIS long of 4 closes 4 and opens a short of 6; the closing 4 carry no obligation and need no collateral. The excess is `quantity − max(net_quantity, 0)`, and estimated charges are for the whole order. An MIS sell fully covered by a long reserves nothing, exactly like a CNC sell.
- **`positions.blocked_margin` is what makes the collateral model representable.** A filled short still has an obligation, so its collateral moves from the order to the position rather than being released. It is recomputed on every change to the position and fully released when the position reaches zero quantity, by user exit or auto square-off.
**One collateral formula, everywhere.** For any open short position:

```
positions.blocked_margin = |net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER)
                         + estimated_close_charges
```

`entry_reference_price` is the quantity-weighted average of the **gross** fill prices, no charges folded
in. It exists solely as the collateral basis and is a separate column from `average_price`, which is net
of charges and exists solely for P&L (§8). **Neither may ever appear in the other's calculation** — that
is an invariant, not a preference.

Using the net `average_price` here would under-collateralise. A short at ₹100 with ₹30 of entry charges
averages ₹99.70, and `100 × 99.70 × 1.20 = ₹11,964` fails to cover a genuine 20% move to ₹120, which
costs ₹12,000. The buffer is defined against a *price* move, so it must be applied to the price actually
observed.

`estimated_close_charges` is `calculate_charges` for a **buy** of that quantity at the buffered price.
Without that term the collateral falls short by exactly the closing charges even on a gross basis — the
buffer covers the price move and nothing else.

Recomputed on every change to the position — entry, add, partial cover, full cover. Making it an
equation rather than a policy means partial covers release exactly the right amount with no
proportional-release rounding drift, and identity 3 below stays checkable at any instant.

`SHORT_MARGIN_BUFFER` is **0.20**. The reason: NSE circuit limits cap a single-session move at 5/10/20%
depending on the band, and an MIS position cannot survive the session, so a 20% cushion covers the worst
same-day adverse move for a banded stock. See the residual risk at the end of this section.

- **`transfer_margin_to_position(order_id, fill_price, actual_charges)`** runs in one statement block, and runs **before** the caller writes the trade or the position. It returns `(ok, required_collateral, entry_reference_price)`; the caller writes those two figures into the `positions` row it then creates or updates. Passing the fill in rather than reading it back is what makes step 3's rejection cheap — at that point there is no trade row and no position row to unwind. It is also the only writer of the `entry_reference_price` *concept*, which is how §12.11 stops being a rule someone has to remember.
  1. Compute `required_collateral` from the formula above using the **post-fill** `entry_reference_price` — the gross quantity-weighted average including this fill. Never `average_price`: that is the P&L average and §12.11 forbids it here. `actual_charges` is per §3.
  2. `delta = (required_collateral + actual_charges) − (orders.blocked_margin + positions.blocked_margin)`. The position's own term is what makes this correct when the fill **adds** to an existing short: that collateral is already held, and subtracting only the order's reservation would block it a second time.
  3. If `delta > 0` the fill needs more than was reserved. When `available_cash < delta`, release the whole reservation and return `ok = false`; the caller sets `REJECTED` with `INSUFFICIENT_FUNDS` and writes nothing else. Otherwise write `MARGIN_BLOCK −delta`.
  4. If `delta < 0`, write `MARGIN_RELEASE +|delta|`.
  5. Zero `orders.blocked_margin`; `required_collateral` becomes `positions.blocked_margin`. **No ledger row** — no cash moved, and `used_margin` is unchanged by this step alone.
  6. Release the charge portion still held (`MARGIN_RELEASE +actual_charges`) and debit the real cost (`CHARGES −actual_charges`), so estimated charges are never paid twice. This is the step that takes the charges back out of `used_margin`; net cash across 5 and 6 is zero.

  Across the whole block, `available_cash` moves by exactly `−delta`, `used_margin` by `delta − actual_charges`, and their **sum** by `−actual_charges` — the charges are the only non-recoverable part, and everything else moved rather than vanished. That last figure is the assertion that catches a double-spend.

- **`recompute_position_collateral(user_id, symbol, new_net_quantity)`** is the release side of the same formula, called on any fill that *reduces* a short. It recomputes `required_collateral` over the quantity the position is **about to become** and returns the difference to `available_cash` with a `MARGIN_RELEASE` row — cash genuinely returns here, unlike on entry, which is why this one writes a row and step 5 does not.
  - **Called before the caller writes the new quantity**, because the two cases that matter cannot be expressed afterwards: a full cover deletes the row (§8), and a flip from short to long cannot carry collateral at all. Passing the target quantity covers partial cover, full cover and flip under one rule.
  - It refuses to *increase* collateral. An increase means a fill that adds to a short took the release path, and that fill carries a reservation only `transfer_margin_to_position` knows how to retire.

- **Step 3 is not hypothetical.** A short limit sell reserves against its `limit_price`, but §5 fills at the *observed* crossing price, which for a sell is at or **above** the limit. A short limit at ₹100 filling on a gap-up at ₹110 needs more collateral than it reserved — the only case in the system where a fill is better for the user and simultaneously demands more margin. A fill *at* the limit gives `delta = 0` up to the drift between estimated and actual charges, which is what reserving the collateral rather than the notional buys. A limit buy can never do this, because it fills at or below its limit.
- Reserving estimated charges and then debiting actual ones is why steps 5 and 6 are separate. Moving the *whole* reservation onto the position would hold the charge money as collateral **and** debit it, charging the user twice.

**A short's loss is capped at its collateral. This is a stated simulator rule, not an accident.**

A short's loss is unbounded while its collateral is bounded, so an adverse move beyond the buffer could
make covering cost more than collateral plus available cash. Refusing shorts on unbanded instruments is
not a usable answer: NSE removed hard price bands for F&O-segment stocks and essentially the whole
Nifty 200 sits in that segment, so such a rule would delete the feature rather than constrain it.

Instead, when a cover or square-off would drive `available_cash` below zero:

- **The position still closes.** Identity 7 holds and no position is ever stranded for want of funds.
- Cash debited is capped at what the account holds: `min(loss, blocked_margin + available_cash − closing_charges)`. `available_cash` floors at zero and `CHECK (available_cash >= 0)` is never relaxed.
- The uncovered remainder is written as a **`SIMULATION_ADJUSTMENT`** credit, so `available_cash = Σ ledger` still holds and the divergence is auditable rather than hidden.
- **`trades.realised_pnl` records the true, uncapped loss**, so Reports stay honest even though the cash effect was capped.

The cost: reported cash diverges from a real broker's in this case, because a real broker issues a margin
call and pursues the balance. That is out of scope for a simulator holding no real money, and it must be
disclosed on the Legal page alongside the other simplifications. A simulator that caps a loss and says so
is better than one that silently strands a position.
- The margin identity, which must hold at every instant:

```
funds.used_margin = Σ orders.blocked_margin   WHERE status = 'OPEN'
                  + Σ positions.blocked_margin
```

- Any transaction that changes one side changes the other in the same statement block. There is no code path that writes `used_margin` directly from a computed guess.

---

## 7. Cash and ledger effects

Exact rows written per event. Every row moves `available_cash`; `balance_after` is recorded on each.

`ledger_type` values: `SIGNUP_CREDIT`, `MARGIN_BLOCK`, `MARGIN_RELEASE`, `BUY_DEBIT`, `SELL_CREDIT`, `CHARGES`, `REALISED_PNL`, `SIMULATION_ADJUSTMENT`.

| Event | Ledger rows |
| ----- | ----------- |
| Signup / reset | `SIGNUP_CREDIT` `+100000.00` |
| Order placed (buy, or short sell) | `MARGIN_BLOCK` `−reservation` |
| Order cancelled or rejected | `MARGIN_RELEASE` `+reservation` |
| Order modified | `MARGIN_RELEASE` `+old reservation`, then `MARGIN_BLOCK` `−new reservation`. Two rows, not one netted row, because both are real movements of `available_cash` and the pair is what makes the re-reservation auditable — the same reasoning as the paired charge rows on a short entry. A modify that cannot be covered writes **nothing**: the attempt is rolled back whole |
| Buy fill (CNC or MIS long) | `MARGIN_RELEASE` `+reservation`, `BUY_DEBIT` `−trade_value`, `CHARGES` `−charges` |
| Sell fill closing a long | `SELL_CREDIT` `+trade_value`, `CHARGES` `−charges` |
| Short entry (MIS sell, no existing long) | Three rows, per §6 steps 4 and 6: `MARGIN_RELEASE` `+|delta|`, then `MARGIN_RELEASE` `+charges` and `CHARGES` `−charges`. Net `+(reservation − collateral − charges)`. The paired charge rows are not noise — they are what makes "estimated charges are never paid twice" auditable in the ledger instead of netted away inside the function. The collateral moves to `positions.blocked_margin` and writes **no ledger row**, because no cash moves. **No proceeds are credited** — a short's cash settles on cover, not on entry. |
| Short cover | `MARGIN_RELEASE` `+position.blocked_margin`, `CHARGES` `−charges`, `REALISED_PNL` `±(entry_reference_price − cover_price) × quantity` — the **gross** basis, see below |
| Short cover exceeding the account | the rows above with `REALISED_PNL` capped per §6, plus `SIMULATION_ADJUSTMENT` `+uncovered_remainder`. Cash floors at zero; `trades.realised_pnl` still carries the true loss |

Rationale for not crediting short proceeds on entry: crediting them and then re-blocking an equal margin produces two offsetting rows and a balance that momentarily looks spendable. Settling on cover keeps the ledger legible and the balance honest.

**The cover's cash row uses the gross `entry_reference_price`, while `trades.realised_pnl` uses the net
`average_price`. Those are different numbers on purpose.** The gross proceeds of a short are never
credited at entry, and the entry charges *are* debited at entry as their own `CHARGES` row. A cash row
computed from `average_price` — which already has those charges baked in — would therefore debit them a
second time, and `available_cash` would end a full round trip short by exactly the entry charges. Worked
through: a short of 100 at ₹100 with ₹6.42 of entry charges has `average_price` ₹99.94; covering at ₹90
credits `(100.00 − 90.00) × 100 = ₹1,000.00`, not `₹994.00`, and only the first lands on the balance the
trade actually produced. Identity 1 fails on every short cover otherwise.

**A ledger row means cash moved.** The collateral transfer on short entry deliberately writes none — `available_cash` is byte-identical before and after. Anything that writes a `MARGIN_RELEASE` for the *full* reservation on a short entry has made the collateral spendable while the obligation is still open, which is the exact defect this split exists to prevent.

---

## 8. Holdings vs positions

- **CNC buy** upserts `holdings`. New average is the weighted average of cost including charges:
  `new_avg = (old_qty × old_avg + trade_value + charges) / (old_qty + new_qty)`.
  Charges are capitalised into the average, matching how a broker reports cost basis.
- **CNC sell** reduces `holdings.quantity`. It never goes negative — a sell beyond the held quantity is `REJECTED` with `NO_HOLDING`. **CNC shorting does not exist.**
- **MIS** writes `positions` with `product = 'MIS'`. `net_quantity` is negative for a short.
- **Partial close** reduces the quantity, accumulates into `realised_pnl`, leaves `average_price` unchanged, and **does not reset `opened_at`**. For a short it also recomputes `blocked_margin` from the §6 formula against the remaining quantity and releases the difference — collateral is not held hostage until the position is fully covered.
- **A short position carries two averages, and crossing them is a bug:**
  - `average_price` — net of charges, **P&L only** (§9).
  - `entry_reference_price` — quantity-weighted average of gross fill prices, **collateral only** (§6).

  Both are recomputed on every fill that adds to the position, and neither ever appears in the other's
  calculation. A long needs only `average_price`; `entry_reference_price` is null for longs.

- **`average_price` capitalises charges in opposite directions for longs and shorts**, and using one formula for both is an arithmetic error, not a stylistic choice:

  ```
  long   new_avg = (old_qty × old_avg + trade_value + charges) / (old_qty + new_qty)
  short  new_avg = (old_qty × old_avg + trade_value − charges) / (old_qty + new_qty)
  ```

  A long's average is **cost per share**, so charges raise it. A short's average is **net proceeds per
  share**, so charges lower it. Applying the long formula to a short makes entry charges reappear as
  profit: short 100 @ ₹100 with ₹30 charges gives `avg = ₹100.30`, so covering flat at ₹100 reports
  `(100.30 − 100) × 100 = +₹30` — the charges, counted as a gain. The correct `₹99.70` reports `−₹30`.
  The error is exactly twice the entry charges, in the wrong direction, and it never looks wrong on screen.

- **Adding to an existing position** uses the formula matching its direction and leaves `opened_at` at the original entry.
- **A row that reaches zero quantity is deleted**, not left at zero, in both tables. Zero rows would otherwise pollute Holdings, Positions and the top-10 donut.

---

## 9. Realised P&L

- Realised P&L is recorded on the **closing leg only**, and is **net of the charges on that closing leg**:
  `realised_pnl = (exit_price − average_price) × quantity − closing_charges` for a long,
  and `(average_price − exit_price) × quantity − closing_charges` for a short.
- Opening-leg charges are already capitalised into `average_price`, so they must not be subtracted twice.
- `trades.realised_pnl` is `0.00` on every opening leg, never null.
- **This is the *reported* figure, not the cash movement.** For a short cover the two differ by the entry
  charges, which are already inside `average_price` here and were already debited in cash at entry — see
  §7. A single number cannot be both, and conflating them is how identity 1 breaks.
- **A fill that crosses zero** — a sell of 10 against a long of 4, or a buy of 10 against a short of 4 —
  is one order with a closing leg and an opening leg. Its charges are computed **once on the whole
  order** and written as **one** `CHARGES` ledger row; the split is derivational only. The closing
  share, `round(charges × closing_quantity / quantity, 2)`, reduces `trades.realised_pnl`; the
  **remainder** capitalises into the new position's `average_price`, so the two always sum to
  `trades.charges` exactly and §12.6 cannot fail by a paisa. §8 did not cover this case; rejecting it
  instead would make the shorting-excess reservation in §6 unreachable.
- Unrealised P&L is computed at read time from `quotes.ltp` and never stored.

**Day's P&L** is the portfolio's move since the previous close, over the holdings currently held:

```
day_pnl = Σ over holdings of  quantity × (ltp − prev_close)
```

- It is **not** unrealised P&L. Unrealised measures against `average_price` and answers "what has this
  position made since I opened it"; day's P&L measures against `prev_close` and answers "what has it
  done today". For a position held a month the two differ by the whole month.
- It uses the same basis as the watchlist's change column, so a symbol reporting +2% there cannot
  contribute a loss to the day's P&L tile beside it.
- **Null, never zero, when `prev_close` is absent.** A zero is a claim that the price is unchanged;
  the absence of a previous close is the absence of any claim at all.
- Shares bought today are measured against `prev_close` like everything else. A broker splits them
  out and measures the day's purchases against their buy price; this simulator does not, because the
  figure would then depend on `trades` and the difference is visible only on the day of purchase.
  Recorded as a deliberate divergence, alongside the DP simplification in §3.
- Like unrealised P&L, it is computed at read time and never stored.

---

## 10. Auto square-off

- At or after `SQUARE_OFF_TIME_IST` (15:20) on the same trading day, every open MIS position is exited at the current `ltp`.
- The resulting trade is flagged `trades.is_auto_squareoff = true`, so Reports can distinguish it from a user exit.
- Square-off releases `positions.blocked_margin` and deletes the row, exactly as a user exit does.
- **A square-off can always be priced.** A position exists only because a fill happened, and a fill requires a non-stale quote (§5) — so the symbol always has a `quotes` row, which means the simulator always has a seed. There is no unpriceable-position case to handle.
- **A square-off can always be afforded**, because the loss cap in §6 applies to it. The job never leaves a position open for want of funds.
- The square-off trade records the provenance of the price it used, so an exit priced by the simulator is visible as such in Reports rather than passing as a real close.
- The job is a no-op before 15:20 and safe to run simultaneously in two sessions.

---

## 11. Account reset

`reset_account()` runs in one transaction and restores **exactly** the post-signup state:

1. Delete all of the user's `orders`, `trades`, `holdings`, `positions`, and **all** `fund_ledger` rows.
2. Set `funds.available_cash = OPENING_BALANCE`, `used_margin = 0`, `opening_balance = OPENING_BALANCE`.
3. Insert a single `SIGNUP_CREDIT` ledger row.
4. Leave `profiles`, `watchlist_items`, `instruments` and `quotes` untouched.

There is **no `RESET` ledger type.** An earlier draft had reset append a `RESET` row while also claiming the account returns to its post-signup state; those cannot both be true. Wiping wins, because "returns to exactly the post-signup state" is a stated success criterion and is trivially checkable. The reset itself is not audit-relevant — this is a simulator, and git history is not the ledger's job.

---

## 12. Reconciliation identities

These are the equations the tests assert. Each must hold for every user at every instant.

1. `funds.available_cash = Σ fund_ledger.amount` for that user.
2. The newest `fund_ledger.balance_after` equals `funds.available_cash`.
3. `funds.used_margin = Σ orders.blocked_margin (status='OPEN') + Σ positions.blocked_margin`.
4. `funds.available_cash >= 0` — enforced by a `CHECK` constraint as the last line of defence.
5. `holdings.quantity > 0` for every existing row; no row exists at zero.
6. Every `trades.charge_breakdown`'s components sum exactly to `trades.charges`.
7. No `positions` row with `product = 'MIS'` survives the first `market-tick` run at or after 15:20 IST. The job runs once a minute, so the window between 15:20:00 and that run is expected and is not a violation.
8. Every `orders` row not in `OPEN` has `blocked_margin = 0`.
9. **Cash reconciliation.** For any closed position, the sum of **every** ledger row referencing its orders — `MARGIN_BLOCK`, `MARGIN_RELEASE`, `BUY_DEBIT`, `SELL_CREDIT`, `CHARGES`, `REALISED_PNL`, `SIMULATION_ADJUSTMENT` — equals the net change in `available_cash` across its lifetime. Every row is included; omitting `CHARGES`, the margin movements, or a capping adjustment makes this false.
10. **P&L correctness**, asserted separately from cash and per closing trade, never by summing ledger rows: `trades.realised_pnl` equals `(exit_price − average_price) × quantity − closing_charges` for a long and `(average_price − exit_price) × quantity − closing_charges` for a short. Opening charges are already inside `average_price` and must not appear again.

11. **The two averages never cross.** No collateral calculation reads `average_price`; **`trades.realised_pnl` never reads `entry_reference_price`**. The short cover's `REALISED_PNL` *ledger* row is the one deliberate exception and is not a P&L calculation — it is the cash settlement of proceeds that were never credited, and §7 explains why it must be the gross basis. Reported P&L and settled cash are different questions with different right answers.
12. **`positions.blocked_margin`** equals `|net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER) + estimated_close_charges` for every open short, and `0` for every long.

Identities 9 and 10 are deliberately separate. A long close settles through `SELL_CREDIT`, a short cover settles through `REALISED_PNL`, and one identity spanning both mechanisms cannot hold — which is why an earlier draft's combined version was wrong.

---

## 13. Keeping derived statements in sync

This document wins every money conflict, but nothing sweeps the losers automatically. Four separate
review rounds have found rules in other files still describing a model this one had already replaced.

**After any edit to this document, run the sweep and reconcile every hit** before considering the change
finished:

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

Every hit either agrees with this document or is wrong. There is no third category. The files that
restate money rules are `architecture.md` and `architecture/` (invariants, data model, flows),
`code-standards.md` and `code-standards/` (the Postgres-function boundary rules and grant list),
and the phase files under `build-plan/`
(features 22–32, i.e. `phase-4.md` and `phase-5.md`). The sweep passes the whole directory, so a
phase file added later is covered without editing this section.
