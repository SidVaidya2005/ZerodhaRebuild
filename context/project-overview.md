# Project Overview

This document defines the product, its audience, and its scope. It is written for the project owner,
developers, and AI agents. Follow `../CLAUDE.md` for the session reading order; the tracker comes first.
The phase plans in `build-plan/` describe the work, and `progress-tracker.md` records its status.

## About the Project

ZerodhaRebuild lets people practise Indian stock trading without using real money. Its public website
and trading terminal follow Zerodha's product model, with the visual design defined in `DESIGN.md`.
Visitors can browse Home, About, Pricing, and Support before signing in with Google.

Each new account starts with ₹1,00,000 of simulated cash and a dark theme. Users can search roughly
200 NSE stocks, maintain a watchlist, and place market or limit orders for delivery (CNC) or intraday
trading (MIS). Dashboard, Orders, Holdings, Positions, Funds, and Reports show the results.

Prices are generated from recorded NSE closing prices. No external market-data provider is connected,
so every quote is labelled `SIMULATED`. Each price exposes its provider, timestamp, and whether the
browser has animated an intermediate value. There are no real-money transfers, brokerage accounts,
or payment integrations.

## The Problem It Solves

Reading about trading does not show what happens when an order is rejected, cash is reserved, or
charges reduce a profit. Learning those details in a real brokerage account puts money at risk.

This app makes those steps available for practice. It models order placement, margin, charges, and
intraday square-off, with the deliberate simplifications listed in `trading-contract.md`. It is also
a portfolio project demonstrating database transactions, account isolation, and delivery of changing
prices on free hosting services.

## Terms used in these docs

| Term                                         | Meaning in this project                                                                                                                                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NSE / Nifty 200                              | India's National Stock Exchange, and the stock index used to choose the roughly 200 supported instruments. An instrument is a tradable stock.                                                                     |
| CNC / delivery                               | Buying shares that can remain in Holdings across trading days. CNC short selling is not supported.                                                                                                                |
| MIS / intraday                               | Positions intended to close on the same trading day. The scheduled job closes remaining positions from 15:20 IST.                                                                                                 |
| Market / limit order                         | A market order uses the observed server price. A limit order waits for an observed price at or better than the user's limit.                                                                                      |
| Fill / square-off                            | A fill executes an order. Square-off closes an open position by taking the opposite side.                                                                                                                         |
| Short / cover                                | A short sells before buying back. A cover is the buy that closes that short. MIS supports this; CNC does not.                                                                                                     |
| Margin / collateral                          | Cash set aside for an order or to cover an open short's obligation. This simulator offers no leverage.                                                                                                            |
| Ledger                                       | The record of changes to available cash, including each amount and the balance afterwards.                                                                                                                        |
| P&L                                          | Profit and loss. Realised P&L comes from closing a position; unrealised P&L values a position still open.                                                                                                         |
| LTP / OHLC                                   | Last traded price; and open, high, low, close prices for a chart interval. Here the displayed prices are simulated.                                                                                               |
| Brokerage / STT / GST / SEBI fee / DP charge | Broker commission, Securities Transaction Tax, Goods and Services Tax, the securities regulator's turnover fee, and a depository participant charge on delivery sales. Rates are defined in the trading contract. |
| Quote / provenance / anchor                  | A quote is a price record. Provenance tells where it came from and when. The anchor is the server price, before browser animation.                                                                                |
| Interpolation                                | Generating intermediate display values between server updates to make movement look smoother. Those values must not determine trades or monetary totals.                                                          |
| Transaction / atomic                         | A group of database changes that all succeed together or are all rolled back.                                                                                                                                     |
| RLS / `auth.uid()`                           | Row Level Security restricts which rows a user can access. `auth.uid()` identifies the signed-in user inside Postgres.                                                                                            |
| RPC / Server Action                          | An RPC calls a database function. A Next.js Server Action handles browser requests on the server, validates input, and calls the database.                                                                        |
| Edge Function / `pg_cron` / Realtime         | A hosted function, the database scheduler that calls it, and the service that sends row changes to browsers.                                                                                                      |
| Invariant / parity / concurrency             | A rule that must always hold; agreement between two implementations; and operations running at the same time.                                                                                                     |

## Pages

**Public (unauthenticated):**

