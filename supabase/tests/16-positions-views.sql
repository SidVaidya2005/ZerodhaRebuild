-- Feature 31's two views: the intraday book and its footer.
--
-- Every figure is hand-computed in the fixture comments rather than restated as
-- the expression the view uses. A test that recomputes the implementation proves
-- only that the implementation is itself — the trap the Phase 1 checkpoint
-- caught in the charge suite.
--
-- **What is deliberately not here: the exit path.** F31 adds no mutation of its
-- own — Exit opens the ticket and the close goes through `place_order`, which
-- `10-orders.sql` already proves for a long close (§9, net of the closing leg's
-- charges), a short cover (reported from the NET average while cash settles from
-- the GROSS one) and deletion at zero quantity (§12.5). Restating those here
-- would be a second copy of a passing assertion, not extra coverage.
--
-- The isolation assertions are paired with a falsification: `security_invoker`
-- is switched off and the same query must start leaking, per F18.
begin;
select plan(16);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Written as the connecting role, which owns these tables and bypasses RLS.

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited',       'RELIANCE.NS', true),
  ('INFY',     'Infosys Limited',                   'INFY.NS',     true),
  ('TCS',      'Tata Consultancy Services Limited', 'TCS.NS',      true),
  ('NOQUOTE',  'Never Quoted Limited',              'NOQUOTE.NS',  true)
  on conflict (symbol) do update set is_active = excluded.is_active;

insert into public.quotes (symbol, ltp, prev_close, provider) values
  ('RELIANCE', 100.00,  80.00, 'SIMULATOR'),
  ('INFY',      50.00,  50.00, 'SIMULATOR'),
  ('TCS',       90.00, 100.00, 'SIMULATOR')
  on conflict (symbol) do update
    set ltp = excluded.ltp,
        prev_close = excluded.prev_close,
        provider = excluded.provider,
        provider_ts = null;

-- The left join is what must produce NOQUOTE's nulls, so it must genuinely have
-- no quote row. Deleted inside the transaction and restored by the rollback.
delete from public.quotes where symbol = 'NOQUOTE';

-- Ada's four positions, chosen so every branch of the signed P&L expression is
-- exercised and so a long and a short disagree about the same price move.
--
--   RELIANCE  long   10 @  90.00   ltp 100.00
--     unrealised  10 × (100.00 − 90.00)   = +100.00   collateral     0.00
--   INFY      short −20 @  45.00   ltp  50.00   (price ROSE against the short)
--     unrealised −20 × ( 50.00 − 45.00)   = −100.00   collateral  1200.00
--   TCS       short −100 @ 99.70   ltp  90.00   (price FELL — §6's worked short)
--     unrealised −100 × (90.00 − 99.70)   = +970.00   collateral 12240.00
--   NOQUOTE   short  −5 @  30.00   unpriced
--     unrealised                             null     collateral   200.00
--
-- entry_reference_price is set on every short and null on the long, because
-- `positions_reference_price_iff_short` makes that structural (§12.11).
insert into public.positions
  (user_id, symbol, product, net_quantity, average_price, entry_reference_price,
   realised_pnl, blocked_margin)
values
  ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 'MIS',   10,  90.00,   null,   0.00,     0.00),
  ('11111111-1111-1111-1111-111111111111', 'INFY',     'MIS',  -20,  45.00,  45.00,  25.50,  1200.00),
  ('11111111-1111-1111-1111-111111111111', 'TCS',      'MIS', -100,  99.70, 100.00,  -5.25, 12240.00),
  ('11111111-1111-1111-1111-111111111111', 'NOQUOTE',  'MIS',   -5,  30.00,  30.00,   0.00,   200.00);

-- ── Ada: per-position valuation ─────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select results_eq(
  $$ select symbol, net_quantity, unrealised_pnl, blocked_margin
       from public.portfolio_positions order by symbol $$,
  $$ values ('INFY',     -20,  -100.00::numeric,  1200.00::numeric),
            ('NOQUOTE',   -5,             null,    200.00::numeric),
            ('RELIANCE',  10,   100.00::numeric,      0.00::numeric),
            ('TCS',     -100,   970.00::numeric, 12240.00::numeric) $$,
  'each position values against its own quote, and an unpriced one reports null rather than zero'
);

