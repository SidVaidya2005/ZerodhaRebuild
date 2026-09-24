# In-flight state

> Everything settled lives in `context/`. This file holds only what has no home there.

## In flight

- **The Phase 6 checkpoint is half done.** Its automated half ran on 2026-09-24 and passed; the production regression's sign-up and session-hours trade legs need the developer, listed in `phase-6.md` → Phase checkpoint. Tick it after those.

## Open questions

- **Should a concurrency abort be distinguishable from a genuine row fault in `square_off_mis`'s returned counters?** `exception when others` counts a `40P01` deadlock as `faulted`, which is what made F29's inverted lock order look like a clean run. The lock order is fixed and `15-lock-order.sql` pins it, so this is no longer masking a known bug — but the two remain indistinguishable to anything reading the counters, and `match_open_orders` carries the identical handler. Deferred at the Phase 4 checkpoint, twice. **Asked, unanswered.** The Phase 6 checkpoint is the last natural place to settle it.
- **Does the deployed app need an external pinger at all?** The Supabase free tier pauses after a week idle and `/api/health` reaches Postgres on every call, so a scheduler hitting it would keep the project warm. `pg_cron` already fires every minute during market hours — but whether Supabase counts *internal* `pg_cron` activity toward the idle timer is still unverified. Check that before building a pinger; if it counts, the problem disappears. Raised 2026-09-13, deliberately not built.
