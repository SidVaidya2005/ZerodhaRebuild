# Monday Run Sheet — 2026-09-07

> **Disposable.** Not part of the session read order and not in `context-cost.mts`'s lists. Delete it
> once the items below are ticked and the journal entries are written.
>
> **Why it exists:** seven outstanding items across F26, F27, F28 and F29 all need a live NSE session,
> and they are the only thing standing in front of the Phase 4 checkpoint. They are not a checklist —
> they have a forced order and two fixed clock times, and 15:20 happens once.

## Hard facts

| | |
| --- | --- |
| Session | 09:15–15:30 IST, Monday 2026-09-07 |
| Auto square-off | 15:20 IST — **unrepeatable that day** |
| `pg_cron` job | `market-tick`, `* 3-10 * * 1-5` (08:30–16:29 IST, weekdays) — verified active 2026-09-05 |
| Last tick before this | Friday 2026-09-04, 15:29 IST |
| Quote provider | simulator, so every price badges `SIMULATED`. Prices still move and still cross limits |

## What has to close

| # | Item | From | Closes when |
| --- | --- | --- | --- |
| 1 | A limit order placed just off the market fills within two minutes | F28 | trade row exists, `executed_at` within ~2 min of the crossing quote |
| 2 | A fill moves the row Open → Executed **with no reload** | F27 | row changes and `performance.getEntriesByType('navigation').length` is still 1 |
| 3 | Modifying an executed order is refused | F27 | action absent on the row **and** the RPC refuses directly |
| 4 | A market buy fills and appears in Holdings without a reload | F26 | `COMPLETE` toast naming the fill price, Holdings updated, navigation length still 1 |
| 5 | The 15:20 sweep runs in production | F29 | `is_auto_squareoff` trade written, position row gone |
| 6 | Sweep evidence captured | F29 | tick response body read **the same day** |
| 7 | §12 identities hold after the day's churn | checkpoint | identities 1, 3 and 8 all true for the account |

Items 3 and 5 in F27's list — the limit appearing under Open, and cancel restoring cash to the paisa —
already pass. The two left are the ones needing a **real fill**, which is why they are here; confirm
that reading against the page on the day rather than taking it from this sheet.

**Items 1 and 2 are the same event.** One resting limit order, filled with `/orders` open and
visible, closes both. That order then becomes the `COMPLETE` order item 3 needs. Plan for two orders
total in the morning, not four.

---

## Block A — before 09:15

1. **Check `document.cookie.length` first.** Over ~16 KB and `localhost:3000` returns HTTP 431 with no
   log line and no error page — a blank white screen that looks like a render bug. Clear foreign
   `sb-*` cookies from other Supabase projects, or start with `NODE_OPTIONS=--max-http-header-size=32768`.
2. **Kill any stale server by PID**, not `pkill`: `lsof -nP -iTCP:3000 -sTCP:LISTEN`. A survivor keeps
   port 3000 and serves the *previous* build, which has silently invalidated a verification pass twice.
3. `pnpm build && pnpm start`.
4. **Connect Brave to the Claude extension.** It was not connected on 2026-09-04, and that alone is why
   these items are still open.
5. Sign in. Record the account's starting `available_cash` and `used_margin` (query A below) — item 7
   needs a baseline, and reconstructing it afterwards is guesswork.
6. At 09:16, confirm the tick is alive: query B, `age` under two minutes. If it is stale, nothing below
   will fill and the problem is the tick, not the page.

## Block B — 09:15 to ~09:45

7. **Place the resting limit first**, so it has the session to fill in. A CNC **BUY LIMIT** just *below*
   the market — a fraction of a percent, not a rupee, or it may not cross all morning. Note the order id
   and the wall-clock time.
8. **Leave `/orders` open, foregrounded, and visible.** Before believing anything, evaluate
   `document.visibilityState` — it must read `visible`. A backgrounded tab dispatches no focus events,
   never reaches `animationend`, and can stop delivering synthetic clicks entirely; five features have
   lost time to this. Note `performance.getEntriesByType('navigation').length` **now**, so item 2 has a
   before-value.
9. While waiting, do item 4 **from `/dashboard`**: a small CNC **MARKET BUY**. Expect the toast to name
   the fill price, Holdings to show it, and the header's available cash to have moved — with navigation
   length still 1, so it cannot have been a reload. CNC, not MIS: MIS lands in Positions, not Holdings.
10. When the limit fills (items 1 + 2): the row moves Open → Executed with no reload. Capture the order
    id, `executed_at`, and the crossing quote's `fetched_at` — query C.
