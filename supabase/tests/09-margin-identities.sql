-- Feature 23: the §12 reconciliation identities under churn.
--
-- Section 08 asserts hand-computed figures on deliberately chosen cases. This
-- one asserts the identities that must hold *whatever* happened, after 500
-- randomised reserve / fill / cover / cancel operations across two accounts and
-- two symbols. The two suites catch different things: an arithmetic slip shows
-- up in 08, while a path that forgets to move one side of §12.3 — a release with
-- no ledger row, a cover that credits cash twice — only shows up here.
--
-- The seed is pinned rather than random. A property suite that draws a fresh
-- seed each run reports a failure nobody can reproduce.
begin;
select plan(9);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true),
  ('INFY',     'Infosys Limited',             'INFY.NS',     true)
  on conflict (symbol) do update set is_active = excluded.is_active;

-- Both accounts stand at the bootstrap's 100000.00 with their SIGNUP_CREDIT row.
-- Nothing below writes `funds` or `fund_ledger` directly — that is the whole
-- point, since identity 1 is only meaningful if every rupee moved through a
-- function that ledgered it.

do $$
declare
  v_users uuid[] := array['11111111-1111-1111-1111-111111111111'::uuid,
                          '22222222-2222-2222-2222-222222222222'::uuid];
  v_symbols text[] := array['RELIANCE', 'INFY'];
  v_user uuid;
  v_symbol text;
  v_action integer;
  v_quantity integer;
  v_price numeric(14, 2);
  v_fill numeric(14, 2);
  v_charges numeric;
  v_order_id uuid;
  v_reserved boolean;
  v_position public.positions%rowtype;
  v_transfer record;
  v_cover integer;
  v_new_quantity integer;
begin
  perform setseed(0.2306);

  for i in 1..500 loop
    v_user := v_users[1 + floor(random() * 2)::integer];
    v_symbol := v_symbols[1 + floor(random() * 2)::integer];
    v_action := 1 + floor(random() * 3)::integer;
    v_quantity := 1 + floor(random() * 10)::integer;
    v_price := round((50 + random() * 100)::numeric, 2);

    if v_action = 3 then
      -- Cover some or all of an existing short. The collateral is recomputed
      -- against the quantity the position is ABOUT to become, then the caller
      -- writes it — which is the ordering F24 has to follow, so the test follows
      -- it too rather than inventing an easier one.
      select * into v_position
        from public.positions
       where user_id = v_user and symbol = v_symbol and product = 'MIS' and net_quantity < 0;

      if found then
        v_cover := 1 + floor(random() * abs(v_position.net_quantity))::integer;
        v_new_quantity := v_position.net_quantity + v_cover;

        -- The cover is an order like any other, and the release is stamped with
        -- it: without an order id on that row §12.9 cannot be evaluated for a
        -- short cover at all. (Phase 4 checkpoint)
        insert into public.orders
          (user_id, symbol, side, order_type, product, quantity, limit_price, status,
           filled_quantity, average_price)
        values (v_user, v_symbol, 'BUY', 'LIMIT', 'MIS', v_cover, v_price, 'COMPLETE',
                v_cover, v_price)
        returning id into v_order_id;

        perform public.recompute_position_collateral(v_user, v_symbol, v_new_quantity, v_order_id);

        if v_new_quantity = 0 then
          delete from public.positions
           where user_id = v_user and symbol = v_symbol and product = 'MIS';
        else
          update public.positions set net_quantity = v_new_quantity
           where user_id = v_user and symbol = v_symbol and product = 'MIS';
        end if;
      end if;

    elsif v_action = 1 then
      -- A delivery buy: reserve, then either cancel it or let it consume the
      -- cash. Both retire the reservation through release_margin.
      insert into public.orders
        (user_id, symbol, side, order_type, product, quantity, limit_price)
      values (v_user, v_symbol, 'BUY', 'LIMIT', 'CNC', v_quantity, v_price)
      returning id into v_order_id;

      v_reserved := public.reserve_margin(v_order_id);

      if not v_reserved then
        update public.orders
           set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS'
         where id = v_order_id;
      else
        perform public.release_margin(v_order_id);

        if random() < 0.5 then
          update public.orders set status = 'CANCELLED' where id = v_order_id;
        else
          update public.orders
             set status = 'COMPLETE', filled_quantity = v_quantity, average_price = v_price
           where id = v_order_id;
        end if;
      end if;

    else
      -- An intraday sell that opens or adds to a short, filling away from its
      -- limit so both the top-up and the excess-release branches of §6 step 3
      -- get exercised. §5 fills a limit sell at or above the limit; the range
      -- below straddles it deliberately, because a fill below the limit is what
      -- produces a negative delta.
      insert into public.orders
        (user_id, symbol, side, order_type, product, quantity, limit_price)
      values (v_user, v_symbol, 'SELL', 'LIMIT', 'MIS', v_quantity, v_price)
      returning id into v_order_id;

      v_reserved := public.reserve_margin(v_order_id);

      if not v_reserved then
        update public.orders
           set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS'
         where id = v_order_id;
      else
        v_fill := round((v_price * (0.95 + random() * 0.20))::numeric, 2);
        select total into v_charges
          from public.calculate_charges('SELL', 'MIS', v_quantity, v_fill);

        select * into v_transfer
          from public.transfer_margin_to_position(v_order_id, v_fill, v_charges);

        if not v_transfer.ok then
          update public.orders
             set status = 'REJECTED', rejection_reason = 'INSUFFICIENT_FUNDS'
           where id = v_order_id;
        else
          insert into public.positions
            (user_id, symbol, product, net_quantity, average_price,
             entry_reference_price, blocked_margin)
          values (v_user, v_symbol, 'MIS', -v_quantity, v_fill,
                  v_transfer.entry_reference_price, v_transfer.required_collateral)
          on conflict (user_id, symbol, product) do update
            set net_quantity = public.positions.net_quantity - v_quantity,
                entry_reference_price = excluded.entry_reference_price,
                blocked_margin = excluded.blocked_margin;

          update public.orders
             set status = 'COMPLETE', filled_quantity = v_quantity, average_price = v_fill
           where id = v_order_id;
        end if;
      end if;
    end if;
  end loop;
