-- F31's two reads. Both aggregations, so both in Postgres.
--
-- F21 built `portfolio_holdings` and `portfolio_summary` and no positions
-- equivalent, which is why F30 needed no migration and this one does. The shape
-- deliberately mirrors that pair: one row-grain view, one summary driven from
-- `funds`, neither carrying a predicate of its own — RLS on `positions` through
-- `security_invoker` is the boundary, per F18's correction to `watchlist_rows`.

-- ---------------------------------------------------------------------------
-- One row per open position, priced.
-- ---------------------------------------------------------------------------
--
-- `left join quotes`, not `join`: a position with no quote row must still
-- appear. Dropping it would silently shrink the page, and the honest answer is a
-- row that reports a null valuation which the page then discloses as unpriced.
--
-- **`entry_reference_price` is deliberately absent.** trading-contract.md §12.11
-- makes it collateral-only and `average_price` the P&L figure, and neither may
-- appear in the other's calculation. Leaving it out of the view means no
-- component can cross them by accident — structural rather than a rule someone
-- has to remember. `blocked_margin` below is the collateral figure the page
-- renders, and it is a stored result of that formula, not an input to it.
create or replace view public.portfolio_positions
with (security_invoker = on) as
  select p.user_id,
         p.symbol,
         i.name,
         i.exchange,
         p.product,
         p.net_quantity,
         p.average_price,
         p.realised_pnl,
         -- Collateral against an open short; zero for a long. Rendered because
         -- a short blocks real cash and, until F32 ships, no other screen says
         -- why the balance moved.
         p.blocked_margin,
         p.opened_at,
         q.ltp,
         q.prev_close,
         -- Unrealised, computed at read time and never stored (§9).
         --
         -- **One signed expression covers both directions.** `net_quantity` is
         -- negative for a short, so a short of 100 at ₹99.70 against an LTP of
         -- ₹90 gives −100 × −9.70 = +970 — which is exactly §9's
         -- (average_price − exit_price) × quantity for a short, and
         -- (exit_price − average_price) × quantity for a long. A `case` on
         -- direction would be two formulas free to drift apart.
         --
         -- Charges are excluded here exactly as they are in
         -- `portfolio_holdings`: §9 nets the closing charges into *realised*
         -- P&L, on the closing leg only.
         case
           when q.ltp is null then null
           else (p.net_quantity * (q.ltp - p.average_price))::numeric(14, 2)
         end as unrealised_pnl,
         q.provider,
         q.provider_ts,
         q.fetched_at
    from public.positions p
    join public.instruments i on i.symbol = p.symbol
    left join public.quotes q on q.symbol = p.symbol;

comment on view public.portfolio_positions is
  'One row per intraday position with its live valuation, all arithmetic in Postgres. Excludes entry_reference_price so §12.11''s two averages cannot be crossed on screen. Scoped by RLS on positions through security_invoker — the view holds no predicate of its own.';

revoke all on public.portfolio_positions from anon, authenticated;
grant select on public.portfolio_positions to authenticated;

-- ---------------------------------------------------------------------------
-- The positions footer, as one row.
-- ---------------------------------------------------------------------------
--
-- Driven from `funds` rather than `positions` for the same reason
-- `portfolio_summary` is: an account holding no positions still produces a row,
-- so the page can tell an empty portfolio from a failed read. A positions-first
-- aggregate returns nothing at all and the two look identical.
create or replace view public.portfolio_positions_summary
with (security_invoker = on) as
  select f.user_id,
         coalesce(sum(p.unrealised_pnl), 0)::numeric(14, 2) as unrealised_pnl,
         coalesce(sum(p.realised_pnl), 0)::numeric(14, 2) as realised_pnl,
         coalesce(sum(p.blocked_margin), 0)::numeric(14, 2) as blocked_margin,
         -- count(col) ignores nulls, which matters: a user with no positions
         -- still produces one left-joined row of nulls, and count(*) would
         -- report that phantom as a position and as an unpriced one.
         count(p.symbol) as position_count,
         count(p.symbol) filter (where p.ltp is null) as unpriced_count
    from public.funds f
    left join public.portfolio_positions p on p.user_id = f.user_id
   group by f.user_id;

comment on view public.portfolio_positions_summary is
  'The positions footer as one row per user. The unrealised sum skips unpriced positions, so unpriced_count is what stops that omission being silent.';

revoke all on public.portfolio_positions_summary from anon, authenticated;
grant select on public.portfolio_positions_summary to authenticated;
