# Project Overview

> **Role:** Product source of truth — what this product is, who it's for, what's in and out of scope.
> **Read first**, before any other context file.
> **Relates to:** scope drives `build-plan.md`; progress tracked in `progress-tracker.md`.

## About the Project

ZerodhaRebuild is a full-stack paper-trading platform modelled on Zerodha's public website and its
Kite trading terminal, dressed in the design system captured in `context/DESIGN.md`. Visitors browse a
marketing site (Home, About, Pricing, Support), sign in with Google, and land in a dark-canvas terminal
seeded with ₹1,00,000 of simulated cash. From there they can
search roughly 200 NSE stocks, keep a live watchlist, place **market** and **limit** orders under the
**CNC** (delivery) or **MIS** (intraday) product types, and follow the results across Dashboard,
Orders, Holdings, Positions, Funds and Reports.

Prices come from NSE data where the upstream provider allows it, and fall back to a simulated tick
engine when it does not. Every quote carries its provenance, so the user always knows the provider,
how old the figure is, and whether the motion they are watching is interpolated.
**No real money, no brokerage account, and no payment integration exist anywhere in this system.**

## The Problem It Solves

Someone who wants to learn how Indian equity trading actually works has two poor options: open a real
demat account and learn which button does what while real capital is at risk, or read about it and
never touch an order form. Neither teaches the mechanics — margin blocking, order rejection, the
difference between CNC and MIS, brokerage and STT eating into a winning trade, intraday square-off at
3:20pm.

ZerodhaRebuild reproduces those mechanics faithfully against live-ish prices with nothing at stake.
It is also a portfolio piece: the interesting engineering is transactional correctness in the order
engine, per-user isolation enforced in the database, and a realtime price pipeline built on
infrastructure that costs nothing to run.

## Pages

**Public (unauthenticated):**

- **Home** (`/`) — hero, what the product is, feature highlights, market-data disclaimer, sign-in CTA.
- **About** (`/about`) — the project's purpose, how it was built, the tech stack, links to source.
- **Pricing** (`/pricing`) — the simulated charge structure the order engine actually applies: ₹0 delivery brokerage, ₹20/0.03% intraday, STT, exchange transaction charges, GST, SEBI turnover fee, stamp duty.
- **Support** (`/support`) — categorised help content plus a contact form that writes to `support_messages`.
- **Legal** (`/legal`) — disclaimer stating this is an unaffiliated portfolio project with no real trading.
- **Login** (`/auth/login`) — Google OAuth entry point.
- **Not found / error** — branded 404 and error boundaries.

**Terminal (authenticated):**

- **Dashboard** (`/dashboard`) — portfolio value, day P&L, index strip, top-10 holdings donut chart, recent orders.
- **Watchlist** — persistent left sidebar of the terminal shell, not its own route: searchable, reorderable, live LTP with tick flash, hover buy/sell buttons.
- **Orders** (`/orders`) — open / executed / cancelled / rejected tabs; cancel and modify open limit orders.
- **Holdings** (`/holdings`) — CNC positions held across days: quantity, average price, LTP, P&L, day change, totals.
- **Positions** (`/positions`) — MIS intraday positions: net quantity, realised and unrealised P&L, exit button.
- **Funds** (`/funds`) — available cash, used margin, opening balance, full ledger, and account reset.
- **Stock detail** (`/stocks/[symbol]`) — candlestick chart, OHLC, 52-week range, and a buy/sell ticket.
- **Reports** (`/reports`) — completed trade history with date and symbol filters, realised vs unrealised P&L.
- **Settings** (`/settings`) — Google profile, simulated client ID, light/dark theme toggle, account reset.

## Core User Flow

### Discover

An unauthenticated visitor lands on Home, reads what the product does, and sees an explicit banner
that this is a simulator unaffiliated with Zerodha. Pricing shows exactly what the simulator charges,
so nothing about the order engine's behaviour is a surprise later.

### Sign in

The visitor clicks "Sign in with Google". Supabase Auth runs the OAuth flow and redirects to
`/auth/callback`, which exchanges the code for a session cookie and sends them to `/dashboard`.

### Bootstrap

On first sign-in a database trigger creates the user's `profiles` row with a generated client ID
(`ZR` + six digits), credits `funds` with ₹1,00,000, writes the matching `SIGNUP_CREDIT` ledger entry,
and seeds a default watchlist of large-cap NSE names. The user never sees an empty terminal.

### Watch

The terminal shell loads with the watchlist sidebar populated. The client subscribes to Supabase
Realtime for the symbols on screen; a scheduled Edge Function refreshes those quotes upstream, and
between refreshes the client interpolates micro-ticks so the LTP moves and flashes green or red.
A badge on the shell reports whether prices are LIVE, DELAYED, or SIMULATED, and whether the market
is open.

### Place an order

The user clicks B or S on a watchlist row or the stock detail page. The order ticket opens with
quantity, product (CNC/MIS), order type (MARKET/LIMIT), limit price when applicable, and the margin
the order will require. On submit, a server action validates the input and calls the `place_order`
database function. A market order executes immediately at the last traded price; a limit order is
stored as `OPEN` and waits.

### Track

