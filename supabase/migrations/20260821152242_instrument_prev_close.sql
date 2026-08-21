-- The simulator's starting price.
--
-- `library-docs.md` said the simulator seeds "from the last known `quotes` row
-- for the symbol; if none exists, from `instruments` reference data" — but this
-- table carried no price, so on a cold start there was nothing to walk from and
-- every symbol would have had to begin at an invented constant. ₹1,000 for both
-- MRF and YESBANK makes the whole terminal read as a toy, and Phase 5's
-- portfolio figures become meaningless.
--
-- This is the last real NSE close, taken from the published bhavcopy archive
-- (`nsearchives.nseindia.com`, the same host as the constituent list — the
-- archive, not the API that answers 403). It is **a seed, never a quote**: no
-- `NSE_BHAVCOPY` value joins `quote_provider`, nothing writes it into `quotes`,
-- and no surface renders it as a price. Every price the app shows still comes
-- from a provider row carrying `provider = 'SIMULATOR'` and a null
-- `provider_ts`, which `deriveSource()` renders as SIMULATED.
--
-- Nullable on purpose. A symbol that has never traded — a fresh listing between
-- one bhavcopy and the next — has no close, and the simulator reports itself
-- unavailable for it rather than inventing a base price.

alter table public.instruments
  add column prev_close numeric(14, 2);

comment on column public.instruments.prev_close is
  'Last published NSE close, from bhavcopy. Seeds the simulator; never displayed as a price and never written to quotes.';

-- A price that is zero or negative is not a price. Null is the honest value for
-- "not known yet", and is what the constraint deliberately permits.
alter table public.instruments
  add constraint instruments_prev_close_positive
  check (prev_close is null or prev_close > 0);
