-- Records the lock hierarchy on the functions that depend on it.
--
-- Comments only: no function body changes, so nothing on the money path moves.
--
-- The canonical order is the one `execute_order` establishes and every caller
-- reaching it must respect:
--
--     orders → funds → holdings → positions
--
-- `square_off_mis` violated it between 20260905180000 and 20260905190000 by
-- holding a position row across its `execute_order` call, and deadlocked with
-- any concurrent order on the same user and symbol. That was invisible in the
-- function itself — a lock order is a property of a *set* of functions — so the
-- two helpers that still invert the last pair say so in their own comments,
-- where the next person to call them will actually read it.
--
-- `supabase/tests/15-lock-order.sql` pins all of this by reading the sequence
-- back out of each live definition.

comment on function public.execute_order(uuid) is
  'The only place an order fills, per CLAUDE.md. One locked statement block: price per trading-contract.md §5, charges per §3, retire the reservation through F23, settle the closing and opening legs, write the trade, holding or position, ledger and status. Safe to call on any OPEN order — it re-checks the status under the lock and re-checks limit eligibility, so a limit order that is not crossing simply returns. Establishes the lock hierarchy the rest of the schema follows: orders, then funds, then holdings or positions. Any function that takes those rows and may run concurrently with this one takes them in that order. Internal-only.';

comment on function public.transfer_margin_to_position(uuid, numeric, numeric) is
  'Converts a short-opening fill''s reservation into position collateral per trading-contract.md §6. Call it BEFORE writing the trade and position rows: on a shortfall it releases the whole reservation and returns ok = false, so there is nothing to unwind and the caller only has to set REJECTED/INSUFFICIENT_FUNDS. Returns the required_collateral and entry_reference_price the caller must write onto the positions row. The collateral move itself writes no ledger row, because no cash moves. LOCK ORDER: takes the position row before the funds row, which inverts execute_order''s hierarchy. That is safe only because execute_order already holds both rows before calling this, so a caller that does not hold this user''s funds row first reintroduces the deadlock 20260905190000 removed. Internal-only.';

comment on function public.recompute_position_collateral(uuid, text, integer) is
  'Recomputes an open short''s collateral against the quantity it is about to become and returns the difference to available_cash with a MARGIN_RELEASE row, per trading-contract.md §6 and §7. Call it BEFORE writing the new quantity: a full cover deletes the row and a flip to long cannot carry collateral, so neither case can be expressed afterwards. Returns the amount released. Refuses to increase collateral — that is transfer_margin_to_position''s job. LOCK ORDER: takes the position row before the funds row, which inverts execute_order''s hierarchy. That is safe only because execute_order already holds both rows before calling this, so a caller that does not hold this user''s funds row first reintroduces the deadlock 20260905190000 removed. Internal-only.';
