import { z } from 'zod'

/**
 * The two themes, in one place.
 *
 * Pinned from both sides, as `OPENING_BALANCE` is (F13): `profiles_theme_allowed`
 * is a CHECK in Postgres and this is the TypeScript vocabulary, each anchored to
 * the product decision rather than to the other. `next-themes` is deliberately
 * not the source — it is configured with `enableSystem={false}`, so its notion
 * of a theme includes `'system'`, which this column cannot store.
 *
 * The schema is the courtesy and the CHECK is the guard: the publishable key
 * ships in the browser bundle, so the column is reachable by direct PostgREST
 * call whatever this file says.
 */
export const THEMES = ['light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

export const themeSchema = z.enum(THEMES)

/** Narrows an unknown — `resolvedTheme` is `string | undefined` at the hook. */
export function isTheme(value: unknown): value is Theme {
  return themeSchema.safeParse(value).success
}
