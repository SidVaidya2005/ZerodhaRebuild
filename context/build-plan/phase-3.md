> **One phase of `context/build-plan.md`.** That index carries the Core Principle and the phase list.
> **Read only the phase you are building.** A finished phase is history — its still-binding decisions
> live in `constraints.md`, its narrative in `build-journal.md`, and re-reading it here costs tokens for nothing.

## Phase 3 — Terminal Shell & Live Prices

### 17 Terminal shell layout

The chrome every terminal page sits inside, and placeholder pages for all eight guarded routes so
navigation never 404s. A layout feature: no prices, no watchlist contents, no dashboard widgets.

**UI:**

- Top nav: logo, index-strip slot, nav links, funds summary, avatar menu.
- **The index strip ships as a slot with no values.** NIFTY 50, SENSEX and BANK NIFTY exist nowhere
  in the data — `instruments` holds 200 NSE equities, so there is no row, no quote and no simulator
  anchor for any of them, and SENSEX is BSE against an NSE-only scope. Three invented numbers in the
  most prominent chrome on the page is the worst place in the app to fabricate data. The strip
  renders its labels and an explicit awaiting-source state; **index data moves to F21**, where
  `project-overview.md` already puts an index strip.
- Left watchlist sidebar container, collapsing to a shadcn `Sheet` under 768px per `DESIGN.md`. Its
  contents are F18's; F17 ships the container and an empty state.
- Content region at the system's dense type scale (`--text-body`, `--text-number` in tables).
- **Market status pill: PRE-OPEN / OPEN / CLOSED with the next transition time, recomputed on a
  timer.** It is F17's, not F20's — F20's UI and Logic bullets are entirely the data-source badge
  despite its title. A server-rendered-once pill leaves a tab open past 15:30 still reading OPEN, so
  the server passes the holiday set as a `string[]` and a client component calls the same pure
  `marketStatusAt` the tick gates on.

**Logic:**

- `(terminal)` route-group layout: `getUser()` and redirect on absence, then load profile, funds and
  the holiday calendar once and compose the shell.
- **The layout checks the session; pages trust it.** `dashboard/page.tsx` re-checked it itself on the
  argument that `src/proxy.ts` is only a convenience; with a layout that buys nothing, because every
  page beneath reads through RLS-scoped queries that return nothing without a session. One
  `getUser()` per navigation, and no future page can forget.
- `msUntilNextRecompute(status, now)` in `src/lib/terminal/pill.ts` — `min(30s, nextTransition - now)`
  so the pill flips *on* the boundary rather than up to 30 seconds late. Pure, so tier 1 can drive it.
- Placeholder pages for `/orders`, `/holdings`, `/positions`, `/funds`, `/reports`, `/settings` and
  `/stocks/[symbol]`, plus `/dashboard` rewritten as one — a shared `TerminalPlaceholder` keeps them
  thin, as F03 did for the public routes.

**Verify:**

- **Every guarded prefix has a page** — a tier-1 test maps each `TERMINAL_PREFIXES` entry to a file
  on disk. This catches the real failure, a prefix added to the guard with no route behind it, which
  a manual click-through would only find by accident.
- `pnpm build` lists all eight terminal routes.
- **The pill flips on the boundary** — tier 1 on `msUntilNextRecompute`: 30s mid-session, the exact
  remainder near a transition, never negative or past the transition.
- The pill agrees with the tick's gate because it calls `marketStatusAt` directly, already covered by
  the tier-1 market-hours suite; confirm in the browser that it reads CLOSED outside a session.
- Signed out, `/orders` redirects to `/auth/login?next=/orders`.
- The shell holds at 1440px and 375px, and the sidebar sheet opens and closes on mobile.
- **Terminal a11y is not audited here.** Lighthouse cannot reach these routes — they redirect to
  login without a session — so landmarks and contrast are checked by reading, and the audit is F38's.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` and `pnpm format:check`
  all exit zero.

### 18 Watchlist sidebar

The real contents of `WatchlistPanel` — the one component F17 left both the desktop rail and the
mobile sheet rendering. One list per user: `watchlist_items` is flat, scoped by `user_id`, with no
`watchlists` table. Prices are server-rendered and hold still until reload; **F19 owns liveness.**

**UI:**

