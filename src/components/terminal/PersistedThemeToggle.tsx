'use client'

import { toast } from 'sonner'

import { ThemeToggle } from '@/components/ThemeToggle'
import type { Theme } from '@/lib/profile/theme'
import { setThemePreference } from '@/server/actions/profile'

/**
 * The theme toggle, wired to the account.
 *
 * **Terminal-only, and that is the whole reason this wrapper exists.** The
 * marketing header renders the bare `ThemeToggle`: it has no session to write
 * with, and reading one there would force dynamic rendering on every public page
 * (F12). Putting the persistence here rather than inside `ThemeToggle` also
 * keeps `sonner` out of the public bundle, which the layout already goes to
 * trouble to do.
 *
 * **The write is not awaited before the theme changes**, because it already has
 * — `setTheme` runs first and the UI has flipped by the time this resolves. So
 * the failure message says the theme changed but was not saved, rather than
 * claiming nothing happened. A spinner on a colour switch would be worse than
 * the rare unsaved preference it guards.
 *
 * Every toggle inside the terminal goes through this. If the top bar's did not
 * persist, `ThemeSync` would read the unchanged stored value on the next full
 * load and silently revert the user's choice.
 */
export function PersistedThemeToggle() {
  async function persist(theme: Theme) {
    const result = await setThemePreference(theme)
    if (!result.ok) toast.error(result.error.message)
  }

  return <ThemeToggle onChange={(theme) => void persist(theme)} />
}
