-- Feature 21's three views: the dashboard aggregation and the index-strip composite.
--
-- Every figure here is hand-computed in the fixture comments rather than
-- restated as the expression the view uses. A test that recomputes the
-- implementation proves only that the implementation is itself, which is the
-- trap the Phase 1 checkpoint caught in the charge suite.
--
-- The isolation assertions are paired with a **falsification**: security_invoker
-- is switched off and the same query must start leaking. F18 found that
-- watchlist_rows was isolated by a hand-written predicate while security_invoker
-- sat untested and droppable, and only flipping it proved which mechanism was
-- doing the work.
begin;
select plan(30);

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Written as the connecting role, which owns these tables and bypasses RLS.

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

insert into public.instruments (symbol, name, yahoo_symbol, is_active) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS', true),
  ('INFY',     'Infosys Limited',             'INFY.NS',     true),
  ('NOQUOTE',  'Never Quoted Limited',        'NOQUOTE.NS',  true)
  on conflict (symbol) do update set is_active = excluded.is_active;

-- The composite averages over every priced active instrument, so the live
-- table's own rows would make it non-deterministic. Cleared inside the
-- transaction, restored by the rollback.
delete from public.quotes where symbol not in ('RELIANCE', 'INFY');

insert into public.quotes (symbol, ltp, prev_close, provider) values
  ('RELIANCE', 100.00, 80.00, 'SIMULATOR'),
  ('INFY',      50.00, 50.00, 'SIMULATOR')
  on conflict (symbol) do update
    set ltp = excluded.ltp,
        prev_close = excluded.prev_close,
        provider = excluded.provider,
        provider_ts = null;

-- Ada's three holdings. NOQUOTE deliberately has no quote row, so the left join
-- is what produces its nulls and the summary has something to disclose.
--
--   RELIANCE  10 @ 90.00  ltp 100.00  prev_close 80.00
--     invested 900.00   market value 1000.00   unrealised +100.00   day +200.00
--   INFY      20 @ 45.00  ltp  50.00  prev_close 50.00
--     invested 900.00   market value 1000.00   unrealised +100.00   day    0.00
--   NOQUOTE    5 @ 30.00  unpriced
--     invested 150.00   market value    null   unrealised    null   day   null
insert into public.holdings (user_id, symbol, quantity, average_price) values
  ('11111111-1111-1111-1111-111111111111', 'RELIANCE', 10, 90.00),
  ('11111111-1111-1111-1111-111111111111', 'INFY',     20, 45.00),
  ('11111111-1111-1111-1111-111111111111', 'NOQUOTE',   5, 30.00);

-- The bootstrap already opened both accounts at 100000.00; pinned here so the
-- portfolio_value arithmetic below is stated rather than inherited.
update public.funds set available_cash = 100000.00
 where user_id in (
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222'
 );

-- ── Ada: per-holding valuation ──────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select results_eq(
  $$ select symbol, invested, market_value, unrealised_pnl, day_pnl
       from public.portfolio_holdings order by symbol $$,
  $$ values ('INFY',      900.00::numeric, 1000.00::numeric,  100.00::numeric,    0.00::numeric),
            ('NOQUOTE',   150.00::numeric,             null,             null,            null),
            ('RELIANCE',  900.00::numeric, 1000.00::numeric,  100.00::numeric,  200.00::numeric) $$,
  'each holding values against its own quote, and an unpriced one reports nulls rather than zeroes'
);

select is(
  (select day_pnl from public.portfolio_holdings where symbol = 'INFY'),
  0.00::numeric,
  'a holding that has not moved today reports a day P&L of zero, which is a real claim'
);

select is(
  (select day_pnl from public.portfolio_holdings where symbol = 'NOQUOTE'),
  null,
  'a holding with no quote reports null day P&L, never zero — zero would claim "unchanged"'
);

select is(
  (select invested from public.portfolio_holdings where symbol = 'NOQUOTE'),
  150.00::numeric,
  'cost basis is known even when the price is not, so an unpriced holding still reports invested'
);

-- ── Ada: the summary tiles ──────────────────────────────────────────────────
--
--   invested        900 + 900 + 150 = 1950.00
--   market value   1000 + 1000      = 2000.00   (NOQUOTE contributes nothing)
--   portfolio      100000 + 2000    = 102000.00
--   overall P&L     100 + 100       = 200.00
--   day P&L         200 + 0         = 200.00

select results_eq(
  $$ select invested, market_value, portfolio_value, overall_pnl, day_pnl,
            holding_count, unpriced_count
       from public.portfolio_summary $$,
  $$ values (1950.00::numeric, 2000.00::numeric, 102000.00::numeric,
             200.00::numeric, 200.00::numeric, 3::bigint, 1::bigint) $$,
  'the five tiles match the hand-computed figures, with cash inside portfolio value'
);

select is(
  (select unpriced_count from public.portfolio_summary),
  1::bigint,
  'the one unpriced holding is counted, so its omission from the totals is never silent'
);

select is(
  (select portfolio_value - market_value from public.portfolio_summary),
  100000.00::numeric,
  'portfolio value is stock plus cash — the cash half is not lost'
);

select is(
  (select overall_pnl from public.portfolio_summary),
  (select market_value - 1800.00 from public.portfolio_summary),
  'overall P&L is market value less the invested of the priced holdings only'
);

