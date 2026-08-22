/**
 * Fixed values shared across the app. `code-standards.md` → Import Conventions
 * requires every such value to live here rather than being inlined at a call
 * site, so a rate or a key can only change in one place.
 *
 * The remaining trading constants — SQUARE_OFF_TIME_IST, SHORT_MARGIN_BUFFER —
 * land here alongside the features that introduce them.
 */

/**
 * Simulated cash every account is credited with on first sign-in, in rupees.
 * `trading-contract.md` §11 also restores this exact figure on account reset.
 *
 * It lives here rather than in the marketing copy because `code-standards.md`
 * names it as a value that must never be inlined — the home page and the
 * bootstrap trigger have to be reading the same number, four phases apart.
 */
export const OPENING_BALANCE = 100000

/** Where the visitor's dismissal of the simulator disclaimer is remembered. */
export const DISCLAIMER_STORAGE_KEY = 'zr-disclaimer'

/**
 * Stamped on <html> by the blocking script in the root layout and read by the
 * CSS rule that hides the banner. The attribute exists so the strip can be
 * hidden before first paint, which a React state read cannot do.
 */
export const DISCLAIMER_ATTRIBUTE = 'data-disclaimer'
export const DISCLAIMER_DISMISSED = 'dismissed'

/* ───────────────────────────────────────────────────────────────────────────
   CHARGE RATES

   Authoritative table: `context/trading-contract.md` §3. These are the figures
   the order engine applies, and feature 22 must give its Postgres calculator
   the identical set.

   Source: https://zerodha.com/charges/ — every rate below confirmed 2026-08-21,
   re-confirmed 2026-08-22 at the start of Phase 4, all unchanged.

   Most of these are statutory: STT, stamp duty, the SEBI fee, exchange
   transaction charges and GST are set by regulators and the exchange, not by a
   broker, and they change by circular. Re-check at the start of any phase that
   touches money, and after a Union Budget. The exchange transaction rate has
   already moved once during this project (0.00297% → 0.00307%).

   Rates are decimal fractions, never percentages — `code-standards.md` and
   `trading-contract.md` §2 both require it. 0.0003 is 0.03%.
   ─────────────────────────────────────────────────────────────────────────── */

/** Delivery is free. */
export const BROKERAGE_CNC_RATE = 0

/** Intraday: 0.03% of turnover, capped — whichever is lower. */
export const BROKERAGE_MIS_RATE = 0.0003
export const BROKERAGE_MIS_CAP = 20

/** Securities Transaction Tax. Delivery charges both sides; intraday sells only. */
export const STT_CNC_RATE = 0.001
export const STT_MIS_SELL_RATE = 0.00025

/** NSE exchange transaction charge, 0.00307%. Same on both products and sides. */
export const EXCHANGE_TXN_RATE = 0.0000307

/** SEBI turnover fee, published as ₹10 per crore. */
export const SEBI_TURNOVER_RATE = 0.000001

/** Stamp duty is buy-side only. Published as ₹1500/crore and ₹300/crore. */
export const STAMP_DUTY_CNC_BUY_RATE = 0.00015
export const STAMP_DUTY_MIS_BUY_RATE = 0.00003

/** GST on brokerage + exchange transaction + SEBI fee + DP base. Never on STT or stamp duty. */
export const GST_RATE = 0.18

/**
 * DP charge before GST, flat per scrip on a delivery sell.
 *
 * ₹13.00, NOT the ₹15.34 people recognise: that figure is this base plus its own
 * ₹2.34 of GST (₹3.50 CDSL + ₹9.50 broker = ₹13.00, × 1.18 = ₹15.34). Treating
 * ₹15.34 as the base and applying GST again over-charges every delivery sell —
 * which is exactly what an earlier draft of the contract did.
 */
export const DP_CHARGE_BASE = 13.0

/** What the pricing page displays, because it is the figure on a real contract note. */
export const DP_CHARGE_INCLUSIVE = 15.34

/* ── Market, quote and simulator values ─────────────────────────────────────
 *
 * Defined in `supabase/functions/_shared/market-constants.ts` and re-exported
 * here, because the Edge Function needs them too and cannot resolve the `@/`
 * alias. App code still imports every one of them from this module, so
 * `code-standards.md` → Import Conventions is unchanged.
 */
export {
  IST_OFFSET_MINUTES,
  MARKET_CLOSE_IST,
  MARKET_OPEN_IST,
  MAX_SYMBOLS_PER_TICK,
  PRE_OPEN_START_IST,
  QUOTE_DELAYED_WINDOW_MS,
  QUOTE_LIVE_WINDOW_MS,
  QUOTE_STALE_AFTER_MS,
  SIMULATOR_MAX_MOVE_PCT,
  SIMULATOR_STEP_VOLATILITY,
  SQUARE_OFF_TIME_IST,
} from '@shared/market-constants.ts'
