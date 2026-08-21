/**
 * Hand-written domain types. `database.ts` next to this file is generated and
 * must never be edited by hand.
 */

/**
 * What every Server Action returns.
 *
 * A discriminated union rather than an optional-field grab bag, so a caller
 * cannot read `data` without having narrowed on `ok` first. `code-standards.md`
 * names this the canonical example of the pattern.
 *
 * Actions never throw: a thrown error becomes an opaque digest in production,
 * which tells the user nothing and tells the logs nothing either.
 */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError }

export type ActionError = {
  /** Stable, mappable code. Never a raw Postgres message. */
  code: string
  /** Copy safe to render. */
  message: string
  /** Per-field messages, when the failure was validation. */
  fields?: Record<string, string>
}
