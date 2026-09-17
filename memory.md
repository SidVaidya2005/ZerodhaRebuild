# In-flight state

> Everything settled lives in `context/`. This file holds only what has no home there.

## In flight

- **F40 is three commits in and unfinished.** `README.md`, `docs/SETUP.md` and `scripts/capture-screenshots.mts` are written and committed (`6.40.01`–`6.40.03`); the account is reset. **No screenshot has been taken** — `docs/screenshots/` is empty and the README references five images that do not exist, so a push renders them broken. Next: run `pnpm capture:screenshots` with `OVERFLOW_GUARD_COOKIE` set, capture the order ticket by hand in a foregrounded window, then write the journal entry and tick F40. Four shots stay empty until a trading session (Mon–Fri 09:15–15:30 IST). `main` is 5 ahead of `origin/main`.

## Tried and rejected

- **Capturing the terminal through the Chrome extension tab.** The tab is backgrounded, which composites canvas content as blank and cannot open the order-ticket dialog at all — both now recorded in `constraints/verification.md`. The headless script is the path; the ticket is captured by hand.

## Open questions

- **Should a concurrency abort be distinguishable from a genuine row fault in `square_off_mis`'s returned counters?** `exception when others` counts a `40P01` deadlock as `faulted`, which is what made F29's inverted lock order look like a clean run. The lock order is fixed and `15-lock-order.sql` pins it, so this is no longer masking a known bug — but the two remain indistinguishable to anything reading the counters, and `match_open_orders` carries the identical handler. Deferred at the Phase 4 checkpoint, twice. **Asked, unanswered.**
- **Does the deployed app need an external pinger at all?** The Supabase free tier pauses after a week idle and `/api/health` reaches Postgres on every call, so a scheduler hitting it would keep the project warm. `pg_cron` already fires every minute during market hours — but whether Supabase counts *internal* `pg_cron` activity toward the idle timer is still unverified. Check that before building a pinger; if it counts, the problem disappears. Raised 2026-09-13, deliberately not built.