- Rows: symbol, exchange tag, LTP, absolute and percentage change, coloured by direction.
  - The change is computed against `quotes.prev_close`, which **rolls at the first tick of each
    session** — `roll_previous_close()`, added at the Phase 2 checkpoint. Before that it was the
    frozen bhavcopy seed, so this column would have divided by the day the universe was seeded and
    the simulator's ±5% band was pinned to the same value. Nothing further is needed here; F30's
    holdings day change and F33's header read the same rolled column.
  - **The change is computed in Postgres, never in TypeScript.** A `watchlist_rows` view joins
    `watchlist_items → instruments → quotes` and returns the change and its percentage already
    calculated, per `CLAUDE.md`'s money rule. It also makes the panel one round trip and gives F30
    and F33 the same shape to read.
- Search input opening a `Command` palette over the instrument universe.
  - **The universe is preloaded and filtered in `cmdk`, with no index and no migration.** 200 rows of
    symbol/name/exchange is ~12KB, and Postgres seq-scans a table that small whatever index sits on
    it — a trigram index here would never be used. This removes the per-keystroke round trip the
    300ms budget was written for. Symbols already on the list are excluded from the results.
- Hover reveals remove and chart actions. **B and S are deliberately not built here**: order entry is
  F25/F26 and has no destination yet, so shipping them would mean two dead controls — the same call
  F17 made for the index strip. The chart action links to `/stocks/[symbol]`, which F17 stubbed.
- **Reorder ships as move-up / move-down, not drag.** Drag alone is unreachable by keyboard and the
  project has no drag-and-drop dependency; buttons are accessible by construction and write the same
  `sort_order` drag would. Drag becomes a later enhancement over the same Server Action, and F38
  inherits a passing surface rather than a filed gap.
- Empty state when the watchlist is cleared.

**Logic:**

- `addToWatchlist`, `removeFromWatchlist`, `reorderWatchlist` Server Actions in
  `src/server/actions/watchlist.ts`, each Zod-parsed and returning `ActionResult<T>`.
- **Each action calls an RPC rather than writing through PostgREST.** `sort_order` assignment and the
  reorder swap are set-based SQL that PostgREST cannot express, and doing them as read-then-write
  would race. The functions are invoker-rights and scoped to `(select auth.uid())`, so RLS remains
  the boundary.
- **Existing rows must be renumbered.** The F16 backfill inserted 10 symbols at the column default
  `sort_order = 0`, so ordering currently falls through to the symbol tiebreak and a naive swap is a
  no-op. The migration renumbers densely per user, and `move_watchlist_item` renumbers defensively
  before swapping.
- `touch_symbol_demand(p_symbols text[])` — the client RPC `code-standards.md` already carves out as
  one of exactly two Server Action exceptions. `security definer`, because `symbol_demand` has no
  client write grant by design; refuses without a session, upserts `last_requested_at` only — never
  `priority` — and ignores unknown symbols. Fired from an effect keyed on the symbol list, once per
  change and never per tick.
- Revalidation lists the terminal paths explicitly rather than revalidating the layout, per
  `code-standards.md`. `/stocks` needs `revalidatePath('/stocks/[symbol]', 'page')` — a prefix string
  does not match a dynamic segment.

**Verify:**

- Adding a symbol persists across reload; removing it persists too.
- **Reordering survives a reload in the new order** — run against the backfilled rows, which all
  start at `sort_order = 0`, so this also proves the renumbering rather than assuming it.
- Typing "rel" surfaces RELIANCE with no request in flight, because filtering is local.
- Symbols on screen appear in `symbol_demand` with a fresh `last_requested_at`.
- **The RPC cannot be abused** — tier 2: no session refuses, an unknown symbol is ignored, `priority`
  is unchanged, and no user can write into another user's watchlist through any of the four
  functions or read another's rows through the view.
