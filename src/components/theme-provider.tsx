'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

/**
 * App-level chrome, so it sits at the top of components/ rather than in ui/,
 * marketing/, terminal/ or charts/.
 *
 * `enableSystem` is off deliberately: defaultTheme="dark" only means something if
 * the operating system cannot override it, and a trading terminal belongs on the
 * dark canvas. The choice persists to localStorage; profiles.theme is feature 35.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