select is(
  (select count(*) from public.portfolio_summary),
  1::bigint,
  'the summary is exactly one row per user'
);

-- ── Bob: an account that has never traded ───────────────────────────────────

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is_empty(
  $$ select 1 from public.portfolio_holdings $$,
  'a user with no holdings sees no holding rows'
);

select results_eq(
  $$ select invested, market_value, portfolio_value, overall_pnl, day_pnl,
            holding_count, unpriced_count
       from public.portfolio_summary $$,
  $$ values (0.00::numeric, 0.00::numeric, 100000.00::numeric,
             0.00::numeric, 0.00::numeric, 0::bigint, 0::bigint) $$,
  'a never-traded account still produces a summary row, driven from funds rather than holdings'
);

select is(
  (select holding_count from public.portfolio_summary),
  0::bigint,
  'the left-joined row of nulls is not miscounted as a holding'
);

select is(
  (select unpriced_count from public.portfolio_summary),
  0::bigint,
  'nor as an unpriced one — count(col) ignoring nulls is what makes the empty case honest'
);

-- ── Isolation, and the falsification that gives it meaning ──────────────────

select is_empty(
  $$ select 1 from public.portfolio_holdings
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'one user cannot read another''s holdings through the view'
);

select is(
  (select portfolio_value from public.portfolio_summary),
  100000.00::numeric,
  'nor another user''s totals — the summary reports only the caller''s own funds'
);

reset role;
alter view public.portfolio_holdings set (security_invoker = off);
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select isnt_empty(
  $$ select 1 from public.portfolio_holdings
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'with security_invoker off the holdings view leaks, which is what proves the setting is load-bearing'
);

reset role;
alter view public.portfolio_holdings set (security_invoker = on);
alter view public.portfolio_summary set (security_invoker = off);
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

-- Counted against a literal rather than against `funds`, because the comparison
-- query would itself be RLS-filtered to one row and the assertion would compare
-- the leak to the leak.
select ok(
  (select count(*) from public.portfolio_summary) > 1,
  'with security_invoker off the summary returns every user''s row, not just the caller''s'
);

reset role;
alter view public.portfolio_summary set (security_invoker = on);
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is(
  (select count(*) from public.portfolio_summary),
  1::bigint,
  'and switching it back restores the caller-only row'
);

-- ── The composite ───────────────────────────────────────────────────────────
--
--   RELIANCE  100.00 against 80.00  =  +25.00%
--   INFY       50.00 against 50.00  =    0.00%
--   equal-weighted mean             =  +12.50%

select results_eq(
  $$ select constituents, change_pct, advances, declines, unchanged
       from public.market_composite $$,
  $$ values (2::bigint, 12.50::numeric, 1::bigint, 0::bigint, 1::bigint) $$,
  'the composite is the equal-weighted mean of per-symbol day change, with breadth beside it'
);

select ok(
  (select universe_size > constituents from public.market_composite),
  'the universe is larger than the priced set, so the strip can say "2 of N" rather than implying full coverage'
);

select is(
  (select providers from public.market_composite),
  array['SIMULATOR']::quote_provider[],
  'the composite reports its providers rather than a source, because freshness is derived at read time'
);

select is(
  (select oldest_provider_ts from public.market_composite),
  null,
  'every constituent being SIMULATOR leaves no provider timestamp, which derives to SIMULATED'
);

-- A mixed set: the oldest timestamp is reported, and it is paired with every
-- provider on the client. Pessimistic by construction — a claim about data
-- quality may only ever err downwards.
reset role;
update public.quotes
   set provider = 'YAHOO', provider_ts = now() - interval '40 minutes'
 where symbol = 'INFY';
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is(
  (select array_length(providers, 1) from public.market_composite),
  2,
  'a mixed set reports both providers'
);

select ok(
  (select oldest_provider_ts < now() - interval '35 minutes' from public.market_composite),
  'and the oldest provider timestamp, which is the pessimistic input to the derivation'
);

select is(
  (select change_pct from public.market_composite),
  12.50::numeric,
  'changing a provider does not change the arithmetic'
);

-- An unpriced or inactive instrument is not a constituent.
reset role;
update public.instruments set is_active = false where symbol = 'INFY';
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select results_eq(
  $$ select constituents, change_pct from public.market_composite $$,
  $$ values (1::bigint, 25.00::numeric) $$,
  'a deactivated instrument leaves the composite, taking its change with it'
);

reset role;
delete from public.quotes;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select results_eq(
  $$ select constituents, change_pct, advances from public.market_composite $$,
  $$ values (0::bigint, null::numeric, 0::bigint) $$,
  'with nothing priced the composite reports no constituents and a null change, never a zero'
);

-- ── Grants ──────────────────────────────────────────────────────────────────

set local role anon;

select throws_ok(
  $$ select 1 from public.portfolio_holdings $$,
  '42501',
  null,
  'anon holds no select grant on the holdings view'
);
select throws_ok(
  $$ select 1 from public.portfolio_summary $$,
  '42501',
  null,
  'anon holds no select grant on the summary'
);
select throws_ok(
  $$ select 1 from public.market_composite $$,
  '42501',
  null,
  'nor on the composite — every terminal surface is behind auth, per the F10 grant policy'
);

select * from finish();
rollback;