end;
$$;

-- The suite is worthless if the loop quietly did nothing, so the churn itself is
-- asserted before the identities are.
select cmp_ok(
  (select count(*) from public.orders)::integer, '>', 300,
  'the sequence actually placed orders'
);

select cmp_ok(
  (select count(*) from public.orders where status = 'COMPLETE')::integer, '>', 100,
  'and filled a substantial number of them'
);

select cmp_ok(
  (select count(*) from public.fund_ledger where type = 'MARGIN_RELEASE')::integer, '>', 100,
  'and released margin along the way'
);

-- Identity 1: available_cash is the sum of the ledger, for every user.
select is_empty(
  $$ select f.user_id from public.funds f
      where f.available_cash <> (
        select coalesce(sum(l.amount), 0) from public.fund_ledger l where l.user_id = f.user_id) $$,
  'identity 1: available_cash equals the sum of that user''s ledger rows'
);

-- Identity 2: the newest row's balance_after is the balance. This is why
-- fund_ledger.created_at is clock_timestamp() and not now() — a short entry
-- writes three rows inside one transaction, and now() would tie all three.
select is_empty(
  $$ select f.user_id from public.funds f
      where f.available_cash <> (
        select l.balance_after from public.fund_ledger l
         where l.user_id = f.user_id order by l.created_at desc, l.id desc limit 1) $$,
  'identity 2: the newest ledger row''s balance_after equals available_cash'
);

-- Identity 3, the one this feature exists to keep true.
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
  $$ select id from public.orders where status <> 'OPEN' and blocked_margin <> 0 $$,
  'identity 8: no order outside OPEN holds margin'
);

-- Identity 12: every open short holds exactly the §6 formula, and every long
-- holds nothing.
select is_empty(
  $$ select user_id, symbol from public.positions
      where blocked_margin <> case
        when net_quantity < 0
          then public.short_collateral_requirement(net_quantity, entry_reference_price)
        else 0 end $$,
  'identity 12: positions.blocked_margin is the §6 formula for every short and zero for every long'
);

select finish();
rollback;
