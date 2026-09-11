-- F34's reads: the completed-trade statement, the symbols it can filter by, and
-- the money totals over a filtered set.
--
-- **`traded_on` is the whole point of the view.** `traded_at` is a timestamptz,
-- and every filter a user expresses is an IST calendar day. Computing the
-- conversion here — once, in SQL — means no caller ever does timezone
-- arithmetic: the page passes two `date`s and Postgres decides which trades fall
-- inside them. F33 lost a session to the mirror image of this, where Lightweight
-- Charts treated every instant as UTC and drew an NSE session at 03:45; a dated
-- page is exactly where that class of bug recurs, and a 23:45 IST trade filed on
-- the previous day is invisible on screen rather than obviously wrong.
--
-- **`value` is computed here, not in TypeScript.** `CLAUDE.md`'s money rule:
-- Postgres calculates, TypeScript formats.
create or replace view public.trade_history
with (security_invoker = on) as
  select t.id,
         t.user_id,
         t.order_id,
         t.traded_at,
         (t.traded_at at time zone 'Asia/Kolkata')::date as traded_on,
         t.symbol,
         i.name,
         i.exchange,
         t.side,
         t.product,
         o.order_type,
         t.quantity,
         t.price,
         (t.quantity * t.price)::numeric(14, 2) as value,
         t.charges,
         t.charge_breakdown,
         -- §9: 0.00 on every opening leg, never null, so a filtered sum over
         -- this column is meaningful without excluding anything.
         t.realised_pnl,
         t.is_auto_squareoff
    from public.trades t
    join public.orders o on o.id = t.order_id
    join public.instruments i on i.symbol = t.symbol;

comment on view public.trade_history is
  'One row per completed trade, joined to its order and instrument. traded_on is the IST calendar day, computed here so no caller does timezone arithmetic. Scoped by RLS on trades through security_invoker.';

-- The filter's vocabulary: what this user has actually traded. A free-text
-- symbol box can produce an empty page that reads as an empty account; a list
-- drawn from the data cannot.
create or replace view public.traded_symbols
with (security_invoker = on) as
  select distinct t.user_id, t.symbol, i.name
    from public.trades t
    join public.instruments i on i.symbol = t.symbol;

comment on view public.traded_symbols is
  'Distinct symbols this user has traded, for the Reports filter. Scoped by RLS on trades through security_invoker.';

-- The totals for a filtered set.
--
-- **The page only ever renders one page of the set these totals span**, so
-- summing the rows on screen would report the page's realised P&L under a label
-- claiming the range's. Summing in TypeScript is separately forbidden by
-- `CLAUDE.md`'s money rule.
--
-- Invoker rights (the default) rather than `security definer`: RLS on `trades`
-- is then the boundary, reached the same way `trade_history` reaches it. A
-- definer function here would need a hand-written `user_id` predicate, which is
-- the application-code-doing-RLS's-job pattern F18 removed from `watchlist_rows`.
--
-- Null bounds mean unbounded, so the unfiltered case is the same code path as
-- the filtered one rather than a second query.
create or replace function public.reports_summary(
  p_from date default null,
  p_to date default null,
  p_symbol text default null
)
returns table (
  trade_count bigint,
  realised_pnl numeric,
  charges_total numeric,
  buy_value numeric,
  sell_value numeric
)
language sql
stable
set search_path = public
as $$
  select count(*)::bigint,
         coalesce(sum(h.realised_pnl), 0)::numeric(14, 2),
         coalesce(sum(h.charges), 0)::numeric(14, 2),
         coalesce(sum(h.value) filter (where h.side = 'BUY'), 0)::numeric(14, 2),
         coalesce(sum(h.value) filter (where h.side = 'SELL'), 0)::numeric(14, 2)
    from public.trade_history h
   where (p_from is null or h.traded_on >= p_from)
     and (p_to is null or h.traded_on <= p_to)
     and (p_symbol is null or h.symbol = p_symbol);
$$;

comment on function public.reports_summary(date, date, text) is
  'Money totals over a filtered trade set for the calling user. Bounds are inclusive IST calendar days; null means unbounded. Invoker rights, so RLS on trades scopes it.';

-- The publishable key ships in the browser bundle, so `anon` gets nothing (F10).
-- Both roles are named on the revoke because Supabase grants them directly and
-- `revoke ... from public` would leave those grants standing (F13).
revoke all on public.trade_history from anon, authenticated;
grant select on public.trade_history to authenticated;

revoke all on public.traded_symbols from anon, authenticated;
grant select on public.traded_symbols to authenticated;

revoke execute on function public.reports_summary(date, date, text) from public, anon, authenticated;
grant execute on function public.reports_summary(date, date, text) to authenticated;