select is(
  (select unrealised_pnl from public.portfolio_positions where symbol = 'TCS'),
  970.00::numeric,
  '§9: a short profits when the price falls — one signed expression, no branch on direction'
);

select is(
  (select unrealised_pnl from public.portfolio_positions where symbol = 'INFY'),
  -100.00::numeric,
  'and the same expression turns a rise into a loss, which is what makes it a short'
);

select is(
  (select unrealised_pnl from public.portfolio_positions where symbol = 'RELIANCE'),
  100.00::numeric,
  'while a long moves with the price, from that identical expression'
);

select is(
  (select unrealised_pnl from public.portfolio_positions where symbol = 'NOQUOTE'),
  null::numeric,
  'an unpriced position is not valued at zero — no price is the absence of a claim'
);

select is(
  (select blocked_margin from public.portfolio_positions where symbol = 'RELIANCE'),
  0.00::numeric,
  '§12.12: a long holds no collateral'
);

-- §12.11 made structural rather than remembered: the basis that produced
-- `blocked_margin` is not exposed at all, so no caller can cross the two
-- averages by reading it off this view.
select is_empty(
  $$ select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'portfolio_positions'
        and column_name = 'entry_reference_price' $$,
  '§12.11: the view does not expose entry_reference_price, so it cannot reach a P&L calculation'
);

-- ── Ada: the footer ─────────────────────────────────────────────────────────
--
--   unrealised  +100.00 − 100.00 + 970.00  =   970.00   (NOQUOTE excluded)
--   realised       0.00 +  25.50 −   5.25  =    20.25
--   collateral     0.00 + 1200.00 + 12240.00 + 200.00 = 13640.00

select results_eq(
  $$ select unrealised_pnl, realised_pnl, blocked_margin, position_count, unpriced_count
       from public.portfolio_positions_summary $$,
  $$ values (970.00::numeric, 20.25::numeric, 13640.00::numeric, 4::bigint, 1::bigint) $$,
  'the footer totals the rows, skipping the position it could not value'
);

select is(
  (select unpriced_count from public.portfolio_positions_summary),
  1::bigint,
  'and says so, rather than understating the book in silence'
);

select is(
  (select blocked_margin from public.portfolio_positions_summary),
  13640.00::numeric,
  'collateral sums across shorts and is unaffected by price'
);

-- ── Bob: a never-traded account ─────────────────────────────────────────────

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select results_eq(
  $$ select unrealised_pnl, realised_pnl, blocked_margin, position_count, unpriced_count
       from public.portfolio_positions_summary $$,
  $$ values (0.00::numeric, 0.00::numeric, 0.00::numeric, 0::bigint, 0::bigint) $$,
  'an account holding no positions still produces a footer row, driven from funds rather than positions'
);

select is(
  (select position_count from public.portfolio_positions_summary),
  0::bigint,
  'the left-joined row of nulls is not miscounted as a position'
);

select is(
  (select unpriced_count from public.portfolio_positions_summary),
  0::bigint,
  'nor as an unpriced one — count(col) ignoring nulls is what makes the empty case honest'
);

-- ── Isolation, and the falsification that gives it meaning ──────────────────

select is_empty(
  $$ select 1 from public.portfolio_positions
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'one user cannot read another''s positions through the view'
);

reset role;
alter view public.portfolio_positions set (security_invoker = off);
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select isnt_empty(
  $$ select 1 from public.portfolio_positions
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'with security_invoker off the view leaks, which is what proves the setting is load-bearing'
);

reset role;
alter view public.portfolio_positions set (security_invoker = on);
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is_empty(
  $$ select 1 from public.portfolio_positions
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'and switching it back restores the caller-only view'
);

select * from finish();
rollback;
