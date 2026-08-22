-- Feature 24: the §12 identities under churn, and the grants.
--
-- `10-orders.sql` asserts hand-computed figures on chosen cases. This one asserts
-- what must hold *whatever* happened, after 500 randomised orders across two
-- accounts, two symbols, both products, both sides and both order types, with the
-- price moving between every one of them.
--
-- The two catch different things. An arithmetic slip shows up in 10; a path that
-- forgets one side of §12.3, or leaves a cancelled order holding margin, only
-- shows up here. The seed is pinned — a property suite that draws a fresh seed
-- each run reports failures nobody can reproduce.
begin;
select plan(13);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true),
  ('INFY',     'Infosys Limited',             'INFY.NS',     true)
  on conflict (symbol) do update set is_active = excluded.is_active;

insert into public.quotes (symbol, ltp, prev_close, provider, fetched_at) values
  ('RELIANCE', 100.00, 100.00, 'SIMULATOR', now()),
  ('INFY',      80.00,  80.00, 'SIMULATOR', now())
  on conflict (symbol) do update
    set ltp = excluded.ltp, fetched_at = excluded.fetched_at, provider_ts = null;

-- Deterministic session, for the reason `10-orders.sql` gives: a suite whose
-- result depends on the hour it runs is worse than no suite. Tier 4 proves the
-- real `market_state`.
create or replace function public.market_state(p_at timestamptz default now())
returns public.market_session_state language sql stable
as $$ select 'OPEN'::public.market_session_state $$;

do $$
declare
  v_users uuid[] := array['11111111-1111-1111-1111-111111111111'::uuid,
                          '22222222-2222-2222-2222-222222222222'::uuid];
  v_symbols text[] := array['RELIANCE', 'INFY'];
  v_user uuid;
  v_symbol text;
  v_side public.order_side;
  v_product public.product_type;
  v_type public.order_type;
  v_quantity integer;
  v_ltp numeric(14, 2);
  v_limit numeric(14, 2);
  v_result record;
  v_open uuid;
begin
  perform setseed(0.2408);

  for i in 1..500 loop
    v_user := v_users[1 + floor(random() * 2)::integer];
    v_symbol := v_symbols[1 + floor(random() * 2)::integer];
    v_side := (array['BUY', 'SELL'])[1 + floor(random() * 2)::integer]::public.order_side;
    v_product := (array['CNC', 'MIS'])[1 + floor(random() * 2)::integer]::public.product_type;
    v_type := (array['MARKET', 'LIMIT'])[1 + floor(random() * 2)::integer]::public.order_type;
    v_quantity := 1 + floor(random() * 10)::integer;

    -- The price walks, so limit orders land on both sides of it and fills happen
    -- away from where the reservation was taken.
    update public.quotes
       set ltp = round(greatest(10.00, ltp * (0.94 + random() * 0.12))::numeric, 2),
           fetched_at = now()
     where symbol = v_symbol
    returning ltp into v_ltp;

    if v_type = 'LIMIT' then
      v_limit := round((v_ltp * (0.97 + random() * 0.06))::numeric, 2);
    else
      v_limit := null;
    end if;

    perform set_config('request.jwt.claim.sub', v_user::text, true);
    select * into v_result
      from public.place_order(v_symbol, v_side, v_type, v_product, v_quantity, v_limit);

    -- Cancel roughly a third of whatever is still resting, so orders leave OPEN
    -- by every route §4 allows rather than only by filling.
    if random() < 0.33 then
      select id into v_open
        from public.orders
       where user_id = v_user and status = 'OPEN'
       order by placed_at limit 1;

      if v_open is not null then
        perform set_config('request.jwt.claim.sub', v_user::text, true);
        perform public.cancel_order(v_open);
      end if;
    end if;
  end loop;
end;
$$;

-- The identities are worthless if the loop quietly did nothing, so the churn is
-- asserted first — and asserted per outcome, because a run that only ever
-- rejected would satisfy every identity trivially.
select cmp_ok((select count(*) from public.orders)::integer, '>', 400,
  'the sequence placed orders');
select cmp_ok((select count(*) from public.orders where status = 'COMPLETE')::integer, '>', 100,
  'and filled a substantial number');
select cmp_ok((select count(*) from public.orders where status = 'CANCELLED')::integer, '>', 20,
  'and cancelled some');
select cmp_ok((select count(*) from public.orders where status = 'REJECTED')::integer, '>', 0,
  'and rejected some');
select cmp_ok((select count(*) from public.trades)::integer, '>', 100,
  'writing a trade for every fill');

select is_empty(
  $$ select f.user_id from public.funds f
      where f.available_cash <> (
        select coalesce(sum(l.amount), 0) from public.fund_ledger l where l.user_id = f.user_id) $$,
  'identity 1: available_cash equals the sum of that user''s ledger rows'
);

select is_empty(
  $$ select f.user_id from public.funds f
      where f.available_cash <> (
        select l.balance_after from public.fund_ledger l
         where l.user_id = f.user_id order by l.created_at desc, l.id desc limit 1) $$,
  'identity 2: the newest ledger row''s balance_after equals available_cash'
);

select is_empty(
  $$ select f.user_id from public.funds f
      where f.used_margin <> (
        select coalesce(sum(o.blocked_margin), 0) from public.orders o
         where o.user_id = f.user_id and o.status = 'OPEN')
        + (select coalesce(sum(p.blocked_margin), 0) from public.positions p
            where p.user_id = f.user_id) $$,
  'identity 3: used_margin equals open orders'' margin plus positions'' collateral'
);

select is_empty(
  $$ select user_id from public.funds where available_cash < 0 $$,
  'identity 4: available_cash never went negative'
);

select is_empty(
  $$ select user_id, symbol from public.holdings where quantity <= 0 $$,
  'identity 5: no holding survives at or below zero quantity'
);

select is_empty(
  $$ select id from public.orders where status <> 'OPEN' and blocked_margin <> 0 $$,
  'identity 8: no order outside OPEN holds margin'
);

select is_empty(
  $$ select user_id, symbol from public.positions
      where blocked_margin <> case
        when net_quantity < 0
          then public.short_collateral_requirement(net_quantity, entry_reference_price)
        else 0 end $$,
  'identity 12: positions.blocked_margin is the §6 formula for every short and zero for every long'
);

-- ── Grants ──────────────────────────────────────────────────────────────────
--
-- `security definer` bypasses RLS, so an over-granted helper is a hole rather
-- than a convenience: an authenticated user could invoke it against another
-- user's order id. The three that ARE granted each read auth.uid() instead of
-- taking a user id, which is what makes them safe to expose.
select is(
  (select array_agg(p.proname::text order by p.proname::text)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('place_order', 'cancel_order', 'reset_account', 'execute_order',
                        'post_ledger', 'market_state', 'market_constants', 'opening_balance')
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))),
  array['cancel_order', 'place_order', 'reset_account']::text[],
  'exactly three of the eight are reachable from a browser, and they are the three that read auth.uid()'
);

select finish();
rollback;
