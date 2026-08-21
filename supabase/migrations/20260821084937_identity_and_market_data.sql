-- Identity and market data: the terminal's reference schema.
--
-- Eight tables in two groups, and the distinction drives every policy below:
--
--   User-owned  — profiles, watchlist_items. One row per user, scoped by
--                 (select auth.uid()), reachable only through the owner's session.
--   Reference   — instruments, quotes, candles, candle_sync, symbol_demand,
--                 market_holidays. No user_id; the same rows serve everyone.
--                 Readable by `authenticated`, writable by no client role at all.
--
-- What this migration deliberately does NOT do: seed any data (F14), create the
-- signup bootstrap trigger (F13), or give symbol_demand a write path (F18 adds
-- touch_symbol_demand together with its grant and its test).

-- ── Enums ───────────────────────────────────────────────────────────────────
-- Only the two this migration's tables reference. order_side, order_type,
-- product_type, order_status and ledger_type belong to F11's tables and are
-- created there, so each migration stays reviewable against what it creates.

create type public.quote_provider as enum ('YAHOO', 'TWELVE_DATA', 'SIMULATOR');

create type public.candle_interval as enum ('FIVE_MIN', 'THIRTY_MIN', 'ONE_DAY');

-- ── Shared trigger function ─────────────────────────────────────────────────

-- Postgres owns `updated_at`, not the writer.
--
-- Realtime fires on a row changing, and the client reads updated_at to decide
-- how stale an anchor is. A writer that forgets the column stops the price feed
-- silently — a bug that presents as "prices froze" and points nowhere near the
-- upsert that caused it. F11's funds, holdings and positions reuse this.
--
-- Not `security definer`: it needs no privileges beyond the caller's. It still
-- pins search_path, because a trigger function with a mutable one is resolved
-- against whatever the caller happens to have set.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.touch_updated_at() is
  'Before-update trigger: stamps updated_at so no writer can forget it.';

-- ── instruments ─────────────────────────────────────────────────────────────
-- Every other market-data table references this one, so it comes first.

create table public.instruments (
  symbol text primary key,
  name text not null,
  exchange text not null default 'NSE',
  sector text,
  -- Provider-specific and never assumed: Yahoo wants RELIANCE.NS for RELIANCE.
  yahoo_symbol text not null,
  tick_size numeric(6, 2) not null default 0.05,
  -- Excludes a delisted name from search without deleting the history that
  -- references it — a holding or trade must still resolve its symbol.
  is_active boolean not null default true
);

comment on table public.instruments is
  'The tradable universe (Nifty 200). Seeded by feature 14.';

-- ── quotes ──────────────────────────────────────────────────────────────────

create table public.quotes (
  symbol text primary key references public.instruments (symbol) on delete cascade,
  ltp numeric(14, 2) not null,
  prev_close numeric(14, 2),
  day_open numeric(14, 2),
  day_high numeric(14, 2),
  day_low numeric(14, 2),
  volume bigint,
  provider public.quote_provider not null,
  -- The provider's own timestamp for the price. Null only for SIMULATOR, which
  -- has no upstream clock to report — the CHECK below enforces exactly that.
  provider_ts timestamptz,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quotes_provider_ts_required_unless_simulated
    check (provider = 'SIMULATOR' or provider_ts is not null)
);

-- There is no `source` column, and its absence is load-bearing.
--
-- Freshness is a function of the current time, so a row written as "LIVE" is
-- stale minutes later with no write to invalidate it. Storing the badge would
-- make it wrong by default. deriveSource() computes it at read time from
-- provider and provider_ts. See architecture.md → Quote Provenance.
comment on table public.quotes is
  'Latest price per symbol. Written only by the market-tick Edge Function. No source column: freshness is derived at read time.';

create trigger quotes_touch_updated_at
before update on public.quotes
for each row
execute function public.touch_updated_at();

-- ── candles ─────────────────────────────────────────────────────────────────