- The change is computed in Postgres — confirmed by reading the view definition and by no
  subtraction of prices appearing in any `.tsx`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` and `pnpm format:check`
  all exit zero.

### 19 Realtime quote store and tick interpolation

The feature that makes the terminal feel alive. F18's rows are deliberately static; this is what
moves them, with no reload and no polling.

**UI:**

- LTP cells flash green on an up-tick and red on a down-tick, then fade. The flash fires on a
  **changed** anchor, not on every server write — a tick that rewrites the same price is not an
  up-tick. Flash classes are written out literally, because interpolated Tailwind class names
  generate no CSS.
- Values move smoothly between server refreshes rather than jumping once a minute.
- **The day change is recomputed on the client from the live price and `prevClose`**, so a ticking
  price never sits beside a frozen change. Display-only and never persisted — `CLAUDE.md`'s money
  rule forbids computing a figure in TypeScript *and storing it*, and `library-docs.md`'s `LiveQuote`
  already carries `prevClose` for exactly this.

**Logic:**

- Zustand quote store per `library-docs.md`, holding `anchor`, `ltp`, `prevClose`, `provider`,
  `providerTs` and `direction`. **`source` is never stored** — `deriveSource()` runs on render,
  because freshness changes with the clock and a stored value goes wrong with no state change.
- A single Supabase Realtime subscription on `quotes` mounted once in the terminal layout, filtered
  `symbol=in.(…)` **server-side** and rebuilt when the visible symbol set changes. Subscribing
  broadly and filtering in the callback would have every row delivered to and authorised for every
  subscriber, defeating the demand-driven model the quote pipeline is justified by.
- One `requestAnimationFrame` driver, mounted once, **easing each price from its previous anchor to
  its new one over ~800ms**. The loop moves prices *between* server anchors and invents nothing:
  `architecture.md` → Interpolated values is authoritative here, and an earlier draft of this bullet
  described bounded jitter around the anchor, which would have put figures on screen that no provider
  reported and the market never traded at.
- **The bound is an interval, not a band.** The displayed value always lies on the closed segment
  between the previous and current anchor. That is strictly stronger than "within X% of the anchor"
  and is directly testable without a DOM.
- **Rows read `store ?? prop`, and the store is seeded from the server-rendered props in an effect.**
  Server and first client render both use the prop, so the HTML matches exactly — the lesson F17's
  `serverNow` pill taught. A symbol with no `quotes` row keeps its em dash rather than flashing into
  existence.
- Channel cleanup on unmount. An unremoved channel leaks across navigations and hits the free-tier
  concurrent connection cap.

**Verify:**

- **A SQL `update` on one `quotes` row visibly moves the browser value within two seconds, with no
  reload** — performed directly against the database, because nine of the ten seeded symbols have no
  quote row yet and waiting on the tick would prove nothing.
- **Only the affected row changes** — a `MutationObserver` over the list asserts mutations land in the
  updated row's subtree and nowhere else. This checks the visible outcome rather than a React DevTools
  render count, which cannot be read from an automated session.
- Navigating between terminal pages ten times leaves exactly one open Realtime channel —
  `supabase.getChannels().length`.
- **Interpolated values never leave the anchor interval** — tier 1 over many elapsed values, including
  a falling pair and an elapsed past the duration, asserting the result stays within
  `[min(from, to), max(from, to)]`.
- The flash fires on a change and not on every write — tier 1: the same price applied twice yields
  `direction: 'flat'`.
- Price and change agree — tier 1 on the recompute helper against a known anchor and `prevClose`.
- **No decision surface reads an interpolated value** — confirmed by reading: only the watchlist reads
  `ltp`, and `architecture.md` lists the surfaces that must read `anchor` instead.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` and `pnpm format:check`
  all exit zero.

### 20 Data source badge and provenance

**The market-status half of the original title was built in F17** — the pill reads PRE-OPEN / OPEN /
CLOSED and recomputes on a timer that lands on the session boundary. What remains, and what this
feature is, is the data-source half.

**UI:**

- A shell badge reading SIMULATED, DELAYED or STALE — the worst provenance among the prices actually
  on screen — beside the market-status pill, explaining on hover what it means and why.
- Per-price provenance anywhere a price appears: provider, provider timestamp, fetch time, whether
  the figure is interpolated, and the true anchor when it is.
  - **Announced, not merely hoverable.** The same facts render as `sr-only` text tied to the price by
    `aria-describedby`, because hover does not exist on touch and never fires for a screen reader.
    "No price without accessible provenance" has to hold in both.
  - A reusable `<PriceWithProvenance>`, not markup inlined into the watchlist row — F21, F30 and F33
    each add price surfaces and must not each reinvent the disclosure.
