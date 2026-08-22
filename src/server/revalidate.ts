import 'server-only'

import { revalidatePath } from 'next/cache'

import { TERMINAL_PREFIXES } from '@/lib/auth/routes'

/**
 * Revalidates every terminal route.
 *
 * Both writers that reach it change something the `(terminal)` layout renders —
 * the watchlist rail for F18, the header's available cash for F26 — so a
 * page-level revalidation of the route the visitor happens to be on leaves the
 * chrome stale on every other one.
 *
 * `code-standards.md` says to list the routes explicitly rather than revalidate
 * the layout, so this walks the same table `src/proxy.ts` guards, which is what
 * keeps the two from drifting. `/stocks` needs its dynamic form: a bare prefix
 * does not match `/stocks/RELIANCE`.
 *
 * It over-revalidates `/settings`, which no fill and no watchlist edit touches.
 * That is deliberate: the alternative is a second, shorter list per caller, and
 * a list that can silently *under*-list is the failure `code-standards.md`
 * warns about — a fill moves orders, holdings, positions, funds, dashboard and
 * reports, and naming only the obvious two leaves stale numbers on screen.
 */
export function revalidateTerminal(): void {
  for (const prefix of TERMINAL_PREFIXES) {
    if (prefix === '/stocks') {
      revalidatePath('/stocks/[symbol]', 'page')
      continue
    }
    revalidatePath(prefix)
  }
}
