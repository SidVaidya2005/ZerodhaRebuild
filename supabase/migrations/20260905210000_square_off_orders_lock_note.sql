-- Records the one part of `square_off_mis`'s lock order that 20260905200000 missed.
--
-- Comment only; no function body changes.
--
-- 20260905190000 made the sweep take `funds` before `positions`, which is what
-- stopped it deadlocking with a concurrent order. But it takes `funds` before
-- the **orders** row too, because the order row is only locked further down,
-- inside the `execute_order` call it makes. Against the canonical sequence
-- `orders → funds → holdings → positions` that is an inversion, and the reason
-- it is nonetheless safe was written down nowhere:
--
--   the exit order is INSERTed by this same transaction a few statements
--   earlier, so no other transaction can be holding that row or waiting for it.
--   `match_open_orders` selects OPEN LIMIT orders and this is a MARKET order
--   that `execute_order` completes before the transaction ends.
--
-- That is a real precondition, not an observation: it holds only while the sweep
-- locks an order it created itself. A version that squared off through an
-- existing order row would be taking a contended lock out of sequence.
-- `15-lock-order.sql` asserts the insert precedes the call, so that precondition
-- fails a test rather than being rediscovered.

comment on function public.square_off_mis(timestamptz) is
  'Exits every open MIS position at the last traded price at or after 15:20 IST, per trading-contract.md §10. A no-op before then and on a holiday, so it is safe to run every minute. Performs no settlement of its own: it writes a MARKET exit order and calls execute_order, which releases the collateral, writes the ledger and applies §6''s loss cap. Flags the resulting trade is_auto_squareoff. LOCK ORDER: takes the user''s funds row before the position row, matching execute_order, so a concurrent order on the same position queues instead of deadlocking. It also takes funds before the orders row — an inversion of the canonical sequence that is safe only because the order row it locks is one this transaction inserted moments earlier, so nothing else can hold or want it; squaring off through a pre-existing order row would break that. A stale quote rejects the exit with NO_QUOTE and the next run retries it. Internal-only — the market-tick Edge Function calls it as the service role.';
