/**
 * Values both runtimes need.
 *
 * They live here rather than in `src/lib/constants.ts` because an Edge Function
 * runs on Deno and cannot resolve the `@/` alias. `src/lib/constants.ts`
 * re-exports every one of them, so app code still has a single import site and
 * `code-standards.md` → Import Conventions still holds: these values are never
 * inlined at a call site.
 *
 * Keep this file free of imports so both runtimes can load it unchanged.
 */

/**
 * Asia/Kolkata's fixed offset from UTC, in minutes.
 *
 * India has observed no daylight saving since 1945, so this is exact rather than
 * an approximation — and `market-hours.test.ts` checks it against `Intl` across
 * the year instead of asking the reader to take it on trust.
 */
export const IST_OFFSET_MINUTES = 330

/** NSE's pre-open call auction. Not stated in the project docs — see F15. */
export const PRE_OPEN_START_IST = 9 * 60

/** Continuous trading opens. `project-overview.md`: 09:15–15:30 IST. */
export const MARKET_OPEN_IST = 9 * 60 + 15

/** Continuous trading closes. */
export const MARKET_CLOSE_IST = 15 * 60 + 30

/** `trading-contract.md` §10: every open MIS position is exited at or after this. */
export const SQUARE_OFF_TIME_IST = 15 * 60 + 20

/**
 * How many symbols one tick may refresh.
 *
 * The bound is on the batch, never on the size of the universe: the run has to
 * finish well inside ten seconds, and — once a real provider exists — a burst
 * across the whole universe is precisely the traffic shape that got Yahoo to
 * block this machine for forty minutes during F14.
 */
export const MAX_SYMBOLS_PER_TICK = 50

/* ── Quote freshness ────────────────────────────────────────────────────────
 *
 * These three are **unmeasured**. `architecture.md` carries a standing TODO to
 * measure Yahoo's real `regularMarketTime` lag during an open session, which
 * cannot be done while Yahoo is deferred to the end of the project. Revisit them
 * from data the first time a real provider runs during market hours.
 */

/**
 * A fill may not use a quote older than this (`trading-contract.md` §5).
 * Deliberately stricter than the display windows below, because this one decides
 * whether money moves rather than what a badge says.
 */
export const QUOTE_STALE_AFTER_MS = 5 * 60 * 1000

/** Beyond this age a displayed price badges STALE rather than DELAYED. */
export const QUOTE_DELAYED_WINDOW_MS = 15 * 60 * 1000

/**
 * Inert by construction: a quote can only badge LIVE if its provider declares
 * itself realtime, and none does. The window exists so the rule is expressible.
 */
export const QUOTE_LIVE_WINDOW_MS = 5 * 1000

/* ── Simulator ──────────────────────────────────────────────────────────────*/

/** The random walk never strays further than this from its session anchor. */
export const SIMULATOR_MAX_MOVE_PCT = 0.05

/** Standard deviation of a single simulated step, as a fraction of price. */
export const SIMULATOR_STEP_VOLATILITY = 0.0015
