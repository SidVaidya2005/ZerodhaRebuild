'use client'

import { useTheme } from 'next-themes'
import { useEffect, useRef } from 'react'

import type { Theme } from '@/lib/profile/theme'

/**
 * Applies the account's stored theme when the terminal loads.
 *
 * **Why an effect and not a blocking script.** `next-themes` accepts no
 * server-supplied value: its injected script reads `localStorage`, and
 * `setTheme` is the only documented write path. Calling `setTheme` therefore
 * leaves the library sole owner of both the class on `<html>` and the storage
 * key, and the two cannot disagree. A blocking script would remove the flash
 * below at the price of hand-writing a key the library owns and racing its
 * hydration — the failure would be a theme that flickers back, which is worse
 * than the one it fixed.
 *
 * **The cost, stated plainly:** on a browser whose `localStorage` disagrees with
 * the account — a genuinely new device, which is exactly the case this feature
 * exists for — the first paint is the wrong theme and the correct one follows a
 * frame later. It happens inside the terminal only, and only on the first load.
 *
 * **Once per mount, guarded by a ref**, not once per render. `resolvedTheme` is
 * `undefined` until the provider mounts, so the effect must wait for it; and
 * once the user toggles, `stored` is stale server state that must not be allowed
 * to reapply and undo them.
 *
 * Renders nothing.
 */
export function ThemeSync({ stored }: { stored: Theme }) {
  const { resolvedTheme, setTheme } = useTheme()
  const applied = useRef(false)

  useEffect(() => {
    if (applied.current || resolvedTheme === undefined) return
    applied.current = true
    if (resolvedTheme !== stored) setTheme(stored)
  }, [resolvedTheme, stored, setTheme])

  return null
}
