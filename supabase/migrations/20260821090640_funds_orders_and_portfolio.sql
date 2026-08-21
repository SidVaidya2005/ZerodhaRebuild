-- Funds, orders and portfolio: the money schema.
--
-- `context/trading-contract.md` is authoritative for every column, default and
-- constraint below, and each CHECK cites the clause it enforces. Three of that
-- document's §12 reconciliation identities are row-level, so they are encoded
-- here as constraints rather than left to tests: a violating row cannot be
-- stored at all, rather than being stored and detected later.
--
-- A CHECK is not deferrable — it fires per statement, not at commit. That is a
-- deliberate constraint on F22–F24: a function cannot pass through an invalid
-- intermediate row state. See the note on identity 8 below, which is why
-- `code-standards.md`'s execute_order example changed in this same commit.
--
-- Nothing here may be written by a client. `select` is the only grant, scoped to
-- the owner; every write arrives through a `security definer` function built in
-- F22–F24. This is the F10 posture applied to the tables that hold the money.

-- ── Enums ───────────────────────────────────────────────────────────────────
-- The five F10 deferred, because only these tables reference them.

create type public.order_side as enum ('BUY', 'SELL');

create type public.order_type as enum ('MARKET', 'LIMIT');

create type public.product_type as enum ('CNC', 'MIS');

create type public.order_status as enum ('OPEN', 'COMPLETE', 'CANCELLED', 'REJECTED');

-- Eight values, and deliberately no RESET.
--
-- An earlier draft of the contract had reset_account append a RESET row while
-- also claiming the account returns to exactly the post-signup state; those
-- cannot both be true. Wiping wins, because "returns to exactly the post-signup
-- state" is a stated success criterion and is trivially checkable
-- (trading-contract.md §11).
create type public.ledger_type as enum (
  'SIGNUP_CREDIT',
  'MARGIN_BLOCK',
  'MARGIN_RELEASE',
  'BUY_DEBIT',
  'SELL_CREDIT',
  'CHARGES',
  'REALISED_PNL',
  'SIMULATION_ADJUSTMENT'
);

-- ── funds ───────────────────────────────────────────────────────────────────

create table public.funds (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  available_cash numeric(14, 2) not null,
  -- Equals Σ orders.blocked_margin over OPEN orders plus Σ positions.blocked_margin
  -- (§12.3). Never a free-standing figure: any transaction changing one side
  -- changes the other in the same statement block. The identity spans rows, so it
  -- is asserted by F23's tests rather than by a constraint here.
  used_margin numeric(14, 2) not null default 0,
  opening_balance numeric(14, 2) not null,
  updated_at timestamptz not null default now(),

  -- §12.4, the last line of defence. A cover or square-off that would drive cash
  -- below zero caps the debit and books the remainder as SIMULATION_ADJUSTMENT
  -- (§6) — this constraint is never relaxed to accommodate that case.
  constraint funds_available_cash_non_negative check (available_cash >= 0),
  constraint funds_used_margin_non_negative check (used_margin >= 0)
);

comment on table public.funds is
  'One row per user. Cash and margin, written only by the money functions in features 22-24.';

create trigger funds_touch_updated_at
before update on public.funds
for each row
execute function public.touch_updated_at();

-- ── orders ──────────────────────────────────────────────────────────────────

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  symbol text not null references public.instruments (symbol),
  side public.order_side not null,
  order_type public.order_type not null,
  product public.product_type not null,
  quantity integer not null,
  limit_price numeric(14, 2),
  filled_quantity integer not null default 0,
  average_price numeric(14, 2),
  status public.order_status not null default 'OPEN',
  -- Reserved at placement, retired exactly once on any terminal transition by
  -- release_margin or transfer_margin_to_position (§4). No other code path may
  -- write this column.
  blocked_margin numeric(14, 2) not null default 0,
  rejection_reason text,
  placed_at timestamptz not null default now(),
  executed_at timestamptz,

  constraint orders_quantity_positive check (quantity > 0),

  -- §1: there is no simulated counterparty book, so filled_quantity is either
  -- zero or the whole order. Partial fills do not exist in this build.
  constraint orders_fill_is_all_or_nothing
    check (filled_quantity = 0 or filled_quantity = quantity),

  -- A limit order needs its price; a market order must not carry one.
  constraint orders_limit_price_iff_limit
    check ((order_type = 'LIMIT') = (limit_price is not null)),

  -- average_price is null until filled, and a fill must record one.
  constraint orders_average_price_iff_complete
    check ((status = 'COMPLETE') = (average_price is not null)),

  -- §12.8: every order not in OPEN has blocked_margin = 0.
  --
  -- This constraint is why code-standards.md's execute_order example changed. A
  -- CHECK is not deferrable, so `update orders set status = 'REJECTED'` followed
  -- by `release_margin()` fails on the first statement — the row is momentarily
  -- REJECTED while still holding margin. The margin must be released first, or
  -- both columns written in one statement. The contract already implied that
  -- ordering; this makes it enforced rather than remembered.
  constraint orders_no_margin_unless_open
    check (status = 'OPEN' or blocked_margin = 0)
);

