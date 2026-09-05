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
select plan(5);

-- The tables a function locks, in acquisition order.
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
  pg_temp.lock_sequence('public.recompute_position_collateral(uuid,text,integer)'),
  array['positions', 'funds'],
  'recompute_position_collateral still inverts positions/funds — callers must already hold the funds row'
);

select * from finish();
rollback;
