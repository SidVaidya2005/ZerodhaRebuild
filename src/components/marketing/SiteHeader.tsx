import Link from 'next/link'

import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'

import { MobileNav } from './MobileNav'
import { NAV_LINKS, SIGN_IN_HREF } from './nav-links'

/**
 * The public top navigation: 64px on the page canvas, per DESIGN.md →
 * Top Navigation. The wordmark is type rather than an image — this project
 * adopts the design system's shapes but none of its branding, and the same call
 * was already made for Zerodha's.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-canvas">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 md:px-6">
        <Link href="/" className="text-title-sm font-bold text-brand">
          ZerodhaRebuild
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-body text-muted-strong transition-colors hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ThemeToggle />
          {/* The pill radius is reserved for exactly this action — DESIGN.md
              treats it as the "this is THE action" signal and nothing else. */}
          <Button asChild className="hidden rounded-full md:inline-flex">
            <Link href={SIGN_IN_HREF}>Sign in with Google</Link>
          </Button>
          <MobileNav />
        </div>
      </div>
    </header>
  )
}
