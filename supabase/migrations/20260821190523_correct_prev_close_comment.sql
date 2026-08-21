-- Say what `instruments.prev_close` actually does.
--
-- `20260821152242` claimed "never written to quotes", and the Phase 2 review
-- found the tick writing exactly that: the simulator reports the close as its
-- quote's `prevClose`, and `market-tick` persists it to `quotes.prev_close`.
-- Every one of the 50 rows written so far carries it byte-for-byte.
--
-- **The write is right and the sentence was wrong.** `quotes.prev_close` means
-- "the previous session's close", and on a simulated market the last real NSE
-- close is the only truthful value it can hold. What the original invariant was
-- protecting is narrower and still holds absolutely: the bhavcopy figure is
-- never an `ltp`, there is no `NSE_BHAVCOPY` value in `quote_provider`, nothing
-- derives provenance from it, and no surface renders it as a live price. Every
-- price still comes from a row with `provider = 'SIMULATOR'` and a null
-- `provider_ts`, which `deriveSource()` badges SIMULATED.
--
-- The migration file itself is left alone — it is applied history, and rewriting
-- an applied migration to make it look correct is worse than superseding it.
--
-- **Open, and filed against Phase 3:** this column is a static seed, refreshed
-- only by a manual `pnpm fetch:reference` + `pnpm seed`. Nothing rolls it at a
-- session boundary, so `quotes.prev_close` never advances — a day-change
-- percentage computed from it would be measured against a frozen close, and the
-- simulator's ±5% band is anchored to the same frozen value, capping every
-- simulated price forever. F19/F20 must not render a day change until that is
-- resolved. See `constraints.md` → Quote providers.

comment on column public.instruments.prev_close is
  'Last published NSE close, from bhavcopy. Seeds the simulator''s walk and anchors its ±5% band, and is written to quotes.prev_close as the previous close. Never an ltp, never a quote_provider value, never rendered as a live price. Static until reseeded — nothing rolls it at a session boundary (open, filed against Phase 3).';
