-- Feature 18 — the watchlist sidebar's read shape and its four write paths.
--
-- What this migration deliberately does NOT do: add an index for search. The
-- universe is 200 rows, which Postgres seq-scans whatever index sits on it, so
-- the trigram index the build plan once called for would never be chosen. Search
-- filters a preloaded universe in the browser instead.

-- ── Renumber the existing rows ──────────────────────────────────────────────
--
-- F13's bootstrap and F16's backfill both inserted at the column default, so
-- every existing row carries sort_order = 0 and ordering falls through to the
-- symbol tiebreak. A swap between two rows that both hold 0 is a no-op, so the
-- reorder feature would appear to do nothing on exactly the rows every account
-- already has. Renumber densely, once, before anything can depend on it.
with ranked as (
  select user_id,
         symbol,
         row_number() over (partition by user_id order by sort_order, symbol) as rn
    from public.watchlist_items
)
update public.watchlist_items w
   set sort_order = ranked.rn
  from ranked
 where w.user_id = ranked.user_id
   and w.symbol = ranked.symbol
   and w.sort_order is distinct from ranked.rn;

-- ── watchlist_rows ──────────────────────────────────────────────────────────
--
-- The panel's whole read, in one round trip, with the arithmetic in Postgres.
-- CLAUDE.md's money rule leaves TypeScript formatting numbers and Postgres
-- calculating them, and the change here is exactly the kind of subtraction that
-- rule exists to keep out of a `.tsx`.
--
-- `security_invoker = on` is what makes this safe: without it the view runs as
-- its owner and RLS on watchlist_items would not apply, publishing every user's
-- list to every caller. RLS stays the security boundary.
--
-- prev_close is the column roll_previous_close() rolls at each session's first
-- tick, not the frozen bhavcopy seed. A null or zero prev_close yields a null
-- change rather than a fabricated zero or a division error — the row renders an
-- em dash, the same call the index strip makes.
create view public.watchlist_rows
with (security_invoker = on) as
  select w.symbol,
         w.sort_order,
         i.name,
         i.exchange,
         i.is_active,
         q.ltp,
         q.prev_close,
         case
           when q.ltp is null or q.prev_close is null then null
           else q.ltp - q.prev_close
         end as change,
         case
           when q.ltp is null or q.prev_close is null or q.prev_close = 0 then null
           else round((q.ltp - q.prev_close) / q.prev_close * 100, 2)
         end as change_pct,
         q.provider,
         q.provider_ts,
         q.fetched_at
    from public.watchlist_items w
    join public.instruments i on i.symbol = w.symbol
    left join public.quotes q on q.symbol = w.symbol
   where w.user_id = (select auth.uid());

comment on view public.watchlist_rows is
  'The watchlist panel read, one row per watched symbol, change computed in Postgres. security_invoker so RLS on watchlist_items applies.';

revoke all on public.watchlist_rows from anon, authenticated;
grant select on public.watchlist_rows to authenticated;

-- ── Write paths ─────────────────────────────────────────────────────────────
--
-- All three are invoker-rights, so RLS on watchlist_items is still what stops
-- one user writing into another's list — these functions add set-based SQL that
-- PostgREST cannot express, not privilege. code-standards.md still routes every
-- caller through a Server Action; these are what those actions call.
--
-- They exist as functions rather than read-then-write pairs because both the
-- sort_order assignment and the reorder swap race otherwise: two concurrent adds
-- would read the same max and collide.

