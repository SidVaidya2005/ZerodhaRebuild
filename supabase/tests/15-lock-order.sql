-- Feature 29: the order in which the money functions take row locks.
--
-- F29 shipped a position re-read that was correct in isolation and wrong in
-- company: it made `square_off_mis` hold the position row across its
-- `execute_order` call, inverting the pair against every other caller, and any
-- concurrent order on the same user and symbol then deadlocked. Nothing caught
-- it, because a lock order is not visible in any single function.
--
-- So this suite reads the acquisition sequence back out of each live definition
-- and pins it. The canonical order is the one `execute_order` establishes:
--
--     orders → funds → holdings → positions
--
-- Two helpers invert the last pair, and both are asserted here rather than
-- fixed. They are safe **only** because `execute_order` is their sole caller and
-- already holds both rows in canonical order before calling them — safety by
-- caller convention, which is exactly what failed in F29. Pinning them means a
-- second caller, or a reordering, has to come back through this file.
begin;
select plan(6);

-- The tables a function locks, in acquisition order.
--
-- **Per definition, not per call graph.** A function that calls another extends
-- its own sequence with the callee's, and this does not follow that edge — so
-- `square_off_mis` reads as {funds, positions} while the *composed* sequence is
-- funds, positions, orders, because `execute_order` locks the order row. The
-- last assertion below covers the exception that makes that safe.
--
-- Splitting on `for update` and taking the last `public.<table>` named in each
-- preceding fragment is what makes this reliable: the naive "does funds appear
-- before positions" reading is wrong for `square_off_mis`, whose unlocked sweep
-- names `positions` before it locks anything at all.
create function pg_temp.lock_sequence(p_fn regprocedure) returns text[]
language sql stable as $fn$
  with def as (select pg_get_functiondef(p_fn) as d),
  parts as (
    select part, ordinality
      from def, regexp_split_to_table(d, 'for\s+update') with ordinality as t(part, ordinality)
  ),
  n as (select max(ordinality) as last from parts)
  select array_agg(
           (regexp_match(part, '.*(?:from|update|join)\s+public\.(\w+)'))[1]
           order by ordinality
         )
    from parts, n
   where parts.ordinality < n.last;
$fn$;

select is(
  pg_temp.lock_sequence('public.execute_order(uuid)'),
  array['orders', 'funds', 'holdings', 'positions'],
  'execute_order defines the canonical lock order: orders, funds, holdings, positions'
);

-- The F29 regression, stated as itself. Before 20260905190000 this read
-- {positions} and the sweep deadlocked with any concurrent order on the same
-- position — the sweep losing, its 40P01 swallowed as a fault, and an MIS
-- position left open past 15:20.
select is(
  pg_temp.lock_sequence('public.square_off_mis(timestamptz)'),
  array['funds', 'positions'],
  'square_off_mis takes funds before the position it is about to exit'
);

select is(
  pg_temp.lock_sequence('public.reserve_margin(uuid)'),
  array['orders', 'funds'],
  'reserve_margin takes the order row before the funds row'
);

-- Characterising, not endorsing. Both of these take positions before funds,
-- against the canonical order above. Neither can deadlock today because
-- execute_order holds both rows before it calls them; a caller that does not is
-- what this assertion exists to stop.
select is(
  pg_temp.lock_sequence('public.transfer_margin_to_position(uuid,numeric,numeric)'),
  array['orders', 'positions', 'funds'],
  'transfer_margin_to_position still inverts positions/funds — callers must already hold the funds row'
);

select is(
  pg_temp.lock_sequence('public.recompute_position_collateral(uuid,text,integer,uuid)'),
  array['positions', 'funds'],
  'recompute_position_collateral still inverts positions/funds — callers must already hold the funds row'
);

-- The precondition behind `square_off_mis`'s remaining inversion.
--
-- Composed with `execute_order`, the sweep takes funds before the orders row,
-- against the canonical sequence. That is safe only because the order it locks
-- is one it inserted itself moments earlier, so no other transaction can hold or
-- want it. Squaring off through a pre-existing order row would make it a
-- contended lock taken out of order — so the property is pinned here rather than
-- left as a remark in a migration nobody re-reads.
with d as (
  select pg_get_functiondef('public.square_off_mis(timestamptz)'::regprocedure) as def
)
select ok(
  position('insert into public.orders' in def) > 0
    and position('public.execute_order(' in def) > 0
    and position('insert into public.orders' in def) < position('public.execute_order(' in def),
  'square_off_mis inserts its exit order before calling execute_order, so the order row it locks is its own'
) from d;

select * from finish();
rollback;