- Stale prices visually muted once `deriveSource` returns `STALE`. **Only STALE.** Every price in
  this build is simulated, so muting SIMULATED would render the whole terminal grey and the treatment
  would stop carrying information; the badge and the per-price disclosure carry that honesty instead.

**Logic:**

- `deriveSource()` recomputed on render, never read from a stored column. `quotes` has no `source`
  column by design: freshness is a function of the current time, so a row written as LIVE is stale
  minutes later with no write to invalidate it.
- **One ticking clock, provided from the layout**, so the badge and every price read the same instant
  and a row can never render DELAYED under a badge saying STALE. A 30s heartbeat is ample against a
  15-minute delayed window. **F17's pill keeps its own timer** — it deliberately lands *on* the
  session boundary rather than up to 30s late, which a coarse freshness heartbeat would undo.
- **Only symbols currently rendering a price feed the badge.** `worstSource([])` returns STALE by
  design, so counting the symbols with no quote row would pin the badge to STALE on account of absent
  data and say nothing about the prices actually visible. A row showing an em dash makes no claim and
  cannot be dishonest.
- `fetchedAt` is carried through the `watchlist_rows` select, `WatchlistRow`, `LiveQuote`, the seed
  and the Realtime payload — F19 did not need it and provenance does.
- `isInterpolated` is derived as `ltp !== anchor`, never stored.

**Verify:**

- **With Yahoo as provider the badge reads DELAYED, not LIVE** — asserted in tier 1, because a LIVE
  badge over a polled endpoint is the failure this feature exists to prevent. `LIVE` is structurally
  unreachable in this build and the test is what keeps it that way.
- The badge reports the worst source on screen — tier 1 on the reducer: a SIMULATED + STALE mix
  yields STALE, and unpriced symbols do not drag it.
- **Freshness is derived rather than frozen** — plant a `YAHOO` row aged past the delayed window,
  hold the tab open, and watch the badge flip to STALE with no new server data. Neither STALE nor
  DELAYED occurs naturally here, since every quote is `SIMULATOR`, so both are planted and restored.
- **No price renders without accessible provenance** — a DOM sweep asserting every price cell has an
  `aria-describedby` that resolves to non-empty provenance text.
- An interpolated figure reports `isInterpolated: true` and shows the true anchor beside it — tier 1
  on the derivation, browser for the rendering.
- Stale prices are muted and simulated ones are not — read from the planted row's class list.
- The badge and the rows agree, read from the same DOM snapshot.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` and `pnpm format:check`
  all exit zero.

### 21 Dashboard home

The portfolio read, and the first page in the project whose whole job is money. **Nothing writes
`holdings`, `orders` or `trades` until F24**, so every real user hits the empty state today and the
populated path is verified against rows planted by SQL. That is expected rather than a gap: the
aggregation has to exist and be proven correct before the engine that fills it arrives.

**UI:**

- Summary cards: total portfolio value, invested amount, overall P&L, day's P&L, available cash.
  - `portfolio value = available_cash + Σ(quantity × ltp)` — cash included, because a dashboard that
    reported only stock would drop a fifth of a fresh account's money off its own headline figure.
  - `invested = Σ(quantity × average_price)`. Charges are already capitalised into `average_price`
    (`trading-contract.md` §8), so they are not added again here.
  - `overall P&L = market value − invested`. Unrealised only; realised P&L is Reports' figure (F34).
  - `day's P&L = Σ quantity × (ltp − prev_close)` — the same basis as the watchlist's change column,
    so the two cannot disagree on screen. Recorded in `trading-contract.md` §9 by this feature,
    which is where money definitions live and where it was missing.
- **Unpriced holdings are disclosed, never zeroed.** A held symbol with no `quotes` row cannot
  contribute a market value, and treating that as zero understates the portfolio silently. The
  summary carries an unpriced count and the tiles say so.
- Top-10 holdings donut with an "Others" bucket, ranked by market value.
- **The index strip becomes a derived composite, not a named index.** NIFTY 50 and BANK NIFTY have no
  row, quote or simulator anchor anywhere — F17 shipped the slot empty for exactly that reason, and
  Yahoo (`^NSEI`) is deferred to the end of the project. The strip renders an equal-weighted mean of
  per-symbol day change % across every priced symbol, with advances/declines/unchanged and its
  **constituent count on screen**, so "10 of 200 priced" can never be read as the Nifty 200. A
  breadth statistic, labelled as one.
