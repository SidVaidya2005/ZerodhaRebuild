-- The seeded reference data: the tradable universe and the trading calendar.
--
-- Unlike every other suite here, this one asserts against **committed** rows
-- rather than fixtures it creates: `pnpm seed` is what puts them there. It is
-- therefore a check on the seed having run and having produced sane data — the
-- assertions are deliberately shaped as bounds and spot facts, not as an exact
-- copy of the file, which would only restate the seed to itself.
begin;
select plan(18);

-- ── The universe ────────────────────────────────────────────────────────────

select cmp_ok(
  (select count(*)::int from public.instruments), '>=', 190,
  'the instrument universe is seeded — at least 190 rows'
);

select cmp_ok(
  (select count(*)::int from public.instruments), '<=', 210,
  'and it is one universe, not a doubled one: at most 210 rows'
);

select is(
  (select count(*)::int from public.instruments where coalesce(name, '') = ''),
  0,
  'every instrument carries a company name'
);

-- The derivation `${symbol}.NS` is checked upstream against Yahoo itself, which
-- is the only thing that can actually confirm a symbol quotes. This re-asserts
-- the shape, which is what a database can know.
select is(
  (select count(*)::int from public.instruments where yahoo_symbol not like '%.NS'),
  0,
  'every yahoo_symbol is an NSE symbol ending in .NS'
);

select is(
  (select count(*)::int from public.instruments
    where yahoo_symbol <> symbol || '.NS'),
  0,
  'and each is derived from its own symbol, not copied from a neighbouring row'
);

select results_eq(
  $$select symbol, yahoo_symbol from public.instruments
     where symbol in ('RELIANCE', 'TCS', 'INFY') order by symbol$$,
  $$values ('INFY', 'INFY.NS'), ('RELIANCE', 'RELIANCE.NS'), ('TCS', 'TCS.NS')$$,
  'the index heavyweights are present with the symbols the quote pipeline will use'
);

-- ── Sectors came from NSE's Industry column ─────────────────────────────────
-- A column misalignment in the CSV parse is the failure here: it would put half
-- a company name in `sector` and produce nearly as many distinct values as rows.

select cmp_ok(
  (select count(distinct sector)::int from public.instruments), '<', 30,
  'sectors are a small classification, not a per-row string'
);

select cmp_ok(
  (select count(distinct sector)::int from public.instruments), '>', 5,
  'and there is more than one sector, so the column is not a constant'
);

select is(
  (select count(*)::int from public.instruments where sector = ''),
  0,
  'no instrument carries an empty-string sector'
);

-- ── The trading calendar ────────────────────────────────────────────────────

select cmp_ok(
  (select count(*)::int from public.market_holidays), '>=', 10,
  'the published calendar is seeded'
);

select is(
  (select count(*)::int from public.market_holidays where coalesce(description, '') = ''),
  0,
  'every closure says what it is for'
);

-- The dates are the point of the table, and a timezone bug moves them silently.
-- `new Date('26-Jan-2026')` parses as UTC midnight and renders as the 25th
-- anywhere west of Greenwich — a market open on a day it is closed.
select is(
  (select description from public.market_holidays where trading_date = '2026-01-26'),
  'Republic Day',
  'Republic Day is stored on 26 January, not the 25th'
);

select is(
  (select description from public.market_holidays where trading_date = '2026-03-03'),
  'Holi',
  'Holi is stored on the published date'
);

select is(
  (select count(*)::int from public.market_holidays
    where trading_date < '2026-01-01' or trading_date > '2026-12-31'),
  0,
  'every seeded closure falls inside the calendar year that was fetched'
);

-- ── The simulator's anchor (F15) ────────────────────────────────────────────
-- `prev_close` is seeded from NSE's published bhavcopy. It seeds the simulator's
-- walk and anchors its ±5% band, and the tick writes it to `quotes.prev_close`
-- as the previous close — which the Phase 2 review found this comment denying.
-- What still holds absolutely is narrower: it is never an `ltp`, never a
-- `quote_provider` value, and no surface renders it as a live price.

select is(
  (select count(*)::int from public.instruments where prev_close is null),
  0,
  'every instrument carries a previous close for the simulator to walk from'
);

select is(
  (select count(*)::int from public.instruments where prev_close <= 0),
  0,
  'and none of them is zero or negative — a price that is not a price'
);

-- The spread is the point. A fixed starting constant would price MRF and
-- YESBANK identically and make Phase 5's portfolio arithmetic meaningless.
select cmp_ok(
  (select max(prev_close) / min(prev_close) from public.instruments), '>', 100::numeric,
  'the closes span orders of magnitude, so they are real rather than a constant'
);

-- A band wide enough to survive ordinary market moves, narrow enough to catch a
-- column read from the wrong position in the bhavcopy CSV.
select ok(
  (select prev_close between 200 and 5000 from public.instruments where symbol = 'RELIANCE'),
  'RELIANCE''s close is in a plausible band, so the CSV column mapping is right'
);

select * from finish();
rollback;