comment on table public.orders is
  'Order lifecycle per trading-contract.md §4. OPEN is the only status any transition may start from.';

create index orders_user_placed_idx on public.orders (user_id, placed_at desc);

-- The matcher joins open orders against refreshed quotes by symbol, across all
-- users. A partial index keeps it proportional to the open-order count rather
-- than to the whole order history, which only ever grows.
create index orders_open_by_symbol_idx
  on public.orders (symbol)
  where status = 'OPEN';

-- ── fund_ledger ─────────────────────────────────────────────────────────────

create table public.fund_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.ledger_type not null,
  -- Signed: negative for debits. §12.1 — available_cash equals the sum of these.
  amount numeric(14, 2) not null,
  -- Makes the ledger auditable without replaying it. §12.2 — the newest row's
  -- balance_after equals funds.available_cash.
  balance_after numeric(14, 2) not null,
  order_id uuid references public.orders (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),

  -- The ledger records cash, and cash floors at zero even in the §6 capped-loss
  -- case, so a balance_after below zero would contradict funds' own constraint.
  constraint fund_ledger_balance_after_non_negative check (balance_after >= 0)
);

-- A ledger row means cash moved. The collateral transfer on short entry
-- deliberately writes none, because available_cash is byte-identical before and
-- after it (§7).
comment on table public.fund_ledger is
  'Every change to available_cash, one row each. A row here means cash actually moved.';

create index fund_ledger_user_created_idx
  on public.fund_ledger (user_id, created_at desc);

create index fund_ledger_order_idx on public.fund_ledger (order_id);

-- ── trades ──────────────────────────────────────────────────────────────────

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  symbol text not null references public.instruments (symbol),
  side public.order_side not null,
  product public.product_type not null,
  quantity integer not null,
  price numeric(14, 2) not null,
  charges numeric(14, 2) not null,
  charge_breakdown jsonb not null,
  -- §9: net of the closing leg's charges, 0.00 on every opening leg, never null.
  -- In the §6 capped-loss case this still carries the true, uncapped loss even
  -- though the cash effect was capped — Reports stay honest.
  realised_pnl numeric(14, 2) not null default 0,
  -- True when written by the 15:20 square-off job rather than a user action, so
  -- Reports can tell an auto-exit from a deliberate one (§10).
  is_auto_squareoff boolean not null default false,
  traded_at timestamptz not null default now(),

  constraint trades_quantity_positive check (quantity > 0),
  constraint trades_price_positive check (price > 0),
  constraint trades_charges_non_negative check (charges >= 0),

  -- §12.6: the breakdown's components sum exactly to `charges`.
  --
  -- Exact, not approximate: §2 makes `charges` the sum of the already-rounded
  -- components rather than a rounding of the unrounded sum, precisely so this
  -- reconciliation cannot fail by a paisa.
  --
  -- Keys are snake_case because they live in Postgres; charges.ts keeps its
  -- camelCase type and F22's equality test converts at the boundary. Absent
  -- components are 0, never missing keys — the arithmetic below requires it.
  constraint trades_breakdown_sums_to_charges check (
    (charge_breakdown ->> 'brokerage')::numeric
      + (charge_breakdown ->> 'stt')::numeric
      + (charge_breakdown ->> 'exchange_txn')::numeric
      + (charge_breakdown ->> 'sebi_turnover')::numeric
      + (charge_breakdown ->> 'stamp_duty')::numeric
      + (charge_breakdown ->> 'dp_charge')::numeric
      + (charge_breakdown ->> 'gst')::numeric
    = charges
  )
);

comment on table public.trades is
  'Immutable record of every fill, with its full charge breakdown. Never updated once written.';

create index trades_user_traded_idx on public.trades (user_id, traded_at desc);

create index trades_order_idx on public.trades (order_id);

create index trades_symbol_idx on public.trades (symbol);

-- ── holdings ────────────────────────────────────────────────────────────────

create table public.holdings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  symbol text not null references public.instruments (symbol),
  quantity integer not null,
  -- Cost per share with charges capitalised upward, matching how a broker
  -- reports cost basis (§8). CNC only — there is no CNC shorting.
  average_price numeric(14, 2) not null,
  updated_at timestamptz not null default now(),

  primary key (user_id, symbol),

  -- §12.5: a row that reaches zero is deleted, never retained at zero. Zero rows
  -- would otherwise pollute Holdings and the top-ten donut.
  constraint holdings_quantity_positive check (quantity > 0),
  constraint holdings_average_price_positive check (average_price > 0)
);