create table public.candles (
  symbol text not null references public.instruments (symbol) on delete cascade,
  interval public.candle_interval not null,
  ts timestamptz not null,
  open numeric(14, 2) not null,
  high numeric(14, 2) not null,
  low numeric(14, 2) not null,
  close numeric(14, 2) not null,
  volume bigint,

  primary key (symbol, interval, ts)
);

-- The four UI ranges map onto three stored intervals: 1D→FIVE_MIN,
-- 1W→THIRTY_MIN, and both 1M and 1Y→ONE_DAY as different windows over one daily
-- series. The primary key leads with symbol then interval, so a range query over
-- ts is an index scan and the foreign key needs no separate index.
comment on table public.candles is
  'Cached OHLC series for the stock detail chart. Written only by the candle fetcher.';

-- ── candle_sync ─────────────────────────────────────────────────────────────

create table public.candle_sync (
  symbol text not null references public.instruments (symbol) on delete cascade,
  interval public.candle_interval not null,
  fetched_at timestamptz not null default now(),
  provider public.quote_provider not null,

  primary key (symbol, interval)
);

comment on table public.candle_sync is
  'Per-interval TTL bookkeeping for candles, and the chart''s provenance record.';

-- ── symbol_demand ───────────────────────────────────────────────────────────

create table public.symbol_demand (
  symbol text primary key references public.instruments (symbol) on delete cascade,
  last_requested_at timestamptz not null default now(),
  -- Higher for symbols in a holding, position, or open order: those must refresh
  -- whether or not anyone is looking at them.
  priority smallint not null default 0
);

-- Global, not per-user: one row per symbol regardless of who asked. The client
-- RPC that writes it (touch_symbol_demand) arrives in F18 with its own grant and
-- test. Until then this table has no write path for any client role.
comment on table public.symbol_demand is
  'Which symbols are worth refreshing. Global, not per-user. Write path arrives in feature 18.';

-- ── market_holidays ─────────────────────────────────────────────────────────

create table public.market_holidays (
  trading_date date primary key,
  description text not null
);

comment on table public.market_holidays is
  'Dates NSE is closed. Seeded annually from the published calendar by feature 14.';

-- ── profiles ────────────────────────────────────────────────────────────────

create table public.profiles (
  -- The primary key IS the user id, so the policy reads auth.uid() = id.
  id uuid primary key references auth.users (id) on delete cascade,
  -- ZR + six digits. The unique index is a backstop, not the strategy: F13's
  -- bootstrap trigger retries on collision and raises CLIENT_ID_EXHAUSTED rather
  -- than looping or failing the signup.
  client_id text not null unique,
  full_name text,
  avatar_url text,
  -- Defaults to dark, not light.
  --
  -- architecture.md's data model said light, but project-overview.md specifies a
  -- dark-default terminal and theme-provider.tsx ships defaultTheme="dark".
  -- CLAUDE.md's conflict order puts the scope document above architecture.md, so
  -- the document was corrected rather than the code bent to match it.
  theme text not null default 'dark',
  created_at timestamptz not null default now(),

  constraint profiles_theme_allowed check (theme in ('light', 'dark'))
);

comment on table public.profiles is
  'One row per authenticated user, created by the bootstrap trigger in feature 13.';

-- ── watchlist_items ─────────────────────────────────────────────────────────

create table public.watchlist_items (
  user_id uuid not null references public.profiles (id) on delete cascade,
  symbol text not null references public.instruments (symbol) on delete cascade,
  sort_order smallint not null default 0,

  primary key (user_id, symbol)
);

-- The primary key leads with user_id, so it covers that foreign key and the
-- owner's own listing. It does NOT cover a lookup by symbol, which is a distinct
-- index: Postgres does not index foreign keys automatically, and an unindexed
-- one makes ON DELETE CASCADE from instruments scan the whole table.
create index watchlist_items_symbol_idx on public.watchlist_items (symbol);

comment on table public.watchlist_items is
  'The user''s watchlist. Seeded at signup by feature 13, edited via Server Actions in feature 18.';

