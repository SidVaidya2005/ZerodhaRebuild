-- Account bootstrap: everything a new user needs, inside the signup transaction.
--
-- Four writes, all or nothing — profile, funds, the SIGNUP_CREDIT ledger row that
-- accounts for that cash, and a default watchlist. A user admitted without a
-- `funds` row would break every money function from feature 22 onward, so a
-- failure here fails the signup rather than producing a half-made account.
--
-- What this migration deliberately does NOT do: backfill existing users. A
-- trigger on auth.users fires only on insert, and the one pre-existing row was
-- created while verifying feature 12. It is deleted and re-created by signing in
-- again, which keeps signup as the only path that ever creates an account.

-- ── Client ID generation ────────────────────────────────────────────────────

-- Split out from handle_new_user() on purpose: the only way to prove the retry
-- bound is to make generation collide every time, and a pgTAP transaction can
-- `create or replace` this one function and roll back. Inlining the expression
-- would make that claim untestable.
--
-- ZR + six digits is a one-million-key space against a unique index, so
-- collisions are rare but not negligible — hence the bounded retry in the caller.
create or replace function public.generate_client_id()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'ZR' || lpad((floor(random() * 1000000))::int::text, 6, '0');
$$;

comment on function public.generate_client_id() is
  'ZR + six digits. Replaceable in a test transaction, which is how the retry bound in handle_new_user is proven.';

revoke execute on function public.generate_client_id() from public;

-- ── The bootstrap ───────────────────────────────────────────────────────────

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
  -- trading-contract.md §11. A literal, because this function runs in Postgres
  -- and cannot import src/lib/constants.ts. Both sides are pinned to the
  -- contract's figure by their own test rather than to each other.
  v_opening_balance constant numeric(14, 2) := 100000.00;
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

comment on function public.handle_new_user() is
  'Signup bootstrap: profile + client id, funds at the opening balance, the SIGNUP_CREDIT ledger row, and a default watchlist. Runs inside the signup transaction.';

-- security definer bypasses RLS, so a callable copy of this would be a hole.
-- Nothing but the trigger ever invokes it.
revoke execute on function public.handle_new_user() from public;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