comment on table public.holdings is
  'CNC delivery positions held across days. A row at zero quantity is deleted, never kept.';

create index holdings_symbol_idx on public.holdings (symbol);

create trigger holdings_touch_updated_at
before update on public.holdings
for each row
execute function public.touch_updated_at();

-- ── positions ───────────────────────────────────────────────────────────────

create table public.positions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  symbol text not null references public.instruments (symbol),
  product public.product_type not null,
  -- Negative for an intraday short.
  net_quantity integer not null,
  -- P&L ONLY (§8, §9). Cost per share for a long, net proceeds per share for a
  -- short — charges capitalise in opposite directions, and one formula for both
  -- is an arithmetic error that makes entry charges reappear as profit.
  average_price numeric(14, 2) not null,
  -- COLLATERAL ONLY (§6). Quantity-weighted average of the GROSS fill prices,
  -- no charges folded in. Null for longs.
  --
  -- These two averages answer different questions and crossing them is a bug
  -- (§12.11): using the net average as the collateral basis under-collateralises
  -- a short, because the buffer is defined against a price move and so must be
  -- applied to the price actually observed.
  entry_reference_price numeric(14, 2),
  realised_pnl numeric(14, 2) not null default 0,
  -- Collateral against an open short, recomputed on every change to the position:
  --   |net_quantity| × entry_reference_price × (1 + SHORT_MARGIN_BUFFER)
  --     + estimated_close_charges
  -- Zero for longs.
  blocked_margin numeric(14, 2) not null default 0,
  -- Original entry, NOT reset when adding to the position — the square-off job
  -- reads it (§8, §10).
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, symbol, product),

  -- A row at zero is deleted, never retained (§8).
  constraint positions_net_quantity_non_zero check (net_quantity <> 0),

  -- CNC settles into holdings, so a CNC position is a bug rather than a state.
  -- Drop this constraint if that ever stops being true.
  constraint positions_mis_only check (product = 'MIS'),

  -- §12.12: collateral is held against shorts only. The full formula needs the
  -- charge calculator and so is asserted by F23's tests; that longs hold nothing
  -- is checkable right here.
  constraint positions_collateral_on_shorts_only
    check (net_quantity < 0 or blocked_margin = 0),

  -- §12.11 made structural: a short carries a gross reference price, a long
  -- never does. This is what stops the two averages being crossed by accident.
  constraint positions_reference_price_iff_short
    check ((net_quantity < 0) = (entry_reference_price is not null))
);

comment on table public.positions is
  'MIS intraday positions. average_price is for P&L, entry_reference_price is for collateral, and neither may appear in the other''s calculation.';

create index positions_symbol_idx on public.positions (symbol);

create trigger positions_touch_updated_at
before update on public.positions
for each row
execute function public.touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
--
-- `select` is the only grant, and only over the owner's own rows.
--
-- No client role receives insert, update or delete on any of these six, and no
-- write policy exists for any command. code-standards.md already forbids a
-- Server Action writing these tables directly — every write arrives through a
-- `security definer` function (place_order, cancel_order, execute_order,
-- reset_account), which bypasses both layers by design. A write grant would
-- therefore exist only to be unused, and an unused grant is a hole waiting for a
-- mistaken policy.

alter table public.funds enable row level security;
alter table public.fund_ledger enable row level security;
alter table public.orders enable row level security;
alter table public.trades enable row level security;
alter table public.holdings enable row level security;
alter table public.positions enable row level security;

revoke all on public.funds from anon, authenticated;
revoke all on public.fund_ledger from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.trades from anon, authenticated;
revoke all on public.holdings from anon, authenticated;
revoke all on public.positions from anon, authenticated;

grant select on public.funds to authenticated;
grant select on public.fund_ledger to authenticated;
grant select on public.orders to authenticated;
grant select on public.trades to authenticated;
grant select on public.holdings to authenticated;
grant select on public.positions to authenticated;

create policy funds_read_own on public.funds
  for select to authenticated using ((select auth.uid()) = user_id);

create policy fund_ledger_read_own on public.fund_ledger
  for select to authenticated using ((select auth.uid()) = user_id);

create policy orders_read_own on public.orders
  for select to authenticated using ((select auth.uid()) = user_id);

create policy trades_read_own on public.trades
  for select to authenticated using ((select auth.uid()) = user_id);

create policy holdings_read_own on public.holdings
  for select to authenticated using ((select auth.uid()) = user_id);

create policy positions_read_own on public.positions
  for select to authenticated using ((select auth.uid()) = user_id);

-- ── Realtime ────────────────────────────────────────────────────────────────
--
-- Orders change status asynchronously — the matcher fills a limit order and the
-- square-off job closes a position, neither triggered by the browser — so the
-- Orders page subscribes rather than polls. Authorized per subscriber through
-- orders_read_own above, so a user only ever receives their own rows.
alter publication supabase_realtime add table public.orders;
