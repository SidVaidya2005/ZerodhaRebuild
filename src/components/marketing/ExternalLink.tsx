import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type ExternalLinkProps = {
  href: string
  children: ReactNode
  className?: string
  /** Hide the arrow where the surrounding layout already signals the link. */
  showIcon?: boolean
}

/**
 * Every link leaving the site goes through here.
 *
 * `rel="noreferrer"` is a recurring requirement rather than a per-link decision,
 * so it lives in one file and a grep for a raw `target="_blank"` anywhere else is
 * the check. The sr-only suffix exists because opening a new tab without warning
 * is disorienting for anyone not watching the viewport.
 */
export function ExternalLink({ href, children, className, showIcon = true }: ExternalLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn('inline-flex items-baseline gap-1', className)}
    >
      {children}
      {showIcon ? (
        <ArrowUpRight className="size-3.5 shrink-0 self-center" aria-hidden="true" />
      ) : null}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}
