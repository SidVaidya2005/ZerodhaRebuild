# Progress Tracker

> **Role:** Live build status — what's done, in progress, and next.
> **Read at the start of every session**; **update after every completed feature.**
> **Relates to:** mirrors `build-plan.md` exactly; evicts old decisions to `constraints.md`.

Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

## How this file is maintained

- **Current Status is overwritten, never appended.** It holds three lines describing only the latest state. Do not keep previous statuses here — the record of what happened lives in `build-journal.md`.
- **Progress checkboxes are edited in place** — tick the box for the completed feature. Never restate, duplicate, or re-list the checklist.
- **Key Decisions holds the 10 most recent decisions, newest first.** When adding an 11th, file the oldest bullet under its topic in `constraints.md`, so this section never exceeds 10. Eviction is a move, never a delete — an old decision can still bind.

---

## Current Status

**Phase:** Phase 4 — Trading Engine (Phase 2 remains open on F16 and its own checkpoint, both blocked on a live session)
**Last completed:** 26 Place order end to end — `placeOrder`, the copy module behind it, and the toast layer. Rejections, the resting LIMIT path, revalidation and both toasts verified in the browser; **the filled path waits for a live session**. Found and fixed a harness defect on the way: the first real order ever placed made `pnpm test:db` fail permanently, because `02-bootstrap.sql` empties `instruments` and nine tables reference it
**In progress:** nothing
**Next:** 27 Orders page — the four status tabs, `cancelOrder`/`modifyOrder`, and a Realtime subscription on `orders`. It has real data to render already: this account holds two REJECTED rows and one OPEN limit order left in place by F26's verification

**Not verified at this checkpoint, and deliberately so:** the build-plan's own Phase 3 criterion is that "ticking works unattended for a full market session". Today is Saturday 2026-08-22 — the market is closed and `pg_cron`'s window is weekdays only, so no unattended session can be observed. The Realtime half *was* verified: a production build, ten client-side navigations across all six terminal pages, exactly one `SUBSCRIBED` and no channel churn, then a live `UPDATE` reaching the browser. The unattended-session half rides along with F16's pending items on Monday

**Blocked until Monday 2026-08-24, first session after 09:15 IST.** F16's last two verify items, the Phase 2 checkpoint's own "prices land on a schedule", **and F26's filled path** — a market buy that completes and reaches Holdings with no reload — all need a live session, and the cron window is weekdays only. The account has ₹69,964.38 free, so there is room to place one. Check with one query:
```sql
select max(fetched_at) as newest, count(*) filter (where provider_ts is null) as simulator_rows,
       array_agg(distinct provider) as providers from quotes;
select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
```
Expect `fetched_at` advancing every minute across the 10 demanded symbols, every row `SIMULATOR` with a null `provider_ts`, and runs a minute apart with no 401s. Then replace the `PENDING` line in F16's journal entry, tick F16, compact the journal and close the phase

---

## Progress

### Phase 1 — Foundation & Public Site

- [x] 01 Project scaffold and tooling
- [x] 02 Design system and theme tokens
- [x] 03 Public layout shell
- [x] 04 Home page
- [x] 05 About page
- [x] 06 Pricing page
- [x] 07 Support page and contact form
- [x] 08 Legal, error, and not-found pages
- [x] Phase checkpoint — verify Phase 1 — Foundation & Public Site is stable before starting the next phase

### Phase 2 — Data Foundation & Auth

- [x] 09 Test harness
- [x] 10 Database schema: identity and market data
- [x] 11 Database schema: funds, orders, and portfolio
- [x] 12 Google sign-in and route protection
- [x] 13 Account bootstrap on first sign-in
- [x] 14 Instrument and holiday calendar seed
- [x] 15 Quote provider chain
- [ ] 16 Market tick Edge Function and schedule
- [ ] Phase checkpoint — verify Phase 2 — Data Foundation & Auth is stable before starting the next phase

### Phase 3 — Terminal Shell & Live Prices

- [x] 17 Terminal shell layout
- [x] 18 Watchlist sidebar
- [x] 19 Realtime quote store and tick interpolation
- [x] 20 Data source badge and provenance
- [x] 21 Dashboard home
- [x] Phase checkpoint — verify Phase 3 — Terminal Shell & Live Prices is stable before starting the next phase

### Phase 4 — Trading Engine