11. Item 3, on the order that just filled: the modify action must be **absent** on the row, and calling
    `modify_order` directly must also refuse. Both layers — the missing button is not the guard.

## Block C — 15:05 to 15:25 — the part that cannot be repeated

12. **By 15:10**, open an MIS position: a small MIS MARKET buy. It has to exist before 15:20 or there is
    nothing for the sweep to do.
13. **This is the first production run of the corrected lock order** (`20260905190000`). It is proven at
    tiers 2 and 3 but has never executed against a real position. Watch `/positions` across 15:20–15:22:
    the position should disappear within a minute of 15:20, since the job runs every minute.
14. Confirm the exit is flagged: query D, `is_auto_squareoff` true, position row gone.
15. **Capture the sweep evidence the same day** — query E. `pg_net` retains `net._http_response` for
    roughly six hours, so the tick's response body with its `squared`/`faulted` counts is gone by
    evening. `cron.job_run_details` (query F) is kept far longer but carries less.

## Block D — after 15:30

16. Item 7: query A again. Identities 1, 3 and 8 must all read true.
17. F27's DOM check at 375px, if it is still open — scroll region has `tabIndex` and a label, table has a
    `<caption>` and `scope` on every header. Lighthouse cannot audit a terminal page; it follows the
    redirect and scores the login page.
18. Write the journal entries and tick F26, F27, F28 in `progress-tracker.md` while the evidence is in
    front of you.

---

## Do not do these on Monday

- **`pnpm test:race` and `pnpm test:all` are off-limits during and near the session.** Tier 3 commits
  into this same database, `match_open_orders` sweeps *every* resting order and `square_off_mis` sweeps
  *every* open MIS position — so a run while you hold the resting limit from step 7 or the MIS position
  from step 12 would fill or square off your real order into your real ledger. The pre-flights are built
  to fail loudly on exactly this, but `test:all` chains tier 3 behind three green tiers and that is
  precisely when it gets run without thinking. Tiers 1, 2 and 4 are safe — 2 and 4 roll back or only read.
- **Do not reset the account mid-day.** It wipes the orders and trades the remaining items need as
  evidence. If something goes wrong, finish capturing, then reset.

---

## Queries

Find the account id once and reuse it: `select id, email, created_at from auth.users order by created_at;`

**A — funds baseline and §12 identities 1, 3, 8**

```sql
select f.available_cash,
       f.used_margin,
       f.available_cash = (select coalesce(sum(amount), 0) from public.fund_ledger where user_id = f.user_id)
         as identity_1_cash_equals_ledger,
       f.used_margin = (select coalesce(sum(blocked_margin), 0) from public.orders
                         where user_id = f.user_id and status = 'OPEN')
                     + (select coalesce(sum(blocked_margin), 0) from public.positions where user_id = f.user_id)
         as identity_3_margin,
       not exists (select 1 from public.orders
                    where user_id = f.user_id and status <> 'OPEN' and blocked_margin <> 0)
         as identity_8_retired
  from public.funds f
 where f.user_id = '<uid>';
```

**B — is the tick alive**

```sql
select symbol, ltp, fetched_at, now() - fetched_at as age, provider
  from public.quotes order by fetched_at desc limit 5;
```

**C — the day's orders and their fills**

```sql
select o.id, o.symbol, o.side, o.order_type, o.product, o.quantity, o.status,
       o.filled_quantity, o.blocked_margin, o.placed_at, o.executed_at,
       t.price as fill_price, t.charges, t.realised_pnl, t.is_auto_squareoff
  from public.orders o
  left join public.trades t on t.order_id = o.id
 where o.user_id = '<uid>' and o.placed_at >= current_date
 order by o.placed_at;
```

**D — the square-off actually happened**

```sql
select o.id, o.symbol, o.side, o.quantity, o.status, o.executed_at,
       t.is_auto_squareoff, t.realised_pnl
  from public.orders o join public.trades t on t.order_id = o.id
 where o.user_id = '<uid>' and t.is_auto_squareoff;

select count(*)::int as open_mis_positions
  from public.positions where user_id = '<uid>' and product = 'MIS' and net_quantity <> 0;
```

**E — the tick's own report (~6 hour retention, gather today)**

```sql
select id, status_code, left(content, 400) as body, created
  from net._http_response
 where created > now() - interval '2 hours'
 order by created desc limit 30;
```

**F — cron history (retained far longer, carries less)**

```sql
select runid, status, return_message, start_time, end_time
  from cron.job_run_details
 where start_time >= current_date
 order by start_time desc limit 40;
```
