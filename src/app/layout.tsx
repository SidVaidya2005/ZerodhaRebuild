import type { Metadata } from 'next'
import { IBM_Plex_Sans, Inter } from 'next/font/google'
import type { ReactNode } from 'react'

import { ThemeProvider } from '@/components/theme-provider'
import { DISCLAIMER_ATTRIBUTE, DISCLAIMER_DISMISSED, DISCLAIMER_STORAGE_KEY } from '@/lib/constants'

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
    // suppressHydrationWarning covers two pre-hydration writes to this element:
    // next-themes' theme class, and the disclaimer attribute stamped below.
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${plex.variable}`}>
      <head>
        {/* Stamps the dismissal before first paint, so a returning visitor never
            sees the disclaimer strip flash in and out. globals.css hides the
            banner off this attribute. Next.js documents this exact pattern for
            preventing a flash before hydration; next-themes runs the same trick
            one element over. Inline and synchronous on purpose — a deferred
            script would run after the first frame, which is the whole problem. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem(${JSON.stringify(DISCLAIMER_STORAGE_KEY)})===${JSON.stringify(DISCLAIMER_DISMISSED)})document.documentElement.setAttribute(${JSON.stringify(DISCLAIMER_ATTRIBUTE)},${JSON.stringify(DISCLAIMER_DISMISSED)})}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