- [x] 22 Charge calculator
- [x] 23 Margin reservation and release
- [x] 24 Order execution function
- [x] 25 Order ticket UI
- [x] 26 Place order end to end
- [ ] 27 Orders page
- [ ] 28 Limit order matching
- [ ] 29 MIS auto square-off
- [ ] Phase checkpoint — verify Phase 4 — Trading Engine is stable before starting the next phase

### Phase 5 — Portfolio Pages

- [ ] 30 Holdings page
- [ ] 31 Positions page
- [ ] 32 Funds page
- [ ] 33 Stock detail page
- [ ] 34 Reports and trade history
- [ ] 35 Profile and settings
- [ ] Phase checkpoint — verify Phase 5 — Portfolio Pages is stable before starting the next phase

### Phase 6 — Polish & Ship

- [ ] 36 States, skeletons, and error boundaries
- [ ] 37 Responsive pass
- [ ] 38 Accessibility pass
- [ ] 39 Deploy
- [ ] 40 README, demo, and handoff
- [ ] Phase checkpoint — verify Phase 6 — Polish & Ship is stable before starting the next phase

---

## Key Decisions

- **A tier-2 suite that empties a reference table must empty its dependants too.** F26 made the app able to write `orders`, and the first real order turned `pnpm test:db` red permanently on `orders_symbol_fkey` — a failing test tier caused by using the product. The deletes roll back, so the fix is cheap; the bug it prevents is a suite whose result depends on what the account holds. (F26)

- **A rejection is `ok:false` with `code` set to the reason; a fault is the only thing that is not a normal return.** `place_order` hands back `REJECTED`, `OPEN` and `COMPLETE` identically, with `error` null in all three. Putting a rejection on the failure branch means every caller uses the one branch it already has and `code-standards.md`'s toast-on-failure rule applies unchanged. The rejected order's id is not returned — F27's page is where one is inspected. (F26)

- **A rejection closes the ticket.** The row is already filed as `REJECTED`; leaving the dialog open would imply it is still editable, and each retry would file another order. F25's inline `failure` state becomes unreachable and goes with it. (F26)

- **The success toast names the fill price, read back rather than returned.** One extra RLS-scoped select on `orders` after a `COMPLETE`. Widening `place_order`'s return would have meant a migration against a function already proven at three tiers, for one string. (F26)

- **F26's filled path is verified on the next trading day, and the feature ships without waiting for it.** Every MARKET order is rejected `MARKET_CLOSED` outside a session, so the rejection paths, the resting LIMIT order, the toasts and the revalidation are all checkable now; only `COMPLETE` waits. The fill itself is already proven at tiers 2–4. (F26)

- **An uncontrolled `type="number"` field has no single "empty" value, so the limit price is a `Controller` that maps empty to `null` at the field.** `''`, `null`, `undefined` and `NaN` all reached the schema depending on whether the user or `setValue` wrote last, and `Number(null)` is 0 — so a user who had typed nothing was told their price must be more than zero. Two tier-1 cases now pin `null` and `undefined` to the absence message and a typed `0` to the price message. **Found by using the form, not by a test**: every arithmetic path was already green. (F25)

- **The order ticket is mounted once in the terminal layout and opened through a `useOrderTicket` store.** Not premature: F18's watchlist panel renders twice — the `md` rail and the mobile sheet — so a per-row dialog would mount two copies of the same form for one symbol. Call sites get a button, not a dialog, which is what makes F31's exit-position flow three lines. (F25)

- **Margin shown in the ticket is position-aware, and proven exactly equal to the engine at tier 4.** `src/lib/trading/margin.ts` implements §6's reservation rules over the user's actual holding and MIS position; the naive notional figure would tell a user covering a 100-share short that they need ₹10,029 where the engine reserves ₹29. The build-plan's "within one paisa" is corrected to exact — the looser bar hides the drift the test exists to catch. (F25)

- **The ticket fetches the symbol's holding and position when it opens**, one RLS-scoped query, rather than server-rendering the whole portfolio into every terminal page. Fresh by construction — it reflects a fill from another tab — and one round trip per open rather than per keystroke. The margin panel shows a skeleton while it resolves. (F25)

- **F25 ends at an injected `onSubmit` prop; F26 supplies the action.** The whole ticket becomes tier-1 testable with no database, and the double-submit guard is a UI concern that belongs in the ticket either way. F25's verify item becomes "double-clicking calls the handler exactly once", which is what it was testing. (F25)
