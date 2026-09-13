# In-flight state

> Everything settled lives in `context/`. This file holds only what has no home there.

## Open questions

- **Should a concurrency abort be distinguishable from a genuine row fault in `square_off_mis`'s returned counters?** `exception when others` counts a `40P01` deadlock as `faulted`, which is what made F29's inverted lock order look like a clean run. The lock order is fixed and `15-lock-order.sql` pins it, so this is no longer masking a known bug — but the two remain indistinguishable to anything reading the counters, and `match_open_orders` carries the identical handler. Deferred at the Phase 4 checkpoint, twice. **Asked, unanswered.**
- **Is `constraints.md`'s "budget is now saturated" line still true?** It says the always-read set is at its 40k ceiling and adding a line means evicting one. Measured during F38, `pnpm context:cost` reports **~32.8k of 40k** — about 7k of headroom. Either the line is stale or the intent was a softer ceiling than the guard enforces. Worth settling at the Phase 6 checkpoint, since it governs how every future constraint gets filed.