create or replace function public.add_watchlist_item(p_symbol text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_added integer;
begin
  if v_uid is null then
    return 0;
  end if;

  -- Delisted names stay resolvable for history but must not be addable, which
  -- is why this checks is_active rather than leaning on the foreign key alone.
  insert into public.watchlist_items (user_id, symbol, sort_order)
  select v_uid,
         i.symbol,
         coalesce(
           (select max(w.sort_order) from public.watchlist_items w where w.user_id = v_uid),
           0
         ) + 1
    from public.instruments i
   where i.symbol = p_symbol
     and i.is_active
  on conflict (user_id, symbol) do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

create or replace function public.remove_watchlist_item(p_symbol text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_removed integer;
begin
  if v_uid is null then
    return 0;
  end if;

  delete from public.watchlist_items
   where user_id = v_uid
     and symbol = p_symbol;

  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

-- Move one row one place up or down, swapping sort_order with its neighbour.
--
-- Renumbers first, every time, rather than trusting the column: the one-shot
-- renumber above fixes today's rows, but nothing stops a future insert path
-- leaving duplicates, and a swap between two equal values silently does nothing.
-- Renumbering is cheap on a list this size and makes the swap total.
create or replace function public.move_watchlist_item(p_symbol text, p_direction text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_pos smallint;
  v_target smallint;
  v_other text;
begin
  if v_uid is null then
    return 0;
  end if;

  if p_direction not in ('up', 'down') then
    raise exception 'INVALID_DIRECTION' using errcode = '22023';
  end if;

  with ranked as (
    select symbol,
           row_number() over (order by sort_order, symbol) as rn
      from public.watchlist_items
     where user_id = v_uid
  )
  update public.watchlist_items w
     set sort_order = ranked.rn
    from ranked
   where w.user_id = v_uid
     and w.symbol = ranked.symbol
     and w.sort_order is distinct from ranked.rn;

  select sort_order into v_pos
    from public.watchlist_items
   where user_id = v_uid
     and symbol = p_symbol;

  if v_pos is null then
    return 0;
  end if;

  v_target := case when p_direction = 'up' then v_pos - 1 else v_pos + 1 end;

  select symbol into v_other
    from public.watchlist_items
   where user_id = v_uid
     and sort_order = v_target;

  -- Already at the end it was asked to move toward. Not an error: the button is
  -- disabled there, and a client that asks anyway should get a no-op.
  if v_other is null then
    return 0;
  end if;

  update public.watchlist_items
     set sort_order = v_pos
   where user_id = v_uid
     and symbol = v_other;

  update public.watchlist_items
     set sort_order = v_target
   where user_id = v_uid
     and symbol = p_symbol;

  return 1;
end;
$$;

revoke execute on function public.add_watchlist_item(text) from public, anon;
revoke execute on function public.remove_watchlist_item(text) from public, anon;
revoke execute on function public.move_watchlist_item(text, text) from public, anon;
grant execute on function public.add_watchlist_item(text) to authenticated;
grant execute on function public.remove_watchlist_item(text) to authenticated;
grant execute on function public.move_watchlist_item(text, text) to authenticated;

-- ── touch_symbol_demand ─────────────────────────────────────────────────────
--
-- The write path F10 said would arrive here, and one of exactly two Server
-- Action exceptions code-standards.md allows: it is called on every watchlist
-- render, takes no user-supplied state beyond a symbol list, and writes nothing
-- a user owns.
--
-- `security definer` because symbol_demand has no client write grant by design —
-- it is a reference table, and granting authenticated a direct UPDATE would let
-- any browser rewrite priority and starve the tick of the symbols that must
-- refresh whether or not anyone is looking. This function is the narrow hole:
-- last_requested_at only, never priority, and only for symbols that exist.
create or replace function public.touch_symbol_demand(p_symbols text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touched integer;
begin
  -- Definer rights mean the session check has to be explicit; without it this
  -- would happily accept anon.
  if (select auth.uid()) is null then
    return 0;
  end if;

  if p_symbols is null or cardinality(p_symbols) = 0 then
    return 0;
  end if;

  -- Bounded so a crafted call cannot touch every row repeatedly. The cap is
  -- above the whole universe, so it never truncates a legitimate request.
  if cardinality(p_symbols) > 200 then
    raise exception 'TOO_MANY_SYMBOLS' using errcode = '22023';
  end if;

  -- The join against instruments is what makes an unknown symbol a no-op rather
  -- than a foreign key error, and priority is absent from both the column list
  -- and the DO UPDATE, so it can only ever be set by a migration.
  insert into public.symbol_demand (symbol, last_requested_at)
  select i.symbol, now()
    from public.instruments i
   where i.symbol = any (p_symbols)
  on conflict (symbol) do update
    set last_requested_at = excluded.last_requested_at;

  get diagnostics v_touched = row_count;
  return v_touched;
end;
$$;

revoke execute on function public.touch_symbol_demand(text[]) from public, anon;
grant execute on function public.touch_symbol_demand(text[]) to authenticated;

comment on function public.touch_symbol_demand(text[]) is
  'Marks symbols as on-screen. Definer rights, session required, last_requested_at only — never priority.';
