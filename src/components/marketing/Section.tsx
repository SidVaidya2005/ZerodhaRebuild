import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type SectionProps = {
  /** Rendered as the band's h2. Omit for bands that carry their own heading. */
  heading?: string
  lede?: string
  children: ReactNode
  className?: string
}

/**
 * One editorial band. DESIGN.md → Layout puts a uniform 80px between every major
 * band and caps marketing content at ~1280px; the system separates sections by
 * contrast rather than by varying whitespace, so the rhythm is deliberately not
 * a per-section decision.
 */
export function Section({ heading, lede, children, className }: SectionProps) {
  return (
    <section className={cn('py-section', className)}>
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        {heading ? (
          <div className="max-w-prose">
            <h2 className="text-display-sm font-semibold text-ink">{heading}</h2>
            {lede ? <p className="mt-3 text-body text-muted-strong">{lede}</p> : null}
          </div>
        ) : null}
        <div className={heading ? 'mt-10' : undefined}>{children}</div>
      </div>
    </section>
  )
}
