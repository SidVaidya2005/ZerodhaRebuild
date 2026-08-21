/**
 * Fixed values shared across the app. `code-standards.md` → Import Conventions
 * requires every such value to live here rather than being inlined at a call
 * site, so a rate or a key can only change in one place.
 *
 * The remaining trading constants — SQUARE_OFF_TIME_IST, SHORT_MARGIN_BUFFER,
 * the charge rates — land here alongside the features that introduce them.
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
