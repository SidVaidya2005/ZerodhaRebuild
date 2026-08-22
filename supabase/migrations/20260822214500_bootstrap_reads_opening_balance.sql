-- `handle_new_user` reads `opening_balance()` instead of holding a literal.
--
-- F13 held 100000.00 as a local constant, which was fine while exactly one
-- function needed it. `reset_account` needs the identical figure — §11's
-- criterion is that a reset returns the account to *exactly* the post-signup
-- state, and two literals that must agree is how that quietly stops being true.
--
-- Nothing else about the function changes. `02-bootstrap.sql`'s 30 assertions
-- are what prove that.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The ten large caps a new account starts watching. Intersected against
  -- `instruments` below rather than inserted directly: feature 14 seeds that
  -- table and runs AFTER this feature, so a plain insert would violate
  -- watchlist_items' foreign key today.
  v_default_watchlist constant text[] := array[
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
    'SBIN', 'BHARTIARTL', 'ITC', 'LT', 'KOTAKBANK'
  ];
  -- trading-contract.md §11, read from public.opening_balance() rather than
  -- held as a literal. F24 needed the identical figure in reset_account, and
  -- §11's criterion is that a reset returns the account to *exactly* the
  -- post-signup state — which two literals that have to agree cannot guarantee.
  v_opening_balance constant numeric(14, 2) := public.opening_balance();
  v_client_id text;
  v_attempts int := 0;
begin
  -- Bounded retry, never a loop without an exit. Ten collisions against a
  -- million-key space means something is wrong with generation itself, and
  -- raising is better than spinning or silently admitting a broken account.
  loop
    v_attempts := v_attempts + 1;
    v_client_id := public.generate_client_id();

    begin
      insert into public.profiles (id, client_id, full_name, avatar_url)
      values (
        new.id,
        v_client_id,
        -- Google spells these two ways depending on the scope granted; both are
        -- tolerated absent, because profiles.full_name is nullable.
        coalesce(
          new.raw_user_meta_data ->> 'full_name',
          new.raw_user_meta_data ->> 'name'
        ),
        coalesce(
          new.raw_user_meta_data ->> 'avatar_url',
          new.raw_user_meta_data ->> 'picture'
        )
      )
      on conflict (id) do nothing;

      exit;
    exception
      -- Only a client_id collision is retried. Any other unique violation is a
      -- real fault and propagates.
      when unique_violation then
        if v_attempts >= 10 then
          raise exception 'CLIENT_ID_EXHAUSTED'
            using errcode = 'P0001',
                  detail = format('10 client id collisions for user %s', new.id);
        end if;
    end;
  end loop;

  insert into public.funds (user_id, available_cash, used_margin, opening_balance)
  values (new.id, v_opening_balance, 0, v_opening_balance)
  on conflict (user_id) do nothing;

  -- §12.1 and §12.2 must hold from the first moment: available_cash is the sum
  -- of the ledger, and the newest balance_after equals it.
  insert into public.fund_ledger (user_id, type, amount, balance_after, note)
  values (new.id, 'SIGNUP_CREDIT', v_opening_balance, v_opening_balance, 'Opening simulated balance');

  -- Seeds what exists and skips what does not. `with ordinality` preserves the
  -- list order as sort_order, so the watchlist is not in whatever order the
  -- planner returns.
  insert into public.watchlist_items (user_id, symbol, sort_order)
  select new.id, i.symbol, (w.ord - 1)::smallint
  from unnest(v_default_watchlist) with ordinality as w (symbol, ord)
  join public.instruments i on i.symbol = w.symbol
  on conflict (user_id, symbol) do nothing;

  return new;
end;
$$;