-- RLS on the reference tables: readable by a signed-in user, writable by none.
--
-- These carry no user_id, so there is no row to scope — the whole protection is
-- "select yes, everything else no", enforced by a missing grant rather than by a
-- policy that filters. That is deliberate: if a permissive write policy is ever
-- added by mistake, the absent grant still refuses the request.
--
-- The service role, which the market-tick Edge Function and the candle fetcher
-- use, bypasses both layers. That is what makes it the only writer.
begin;
select plan(15);

insert into public.instruments (symbol, name, yahoo_symbol) values
  ('RELIANCE', 'Reliance Industries Limited', 'RELIANCE.NS')
  on conflict (symbol) do nothing;

insert into public.quotes (symbol, ltp, provider, provider_ts) values
  ('RELIANCE', 1402.50, 'YAHOO', now() - interval '2 minutes');

-- ── The trigger owns updated_at, not the writer ─────────────────────────────
-- Run as the owner, because no client role may update this table at all.
-- Realtime fires on the row changing and the client reads updated_at to age its
-- anchor, so a writer that forgets the column would stop the feed silently.

do $$
declare
  v_before timestamptz;
  v_after  timestamptz;
begin
  select updated_at into v_before from public.quotes where symbol = 'RELIANCE';
  perform pg_sleep(0.01);
  -- Note what is NOT in this statement: updated_at.
  update public.quotes set ltp = 1407.75 where symbol = 'RELIANCE';
  select updated_at into v_after from public.quotes where symbol = 'RELIANCE';
  perform ok(
    v_after > v_before,
    'the trigger stamps updated_at on a write that never mentions it'
  );
end;
$$;

-- SIMULATOR is the only provider allowed to have no upstream timestamp, because
-- it is the only one with no upstream clock to report.
select throws_ok(
  $$insert into public.quotes (symbol, ltp, provider)
    values ('RELIANCE', 100.00, 'YAHOO')$$,
  '23514',
  null,
  'a non-simulated quote cannot be stored without its provider timestamp'
);

-- ── As a signed-in user ─────────────────────────────────────────────────────

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select isnt_empty(
  $$select symbol from public.quotes$$,
  'a signed-in user reads quotes — Realtime authorizes through this same policy'
);

select isnt_empty(
  $$select symbol from public.instruments$$,
  'a signed-in user reads the instrument universe'
);

-- There is no `source` column, and its absence is the design. Freshness is a
-- function of the clock, so a row written as LIVE goes stale with no write to
-- invalidate it; storing the badge would make it wrong by default.
select throws_ok(
  $$select source from public.quotes$$,
  '42703',
  null,
  'quotes has no source column — provenance is derived at read time'
);

select throws_ok(
  $$insert into public.quotes (symbol, ltp, provider, provider_ts)
    values ('RELIANCE', 1.00, 'SIMULATOR', null)$$,
  '42501',
  null,
  'a signed-in user cannot invent a price'
);

select throws_ok(
  $$update public.quotes set ltp = 999999.00$$,
  '42501',
  null,
  'a signed-in user cannot move the market'
);

select throws_ok(
  $$delete from public.quotes$$,
  '42501',
  null,
  'a signed-in user cannot delete a quote'
);

select throws_ok(
  $$insert into public.instruments (symbol, name, yahoo_symbol)
    values ('FAKE', 'Fake Industries', 'FAKE.NS')$$,
  '42501',
  null,
  'a signed-in user cannot add an instrument'
);

select throws_ok(
  $$insert into public.candles (symbol, interval, ts, open, high, low, close)
    values ('RELIANCE', 'ONE_DAY', now(), 1, 1, 1, 1)$$,
  '42501',
  null,
  'a signed-in user cannot fabricate a candle'
);

select throws_ok(
  $$update public.candles set close = 1$$,
  '42501',
  null,
  'a signed-in user cannot rewrite chart history'
);

select throws_ok(
  $$update public.candle_sync set fetched_at = now()$$,
  '42501',
  null,
  'a signed-in user cannot forge a cache timestamp'
);

-- symbol_demand has no client write path at all yet. Feature 18 adds
-- touch_symbol_demand together with its grant and its own test.
select throws_ok(
  $$insert into public.symbol_demand (symbol) values ('RELIANCE')$$,
  '42501',
  null,
  'symbol_demand has no client write path until feature 18 adds the RPC'
);

select throws_ok(
  $$insert into public.market_holidays (trading_date, description)
    values ('2027-01-26', 'invented holiday')$$,
  '42501',
  null,
  'a signed-in user cannot close the market'
);

-- ── Grants, independently of policies ───────────────────────────────────────

reset role;

-- Not one of the six is reachable by an anonymous visitor. The publishable key
-- ships inside the browser bundle, so a stray anon grant here would publish the
-- whole instrument universe to anyone who reads the JavaScript.
select is_empty(
  $$select table_name from information_schema.role_table_grants
     where grantee = 'anon'
       and table_schema = 'public'
       and table_name in ('instruments', 'quotes', 'candles',
                          'candle_sync', 'symbol_demand', 'market_holidays')$$,
  'anon holds no privilege of any kind on any reference table'
);

-- Adding the subscription in TypeScript alone silently receives nothing: the
-- table has to be in the publication for Postgres to emit the change at all.
select isnt_empty(
  $$select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'quotes'$$,
  'quotes is in the supabase_realtime publication, so changes actually broadcast'
);

select * from finish();
rollback;
