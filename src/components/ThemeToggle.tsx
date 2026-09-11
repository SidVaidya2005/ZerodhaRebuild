'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import type { Theme } from '@/lib/profile/theme'

/**
 * App-level chrome, so it sits beside theme-provider.tsx rather than in ui/,
 * marketing/ or terminal/. DESIGN.md → Top Navigation puts the toggle in the
 * right-side cluster of the public nav.
 *
 * No `mounted` state and no effect. The usual next-themes dance exists to avoid
 * a hydration mismatch, but this project already has a `light:` variant, so CSS
 * decides which glyph shows and the server and client render identical markup.
 *
 * **`onChange` is how the terminal persists and marketing does not.** This
 * component always writes `localStorage` through `setTheme`; whether the choice
 * also reaches `profiles.theme` is the caller's business, because the marketing
 * header has no session to write with — reading one there would force dynamic
 * rendering on every public page (F12). Keeping the decision out here also keeps
 * `sonner` out of the public bundle: the terminal wrapper owns the toast.
 */
export function ThemeToggle({ onChange }: { onChange?: (theme: Theme) => void }) {
  const { resolvedTheme, setTheme } = useTheme()

  function toggle() {
    const next: Theme = resolvedTheme === 'light' ? 'dark' : 'light'
    setTheme(next)
    onChange?.(next)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle between the light and dark theme"
    >
      <Moon className="light:hidden" />
      <Sun className="hidden light:block" />
    </Button>
  )
}
