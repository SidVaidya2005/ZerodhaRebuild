import Link from 'next/link'

import { ThemeToggle } from '@/components/ThemeToggle'

import { AvatarMenu } from './AvatarMenu'
import { FundsSummary } from './FundsSummary'
import { IndexStrip } from './IndexStrip'
import { MarketStatusPill } from './MarketStatusPill'
import { TERMINAL_NAV_LINKS } from './nav-links'
import { WatchlistSheet } from './WatchlistSidebar'

/**
 * The terminal's top navigation: 64px, matching the public header's height so
 * the two shells feel like one product.
 *
 * A Server Component that composes three client islands — the pill, the avatar
 * menu, and the sidebar's mobile trigger. Keeping the nav itself on the server
 * means the links, the index strip and the funds figure ship as HTML.
 */

type TopNavProps = {
  name: string
  email: string
  clientId: string | null
  availableCash: number | null
  holidays: string[]
  serverNow: string
}

export function TopNav({ name, email, clientId, availableCash, holidays, serverNow }: TopNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas">
      {/* Tighter gap and padding on the smallest screens: at 375px the
          burger, brand, pill, toggle and avatar overflowed the bar by a few
          pixels at gap-4/px-4. */}
      <div className="flex h-16 items-center gap-3 px-3 sm:px-4 md:gap-4 md:px-6">
        {/* Only the mobile trigger. The desktop rail is a column beside
            <main>, not a nav item — see the layout. */}
        <WatchlistSheet />

        <Link
          href="/dashboard"
          className="shrink-0 font-bold text-body text-brand sm:text-title-sm"
        >
          ZerodhaRebuild
        </Link>

        <IndexStrip />

        <nav aria-label="Terminal" className="ml-auto hidden items-center gap-5 lg:flex">
          {TERMINAL_NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-body-sm text-muted-strong transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <MarketStatusPill holidays={holidays} serverNow={serverNow} />
          <FundsSummary availableCash={availableCash} />
          <ThemeToggle />
          <AvatarMenu name={name} email={email} clientId={clientId} />
        </div>
      </div>
    </header>
  )
}
