-- F32's single read: the Funds cards, and the counts its reset dialog names.
--
-- One view rather than seven round trips. The cards need three columns off
-- `funds` plus a sum over `trades`, and the confirmation dialog has to say
-- exactly what reset is about to destroy — which is a count per table. Doing
-- that from the client would be one aggregate request and five head-count
-- requests, and would put a money sum outside Postgres, which `CLAUDE.md`'s
-- money rule forbids.
--
-- **Realised P&L only.** §9's realised figure is the closing legs net of their
-- closing charges; unrealised is a different question with a different answer
-- and it already has two homes. Keeping it out is what lets the Funds page read
-- no quotes at all, so nothing on it needs provenance.
--
-- **The `where user_id = f.user_id` clauses below are correlation, not
-- security.** Each subquery has to be tied to the outer row or it would
-- aggregate across the whole table. RLS through `security_invoker` is still the
-- only thing scoping this view to its caller, and the falsification in
-- `17-funds-overview.sql` is what proves that rather than assuming it — the
-- distinction F18 drew after finding `watchlist_rows` isolated by a hand-written
-- predicate while `security_invoker` sat untested and droppable.
create or replace view public.funds_overview
with (security_invoker = on) as
  select f.user_id,
         f.available_cash,
         f.used_margin,
         f.opening_balance,
         -- §9: realised P&L is recorded on the closing leg and is 0.00 on every
         -- opening leg, never null — so this sums the whole table without a
         -- filter and an account that has only ever opened positions correctly
         -- reports zero.
         coalesce(
           (select sum(t.realised_pnl) from public.trades t where t.user_id = f.user_id),
           0
         )::numeric(14, 2) as realised_pnl,
         -- The five counts §11 deletes, so the dialog states them rather than
         -- describing the damage in the abstract.
         (select count(*) from public.orders o where o.user_id = f.user_id) as order_count,
         (select count(*) from public.trades t where t.user_id = f.user_id) as trade_count,
         (select count(*) from public.holdings h where h.user_id = f.user_id) as holding_count,
         (select count(*) from public.positions p where p.user_id = f.user_id) as position_count,
         (select count(*) from public.fund_ledger l where l.user_id = f.user_id) as ledger_count
    from public.funds f;

comment on view public.funds_overview is
  'The Funds cards and the counts its reset dialog names, in one row per user. realised_pnl is §9''s closing-leg figure only — Funds reads no quotes, so nothing on it carries provenance. Scoped by RLS on funds through security_invoker; the correlated predicates are subquery correlation, not a security boundary.';

revoke all on public.funds_overview from anon, authenticated;
grant select on public.funds_overview to authenticated;