- Recent-orders list.
- A distinct empty state for a user who has **never traded** — no `holdings` rows *and* no `orders`
  rows — pointing at the watchlist. A user who traded and closed out sees zeroes and their order
  history instead, because that account has a history and the empty state would deny it.

**Logic:**

- Server-side aggregation in three `security_invoker` views: `portfolio_holdings`
  (holdings ⋈ instruments ⋈ quotes), `portfolio_summary` (the tile figures plus the unpriced count,
  joined to `funds`), and `market_composite`. **No view carries a predicate of its own** — RLS
  through `security_invoker` is the boundary, per the correction F18 made to `watchlist_rows`.
- **Tiles jump on anchor and never tween.** `architecture.md`'s invariant — every monetary total
  renders the server anchor, never an interpolated value — outranks its own line 517, which listed
  the dashboard tiles as an ambient surface. That line is corrected in this change; the index strip
  stays on it. The recompute is display-only and reaches nothing, exactly as F19's `dayChange` does.
- **Held symbols join the terminal channel.** `QuoteChannel` filters server-side on the watchlist, so
  a holding that is not watched would never tick. The layout unions held symbols into both the filter
  and the seed — F30 and F31 need the same union.
- **The composite does not recompute on the client.** It averages over every priced symbol in the
  universe, but a user's store holds only their own watchlist; a client recompute would silently
  change the constituent set and report a different number under the same label. It is a server
  figure, restated on navigation, and its provenance is derived **pessimistically** — the worst
  provider paired with the oldest timestamp — so it can never overclaim.
- Holdings only. MIS positions stay on `/positions` (F31), which is Kite's own split.
- Recharts 3.10.1, per the stack table and the worked donut in `library-docs.md` § Recharts: `shape`
  for per-slice colour, the `--color-chart-*` ramp, never `--color-up`/`--color-down`.

**Verify:**

- **With planted holdings, the card totals match a hand-computed figure** — two holdings and a quote
  inserted by SQL, the five figures computed by hand, read off the rendered page, rows deleted. The
  only check that can prove the SQL, since nothing writes `holdings` yet.
- **No interpolated value enters a total** — tier 1 asserts the recompute helper reads `anchor`, and
  confirmed by reading that no tile is passed `ltp`.
- **A tile moves on a tick with no reload** — a SQL `update` to a planted holding's `quotes` row
  changes the portfolio-value tile within two seconds. This proves the channel union works for a
  symbol that is deliberately *not* on the watchlist, which is the part that can silently fail.
- **The donut shows the correct ten by market value** — tier 1 on the bucketing helper: eleven
  holdings yield ten named slices plus an `Others` equal to the eleventh, ranked by market value
  rather than quantity.
- **A fresh account sees the empty state** — a user with no holdings and no orders in the browser;
  and a user with orders but no holdings sees zeroes and the list, not the empty state.
- **Unpriced holdings are disclosed** — plant a holding whose symbol has no `quotes` row; the page
  states the count rather than dropping it silently out of portfolio value.
- **The composite never claims to be an index** — a grep asserts no `NIFTY`/`SENSEX` string renders
  as a value, and the constituent count is on screen beside the figure.
- **The composite's provenance is pessimistic** — tier 1: mixed providers with one stale constituent
  yields STALE.
- **RLS is falsifiable on all three views** — pgTAP: turning `security_invoker` off must start
  leaking another user's rows. A view whose isolation survives that flip is not being tested.
- **No price renders without accessible provenance** — F20's DOM sweep, re-run over `/dashboard`.
- **The chart ramp is accessible** — each of the ten slice colours checked for 3:1 against both
  `--color-canvas` values and for distinguishability under deuteranopia, closing the TODO
  `library-docs.md` left against this dashboard.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:db`, `pnpm build` and `pnpm format:check`
  all exit zero, and `pnpm audit:a11y /dashboard` scores as the other pages do.

### Phase checkpoint

The terminal looks and feels like a real trading front end with live prices. Confirm ticking works unattended for a full market session and no Realtime channels leak.

---