A market order's fill debits available cash, writes a `trades` row with the full charge breakdown,
and upserts either a holding (CNC) or a position (MIS). An open limit order is matched by the
scheduled Edge Function as soon as a refreshed quote crosses its price. MIS positions still open at
3:20pm IST are squared off automatically by the same job.

### Review

Holdings, Positions and Funds show current state; Reports shows completed trades with realised P&L.
The dashboard donut chart ranks the user's ten largest holdings by market value. From Settings or
Funds the user can reset the account, wiping orders, trades, holdings and positions and restoring the
₹1,00,000 opening balance.

## Features In Scope

- Public marketing site: Home, About, Pricing, Support (with working contact form), Legal, 404.
- Google OAuth sign-in via Supabase Auth, with route protection and session refresh.
- Automatic account bootstrap: profile, client ID, ₹1,00,000 opening balance, default watchlist.
- A seeded universe of roughly 200 NSE stocks (Nifty 200 constituents).
- Quote pipeline with a provider chain: Yahoo Finance (keyless) → an optional keyed provider → simulated tick engine, with a circuit breaker and per-quote provenance derived at read time.
- Cached OHLC candle series for the price chart, fetched on demand per interval with TTLs and daily pruning.
- Demand-driven quote refresh: only symbols currently in view, held, or referenced by an open order are refreshed, through a token-bucket rate limiter.
- Realtime price delivery over Supabase Realtime plus client-side tick interpolation and flash animation.
- Market-hours awareness for NSE (09:15–15:30 IST, weekdays, excluding published trading holidays), including a market-status indicator.
- Watchlist: search, add, remove, reorder, live LTP, inline buy/sell.
- Order ticket supporting MARKET and LIMIT orders in CNC and MIS products, with margin validation.
- Transactional order execution inside a single Postgres function: margin check, cash debit, trade record, holding/position upsert, ledger append.
- Realistic charge calculation: brokerage, STT, exchange transaction charges, SEBI turnover fee, stamp duty, GST, and DP charges.
- Limit-order matching and 3:20pm IST MIS auto-square-off, both run from a `pg_cron`-scheduled Edge Function.
- Orders page with cancel and modify for open orders.
- Holdings, Positions, Funds (with full ledger), Reports, and Stock detail pages.
- Top-10 holdings donut chart and portfolio summary on the dashboard.
- Candlestick price charts on stock detail.
- Dark-default and light themes built from one token set, with brand and trading colours identical across both.
- Self-service account reset.
- Row Level Security on every user-owned table.
- Responsive layout down to mobile, with loading, empty and error states throughout.

## Features Out of Scope

- Any real-money movement: payments, deposits, withdrawals, UPI, or netbanking — simulated or otherwise.
- Real brokerage integration: Kite Connect, Upstox, Angel One, or any live order routing.
- Derivatives: futures, options, F&O margins, option chains, Greeks.
- Other product types and order variants: SL, SL-M, GTT, AMO, bracket and cover orders, basket orders.
- Mutual funds, IPOs, bonds, commodities, currency, and Coin/Console equivalents.
- KYC, PAN collection, document upload, or any identity verification.
- Market depth beyond what the quote provider returns; no order-book depth simulation of other traders.
- Multi-user interaction: no shared order book, leaderboard, social feed, or copy trading.
- Email, SMS, or push notifications.
- Native mobile applications.
- Corporate actions: splits, bonuses, dividends, buybacks.
- Short selling in CNC (MIS intraday shorts are in scope).
- Historical backtesting and algorithmic strategy execution.

## Target User

Two audiences, in this order. **Recruiters and engineers** evaluating the author's work — they need
the app to load, look convincingly like a real trading terminal, and reward inspection of the code
and the data model. **Learners** curious about Indian equity trading — students and first-time
investors who want to understand how orders, margin and charges behave before risking money. Neither
group is assumed to have a Zerodha account.

## Success Criteria

- A visitor with no account can read Home, About, Pricing and Support and submit the support form successfully.
- Signing in with Google produces a working session and lands on `/dashboard` with ₹1,00,000 available, a non-empty watchlist, and a generated client ID.
- The watchlist displays a price for every symbol within 3 seconds of the terminal loading, and that price visibly ticks and flashes.
- Every displayed price resolves accurate provenance — provider, provider timestamp, and whether the figure is interpolated — and the derived badge reads DELAYED under Yahoo rather than overclaiming LIVE.
- A CNC market buy for an affordable quantity moves to `COMPLETE`, debits cash by exactly (quantity × price + charges), and appears in Holdings with the correct average price.
- A buy exceeding available cash is rejected with `INSUFFICIENT_FUNDS` and leaves the funds row untouched.
- A limit buy placed below the market stays `OPEN`, and fills automatically once a refreshed quote reaches its price.
- An MIS position still open at 15:20 IST is squared off automatically, with the closing trade and realised P&L recorded.
- Cash, holdings, positions and the ledger reconcile exactly: opening balance − net debits + net credits = available cash, verified by a test.
- Signed in as user A, no query or API route can read or modify user B's funds, orders, holdings or positions.
- The dashboard donut chart shows the correct top ten holdings ranked by market value.
- Account reset returns the user to exactly the post-signup state.
- Every page renders correctly at 375px width and in both light and dark themes.
- The deployed Render app boots against hosted Supabase, and `pg_cron` keeps refreshing quotes and matching orders while the web service is asleep.
