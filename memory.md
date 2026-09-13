# In-flight state

> Everything settled lives in `context/`. This file holds only what has no home there.

## In flight

- **The 6.00.05 doc pass is written but uncommitted** — 8 files under `context/`, recording that the simulator is the whole quote chain permanently. No code changed. Commit as `6.00.05`; the phase-6 `00` counter is at `04`. Also, `3d561c7` is **1 ahead of origin** and unpushed.

## Tried and rejected

- **Nothing durable.** Three approaches failed during the session and are already recorded as constraints rather than here: `corepack enable` on Render (read-only `/usr`), and twice overriding a `NEXT_PUBLIC_*` variable at runtime to falsify a check — which cannot work, because those values are inlined at build time. See `constraints.md` → Deployment.

## Open questions

- **Should a concurrency abort be distinguishable from a genuine row fault in `square_off_mis`'s returned counters?** `exception when others` counts a `40P01` deadlock as `faulted`, which is what made F29's inverted lock order look like a clean run. The lock order is fixed and `15-lock-order.sql` pins it, so this is no longer masking a known bug — but the two remain indistinguishable to anything reading the counters, and `match_open_orders` carries the identical handler. Deferred at the Phase 4 checkpoint, twice. **Asked, unanswered.**
- **Is `constraints.md`'s "budget is now saturated" line still true?** It says the always-read set is at its 40k ceiling and adding a line means evicting one. Measured 2026-09-13, `pnpm context:cost` reports **~34.2k of 40k** — about 6k of headroom. Either the line is stale or the intent was a softer ceiling than the guard enforces. Worth settling at the Phase 6 checkpoint, since it governs how every future constraint gets filed.
- **Does the deployed app need an external pinger at all?** The Supabase free tier pauses after a week idle and `/api/health` reaches Postgres on every call, so a scheduler hitting it would keep the project warm. But once **F16** ships, `pg_cron` fires every minute during market hours — and whether Supabase counts *internal* `pg_cron` activity toward the idle timer is unverified. Check that before building a pinger; if it counts, the problem disappears. Raised 2026-09-13, deliberately not built.
