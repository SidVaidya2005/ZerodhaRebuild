'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'

/**
 * App-level chrome, so it sits beside theme-provider.tsx rather than in ui/,
 * marketing/ or terminal/. DESIGN.md → Top Navigation puts the toggle in the
 * right-side cluster of the public nav.
 *
 * No `mounted` state and no effect. The usual next-themes dance exists to avoid
 * a hydration mismatch, but this project already has a `light:` variant, so CSS
 * decides which glyph shows and the server and client render identical markup.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
      aria-label="Toggle between the light and dark theme"
    >
      <Moon className="light:hidden" />
      <Sun className="hidden light:block" />
    </Button>
  )
}
