import Link from 'next/link'
import type { ReactNode } from 'react'

import { ExternalLink } from './ExternalLink'
import { NAV_LINKS, REPOSITORY_URL } from './nav-links'

const PROJECT_LINKS = [
  { href: REPOSITORY_URL, label: 'Source on GitHub' },
  { href: 'https://github.com/SidVaidya2005', label: 'Author' },
] as const

const LEGAL_LINKS = [{ href: '/legal', label: 'Disclaimer' }] as const

/**
 * Closes every public page. DESIGN.md specifies a permanently light footer even
 * on a dark canvas; this project reaches the same value through `bg-surface`
 * instead, which already resolves to #fafafa in the light theme and to the
 * elevation step above the canvas in dark. A hardcoded always-light pair would
 * exist only to sit outside the theme flip.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-hairline bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <p className="text-title-sm font-bold text-brand light:text-ink">ZerodhaRebuild</p>
            <p className="mt-2 text-body-sm text-body">
              A paper-trading terminal for NSE equities, built as a portfolio project.
            </p>
          </div>

          <FooterColumn heading="Site">
            {NAV_LINKS.map((link) => (
              <FooterLink key={link.href} href={link.href}>
                {link.label}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn heading="Project">
            {PROJECT_LINKS.map((link) => (
              <FooterLink key={link.href} href={link.href} external>
                {link.label}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn heading="Legal">
            {LEGAL_LINKS.map((link) => (
              <FooterLink key={link.href} href={link.href}>
                {link.label}
              </FooterLink>
            ))}
          </FooterColumn>
        </div>

        <p className="mt-10 border-t border-hairline pt-6 text-caption text-body">
          ZerodhaRebuild is an independent portfolio project and is{' '}
          <span className="font-medium text-body">
            not affiliated with, endorsed by, or connected to Zerodha Broking Ltd.
          </span>{' '}
          in any way. All trading is simulated with fictional money. Nothing here is financial
          advice. See the{' '}
          <Link href="/legal" className="text-brand underline underline-offset-4 light:text-ink">
            full disclaimer
          </Link>
          .
        </p>
      </div>
    </footer>
  )
}

type FooterColumnProps = {
  heading: string
  children: ReactNode
}

function FooterColumn({ heading, children }: FooterColumnProps) {
  return (
    <div>
      <p className="text-caption font-medium text-muted-strong">{heading}</p>
      <ul className="mt-3 flex flex-col gap-2">{children}</ul>
    </div>
  )
}

type FooterLinkProps = {
  href: string
  external?: boolean
  children: ReactNode
}

function FooterLink({ href, external = false, children }: FooterLinkProps) {
  const className = 'text-body-sm text-muted transition-colors hover:text-ink'

  return (
    <li>
      {external ? (
        <ExternalLink href={href} className={className} showIcon={false}>
          {children}
        </ExternalLink>
      ) : (
        <Link href={href} className={className}>
          {children}
        </Link>
      )}
    </li>
  )
}
