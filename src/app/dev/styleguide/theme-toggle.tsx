'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'

/**
 * No `mounted` state and no effect. The usual next-themes dance exists to avoid a
 * hydration mismatch, but this project already has a `light:` variant, so CSS can
 * decide which glyph shows and the server and client render identical markup.
 * It also demonstrates the variant working, which is the point of a styleguide.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="outline"
      onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
      aria-label="Toggle between the light and dark theme"
    >
      <Moon className="size-4 light:hidden" />
      <Sun className="hidden size-4 light:block" />
      <span className="ml-2 light:hidden">dark</span>
      <span className="ml-2 hidden light:inline">light</span>
    </Button>
  )
}
