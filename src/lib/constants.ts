/**
 * Fixed values shared across the app. `code-standards.md` → Import Conventions
 * requires every such value to live here rather than being inlined at a call
 * site, so a rate or a key can only change in one place.
 *
 * Trading constants — OPENING_BALANCE, SQUARE_OFF_TIME_IST, the charge rates —
 * land here alongside the features that introduce them.
 */

/** Where the visitor's dismissal of the simulator disclaimer is remembered. */
export const DISCLAIMER_STORAGE_KEY = 'zr-disclaimer'

/**
 * Stamped on <html> by the blocking script in the root layout and read by the
 * CSS rule that hides the banner. The attribute exists so the strip can be
 * hidden before first paint, which a React state read cannot do.
 */
export const DISCLAIMER_ATTRIBUTE = 'data-disclaimer'
export const DISCLAIMER_DISMISSED = 'dismissed'
