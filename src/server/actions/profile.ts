'use server'

import { themeSchema } from '@/lib/profile/theme'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/types/domain'

/**
 * Persists the caller's theme to `profiles.theme`.
 *
 * **Why this exists at all:** `next-themes` stores the choice in `localStorage`,
 * which is per-browser. The feature's whole point is a preference that follows
 * the *account*, so the value has to reach Postgres — and `localStorage` still
 * holds it too, because the library owns the class on `<html>` and applying the
 * theme without it would mean fighting its hydration.
 *
 * **No `revalidateTerminal()`.** That helper exists for writes that move
 * server-rendered numbers; the client has already applied this theme itself, and
 * the only server-rendered consumer is the layout's `ThemeSync`, which reads the
 * stored value on the *next* full load. Revalidating six routes would buy
 * nothing and evict the cached render of every one of them.
 *
 * The narrowed grant is what makes this safe to expose: `update (theme)` is the
 * entire write surface (`20260912120000`), so even a caller bypassing this
 * action cannot reach `client_id`. RLS scopes the row, and the `id` filter below
 * is belt-and-braces — without it a compromised policy would update every row
 * the session could see.
 */
export async function setThemePreference(input: unknown): Promise<ActionResult<null>> {
  const parsed = themeSchema.safeParse(input)

  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_THEME', message: 'That is not a theme this terminal has.' },
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      error: { code: 'NOT_AUTHENTICATED', message: 'Sign in to save your theme.' },
    }
  }

  const { error } = await supabase.from('profiles').update({ theme: parsed.data }).eq('id', user.id)

  if (error) {
    console.error('[profile.setThemePreference]', error)
    return {
      ok: false,
      error: {
        code: 'UNKNOWN',
        // Precise about what did and did not happen: the theme on screen has
        // already changed, and saying "could not change the theme" would
        // contradict what the user can see.
        message: 'Theme changed here, but it could not be saved to your account.',
      },
    }
  }

  return { ok: true, data: null }
}
