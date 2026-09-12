# In-flight state

> Everything settled lives in `context/`. This file holds only what has no home there.

## Open questions

- **Should `constraints.md` be split before F36 starts, or later?** The always-read tier sits at ~39,758 of 40,000 — roughly 240 tokens, so the next feature that needs to record anything must evict something first. *What* to do is decided and in Key Decisions (split into an always-read core plus on-demand topic files, the way `verification.md` and `supabase-cli.md` already were, via `/review-context`). *When* is not: nobody has scheduled it, and F36 will hit the ceiling. **Unscheduled.**
- **Should a concurrency abort be distinguishable from a genuine row fault in `square_off_mis`'s returned counters?** `exception when others` counts a `40P01` deadlock as `faulted`, which is what made F29's inverted lock order look like a clean run. The lock order is fixed and `15-lock-order.sql` pins it, so this is no longer masking a known bug — but the two remain indistinguishable to anything reading the counters, and `match_open_orders` carries the identical handler. Deferred at the Phase 4 checkpoint, twice. **Asked, unanswered.**
