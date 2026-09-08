import Link from 'next/link'

import { LEDGER_TYPE_LABEL, LEDGER_TYPES, ledgerHref, type LedgerQuery } from '@/lib/funds/ledger'
import { cn } from '@/lib/utils'

/**
 * The ledger's type filter.
 *
 * **Plain links, so it works with JavaScript disabled** and every view has a URL
 * a user can bookmark, share or reach with the back button. A client-side
 * `<select>` would need `'use client'`, a router push, and would still have to
 * write the same querystring — this is the cheaper answer to the same problem,
 * and it keeps the whole Funds page a Server Component.
 *
 * **Changing the filter always returns to page 1.** Page 4 of every row is very
 * unlikely to be page 4 of one type, so carrying the page across a filter change
 * lands the user on an empty page that looks like an empty ledger.
 */
export function LedgerFilter({ query, disabled }: { query: LedgerQuery; disabled?: boolean }) {
  if (disabled) return null

  return (
    <nav aria-label="Filter ledger by type" className="flex flex-wrap gap-1.5">
      <Chip href={ledgerHref({ type: null, page: 1 })} active={query.type === null}>
        All
      </Chip>
      {LEDGER_TYPES.map((type) => (
        <Chip key={type} href={ledgerHref({ type, page: 1 })} active={query.type === type}>
          {LEDGER_TYPE_LABEL[type]}
        </Chip>
      ))}
    </nav>
  )
}

function Chip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      // Announced, not merely styled: the active filter is the one fact a
      // screen-reader user needs to know about this row of links.
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-full border px-3 py-1 text-caption focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none',
        active
          ? 'border-transparent bg-surface-elevated font-medium text-ink'
          : 'border-hairline text-muted hover:text-ink'
      )}
    >
      {children}
    </Link>
  )
}
