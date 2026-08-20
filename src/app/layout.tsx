import type { Metadata } from 'next'
import { IBM_Plex_Sans, Inter } from 'next/font/google'
import type { ReactNode } from 'react'

import { ThemeProvider } from '@/components/theme-provider'

import './globals.css'

// Inter substitutes BinanceNova and IBM Plex Sans substitutes BinancePlex, per
// DESIGN.md's substitution note. Plex is chosen over a monospace because dense
// P&L cards read better in humanist proportions; `tabular-nums` on .font-numeric
// recovers the column alignment that monospace would have given.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const plex = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ZerodhaRebuild',
  description:
    'A paper-trading terminal for NSE equities. Simulated money only — not affiliated with Zerodha.',
}

type RootLayoutProps = {
  children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    // suppressHydrationWarning is required by next-themes: it writes the theme
    // class on the client before React hydrates.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${plex.variable}`}>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
