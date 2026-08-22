-- F21's three reads, all of them aggregations and therefore all of them in Postgres.
--
-- CLAUDE.md puts every balance, average and total in Postgres and leaves
-- TypeScript formatting it. The dashboard is the first page whose entire job is
-- money, so the arithmetic lives here and the page renders what it is given.
--
-- **No view carries a predicate of its own.** RLS through `security_invoker` is
-- the boundary — the correction F18 made to `watchlist_rows` after discovering a
-- hand-written `where user_id = auth.uid()` was doing the work the policy was
-- credited with, leaving `security_invoker` untested and droppable.

-- ---------------------------------------------------------------------------
-- One row per holding, priced.
-- ---------------------------------------------------------------------------
--
-- `left join quotes`, not `join`: a held symbol with no quote row must still
-- appear. Dropping it would silently shrink the portfolio, and the honest
-- answer is a holding that reports a null market value which the page then
-- discloses as unpriced.
create or replace view public.portfolio_holdings
with (security_invoker = on) as
  select h.user_id,
         h.symbol,
         i.name,
         i.exchange,
         h.quantity,
         h.average_price,
         q.ltp,
         q.prev_close,
         -- Charges are already capitalised into average_price by
         -- trading-contract.md §8, so cost basis is this product and nothing
         -- else. Adding charges again here would double-count every buy.
         (h.quantity * h.average_price)::numeric(14, 2) as invested,
         case
           when q.ltp is null then null
           else (h.quantity * q.ltp)::numeric(14, 2)
         end as market_value,
         -- Unrealised, computed at read time and never stored (§9).
         case
           when q.ltp is null then null
           else (h.quantity * (q.ltp - h.average_price))::numeric(14, 2)
         end as unrealised_pnl,
         -- Day's P&L per §9: the move since yesterday's close, which is the
         -- same basis as the watchlist's change column. Null rather than zero
         -- when there is no previous close — a zero would claim "unchanged".
         case
           when q.ltp is null or q.prev_close is null then null
           else (h.quantity * (q.ltp - q.prev_close))::numeric(14, 2)
         end as day_pnl,
         q.provider,
         q.provider_ts,
         q.fetched_at
    from public.holdings h
    join public.instruments i on i.symbol = h.symbol
    left join public.quotes q on q.symbol = h.symbol;

comment on view public.portfolio_holdings is
  'One row per holding with its cost basis and live valuation, all arithmetic in Postgres. Scoped by RLS on holdings through security_invoker — the view holds no predicate of its own.';

revoke all on public.portfolio_holdings from anon, authenticated;
grant select on public.portfolio_holdings to authenticated;

-- ---------------------------------------------------------------------------
-- The five summary tiles, as one row.
-- ---------------------------------------------------------------------------
--
-- Driven from `funds` rather than `holdings` so an account that has never
-- traded still produces a row: it has cash, and cash is a tile. A holdings-first
-- aggregate would return nothing at all and the page could not tell an empty
-- portfolio from a failed query.
create or replace view public.portfolio_summary
with (security_invoker = on) as
  select f.user_id,
         f.available_cash,
         coalesce(sum(p.invested), 0)::numeric(14, 2) as invested,
         coalesce(sum(p.market_value), 0)::numeric(14, 2) as market_value,
         (f.available_cash + coalesce(sum(p.market_value), 0))::numeric(14, 2) as portfolio_value,
         coalesce(sum(p.unrealised_pnl), 0)::numeric(14, 2) as overall_pnl,
         coalesce(sum(p.day_pnl), 0)::numeric(14, 2) as day_pnl,
         -- count(col) ignores nulls, which matters: a user with no holdings
         -- still produces one left-joined row of nulls, and count(*) would
         -- report that phantom as a holding and as an unpriced one.
         count(p.symbol) as holding_count,
         count(p.symbol) filter (where p.ltp is null) as unpriced_count
    from public.funds f
    left join public.portfolio_holdings p on p.user_id = f.user_id
   group by f.user_id, f.available_cash;

comment on view public.portfolio_summary is
  'The dashboard summary tiles as one row per user. The sums skip unpriced holdings, so unpriced_count is what stops that omission being silent.';

revoke all on public.portfolio_summary from anon, authenticated;
grant select on public.portfolio_summary to authenticated;

-- ---------------------------------------------------------------------------
-- The index strip: a breadth statistic over our own universe.
-- ---------------------------------------------------------------------------
--
-- **This is not an index and must never be labelled as one.** NIFTY 50 and BANK
-- NIFTY have no row, no quote and no simulator anchor anywhere in this project,
-- and SENSEX is BSE against an NSE-only scope; F17 shipped the strip empty for
-- exactly that reason. What we can honestly compute is the equal-weighted mean
-- of per-symbol day change across the symbols we actually have prices for —
-- hence `constituents` and `universe_size`, both of which the strip renders, so
-- "10 of 200 priced" can never be read as the Nifty 200.
--
-- Provenance is deliberately reported as raw inputs rather than a source: a
-- source computed here would freeze at write time, and the invariant is that
-- freshness is derived against the current clock at read time. The oldest
-- timestamp paired with every distinct provider is the pessimistic reading, and
-- pessimism is the only safe direction for a claim about data quality.
create or replace view public.market_composite
with (security_invoker = on) as
  select count(*) as constituents,
         (select count(*) from public.instruments where is_active) as universe_size,
         round(avg((q.ltp - q.prev_close) / q.prev_close * 100), 2) as change_pct,
         count(*) filter (where q.ltp > q.prev_close) as advances,
         count(*) filter (where q.ltp < q.prev_close) as declines,
         count(*) filter (where q.ltp = q.prev_close) as unchanged,
         min(q.provider_ts) as oldest_provider_ts,
         min(q.fetched_at) as oldest_fetched_at,
         array_agg(distinct q.provider) as providers
    from public.quotes q
    join public.instruments i on i.symbol = q.symbol and i.is_active
   where q.ltp is not null
     and q.prev_close is not null
     and q.prev_close <> 0;

comment on view public.market_composite is
  'Equal-weighted mean day change across every priced active instrument, with advances/declines and the raw provenance inputs. A breadth statistic over our own universe — never an index, and never to be labelled NIFTY or SENSEX.';

revoke all on public.market_composite from anon, authenticated;
grant select on public.market_composite to authenticated;
