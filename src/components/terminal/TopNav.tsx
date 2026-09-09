import Link from 'next/link'

import { ThemeToggle } from '@/components/ThemeToggle'
import type { UniverseEntry, WatchlistRow } from '@/lib/watchlist/schemas'

import { AvatarMenu } from './AvatarMenu'
import type { MarketComposite } from '@/lib/portfolio/types'

import { DataSourceBadge } from './DataSourceBadge'
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
  /** Forwarded to the sheet: the rail's copy is rendered by the layout. */
  watchlist: WatchlistRow[]
  universe: UniverseEntry[]
  /** The index strip's figures. Null when the read failed; the strip shows an em dash. */
  composite: MarketComposite | null
}

export function TopNav({
  name,
  email,
  clientId,
  availableCash,
  holidays,
  serverNow,
  watchlist,
  universe,
  composite,
}: TopNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas">
      {/* Tighter gap and padding on the smallest screens: at 375px the
          burger, brand, pill, toggle and avatar overflowed the bar by a few
          pixels at gap-4/px-4. */}
      <div className="flex h-16 items-center gap-3 px-3 sm:px-4 md:gap-4 md:px-6">
        {/* Only the mobile trigger. The desktop rail is a column beside
            <main>, not a nav item — see the layout. */}
        <WatchlistSheet rows={watchlist} universe={universe} />

        {/* The wordmark is the one element here that carries no function, so it
            is what gives way below `sm`: at 375px the burger, pill, badge,
            toggle and avatar need 333 of the 347px available, and the wordmark's
            109px is what pushed the bar to 466 and scrolled every terminal page
            sideways. Hiding it keeps the market-status pill and the provenance
            badge — which the honesty guarantee depends on — at full size. */}
        <Link
          href="/dashboard"
          className="hidden shrink-0 font-bold text-body text-brand sm:block sm:text-title-sm"
        >
          ZerodhaRebuild
        </Link>

        <IndexStrip composite={composite} />

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
          {/* Where the prices came from, beside when the market is open. Renders
              nothing while no price is on screen. */}
          <DataSourceBadge />
          <FundsSummary availableCash={availableCash} />
          <ThemeToggle />
          <AvatarMenu name={name} email={email} clientId={clientId} />
        </div>
      </div>
    </header>
  )
}