- **Home** (`/`) — hero, what the product is, feature highlights, market-data disclaimer, sign-in CTA.
- **About** (`/about`) — the project's purpose, how it was built, the tech stack, links to source.
- **Pricing** (`/pricing`) — the engine's simulated charges: ₹0 delivery brokerage; intraday brokerage at the lower of 0.03% of turnover or ₹20; plus STT, exchange charges, GST, SEBI fees, and stamp duty.
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

The visitor chooses "Sign in with Google". Supabase Auth handles OAuth, which lets Google confirm
the user's identity without this app storing a Google password. `/auth/callback` exchanges the
returned code for a session cookie and sends the user to `/dashboard`.

### Bootstrap

On first sign-in, a database trigger creates `profiles` with a client ID (`ZR` plus six digits),
credits `funds` with ₹1,00,000, and records a matching `SIGNUP_CREDIT` ledger entry. It also adds a
starter watchlist of large-cap NSE stocks.

### Watch

The terminal loads the watchlist and subscribes to Supabase Realtime for visible symbols. A scheduled
Edge Function refreshes their simulated prices. Between updates, the watchlist animates intermediate
values and flashes green or red. The terminal shows the market's open/closed status and a price-source
badge. This build always uses `SIMULATED`; no connected provider can produce `LIVE` or `DELAYED`.

### Place an order

The user chooses B or S from a watchlist row or stock page. The ticket asks for quantity, product
(CNC/MIS), order type (MARKET/LIMIT), and a limit price when needed. It shows the estimated margin.
A Server Action validates the submitted input and calls `place_order`. A market order attempts an
immediate fill at the server's LTP during a trading session; an out-of-session market order is rejected.
A limit order is stored as `OPEN` until a qualifying price is observed during a session.

### Track

A fill updates cash, records the trade and charges, and updates the relevant CNC holding or MIS
position in one transaction. A short keeps its required collateral reserved against the position.
The scheduled job matches open limit orders against refreshed quotes. Its first run at or after
15:20 IST also closes remaining MIS positions.

### Review

Holdings, Positions, and Funds show the account's current state. Reports lists completed trades and
realised P&L; the dashboard chart shows the ten largest holdings by market value. Settings and Funds
offer an account reset that clears trading history and restores ₹1,00,000. Profile and watchlist
preferences are kept; the exact reset procedure is in the trading contract.

## Features In Scope

- Public marketing site: Home, About, Pricing, Support (with working contact form), Legal, 404.
- Google OAuth sign-in via Supabase Auth, with route protection and session refresh.
- Automatic account bootstrap: profile, client ID, ₹1,00,000 opening balance, default watchlist.
- A seeded universe of roughly 200 NSE stocks (Nifty 200 constituents).
- A simulator-only quote pipeline, with a provider-chain interface and a circuit breaker (which can stop repeated calls to a failing provider). Development checks found no usable free NSE provider: Twelve Data's free plan lacked NSE symbols and no keyless alternative worked. The interfaces remain available for a future provider; connecting one is outside the current scope.
- Cached OHLC candle series for the price chart, fetched on demand per interval with TTLs and daily pruning.
- Demand-driven quote refresh: refresh only symbols visible on screen, held, or referenced by an open order. The planned token-bucket limiter, which would restrict outbound request volume, remains unfinished because the local simulator makes no external requests.
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
- Dark-default and light themes from one token set. Brand and trading fill colours remain identical across themes; price-text colours change for readable contrast.
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

The product has two audiences, in priority order:

1. Recruiters and engineers evaluating the author's work. They need a working app with a convincing
   trading-terminal interface, plus clear technical decisions in the code and data model.
2. Learners, including students and first-time investors, who want to practise orders and understand
   margin and charges before using real money.

Neither group needs a Zerodha account. These docs also support the owner and AI agents maintaining
the project.

## Success Criteria

- A visitor with no account can read Home, About, Pricing and Support and submit the support form successfully.
- Signing in with Google produces a working session and lands on `/dashboard` with ₹1,00,000 available, a non-empty watchlist, and a generated client ID.
- The watchlist displays a price for every symbol within 3 seconds of the terminal loading, and that price visibly ticks and flashes.
- Every displayed price resolves accurate provenance — provider, provider timestamp, and whether the figure is interpolated — and the derived badge reads SIMULATED rather than overclaiming. `LIVE` and `DELAYED` are both unreachable in this build and the public copy says so.
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