-- ── Row Level Security ──────────────────────────────────────────────────────
--
-- Two layers on every table, and they fail differently on purpose:
--
--   Grants  — revoked wholesale, then granted back one command at a time.
--             Supabase grants anon and authenticated ALL privileges on new
--             public tables by default (verified on support_messages: SELECT,
--             UPDATE, DELETE and TRUNCATE were all present), which would leave
--             RLS as the only layer. A missing grant raises 42501.
--   Policies — scope the rows a granted command may touch. A policy filtering
--             everything away returns zero rows silently.
--
-- Both are asserted separately in supabase/tests/01-rls-*.sql, because "denied"
-- by the wrong mechanism is a different fact about the system.
--
-- Every policy reads `(select auth.uid())` rather than bare `auth.uid()`: the
-- bare call is re-evaluated once per row, the subselect once per query.

alter table public.instruments enable row level security;
alter table public.quotes enable row level security;
alter table public.candles enable row level security;
alter table public.candle_sync enable row level security;
alter table public.symbol_demand enable row level security;
alter table public.market_holidays enable row level security;
alter table public.profiles enable row level security;
alter table public.watchlist_items enable row level security;

-- Reference tables: readable by a signed-in user, writable by nobody.
--
-- No anon grant anywhere. Every surface that shows an instrument or a price is
-- under (terminal), which is auth-gated, and the marketing site deliberately
-- quotes no prices. The publishable key ships inside the browser bundle, so
-- granting anon SELECT here would publish the whole universe to anyone who reads
-- the JavaScript.
--
-- Writes are refused by the absence of a grant AND the absence of a policy. The
-- service role, which the Edge Function and the candle fetcher use, bypasses
-- both — that is what makes it the only writer.
revoke all on public.instruments from anon, authenticated;
revoke all on public.quotes from anon, authenticated;
revoke all on public.candles from anon, authenticated;
revoke all on public.candle_sync from anon, authenticated;
revoke all on public.symbol_demand from anon, authenticated;
revoke all on public.market_holidays from anon, authenticated;

grant select on public.instruments to authenticated;
grant select on public.quotes to authenticated;
grant select on public.candles to authenticated;
grant select on public.candle_sync to authenticated;
grant select on public.symbol_demand to authenticated;
grant select on public.market_holidays to authenticated;

create policy instruments_read on public.instruments
  for select to authenticated using (true);

create policy quotes_read on public.quotes
  for select to authenticated using (true);

create policy candles_read on public.candles
  for select to authenticated using (true);

create policy candle_sync_read on public.candle_sync
  for select to authenticated using (true);

create policy symbol_demand_read on public.symbol_demand
  for select to authenticated using (true);

create policy market_holidays_read on public.market_holidays
  for select to authenticated using (true);

-- profiles: the owner reads and updates their own row.
--
-- No INSERT grant — F13's bootstrap trigger creates the row as definer, and a
-- user who could insert their own profile could choose their own client_id.
-- No DELETE grant — the row cascades from auth.users.
revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;

create policy profiles_read_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- watchlist_items: full CRUD, always the owner's own rows.
--
-- code-standards.md routes every write here through a Server Action, which runs
-- on the user's session — so these grants are what those actions rely on, and
-- the WITH CHECK is what stops a crafted payload writing into another user's
-- watchlist.
revoke all on public.watchlist_items from anon, authenticated;
grant select, insert, update, delete on public.watchlist_items to authenticated;

create policy watchlist_items_read_own on public.watchlist_items
  for select to authenticated using ((select auth.uid()) = user_id);

create policy watchlist_items_insert_own on public.watchlist_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy watchlist_items_update_own on public.watchlist_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy watchlist_items_delete_own on public.watchlist_items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ── Realtime ────────────────────────────────────────────────────────────────
--
-- Adding the subscription in TypeScript alone silently receives nothing; the
-- table has to be in the publication. Postgres Changes authorizes per subscriber
-- through the policies above, so quotes_read is what lets a browser see these.
--
-- Replica identity is left at its default (the primary key). payload.new is
-- fully populated for postgres_changes without it; `replica identity full` would
-- roughly double the WAL this table writes every minute to carry an old_record
-- that nothing reads.
alter publication supabase_realtime add table public.quotes;
