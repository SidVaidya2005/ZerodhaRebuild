import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { TERMINAL_NAV_LINKS } from '@/components/terminal/nav-links'
import { TERMINAL_PREFIXES } from '@/lib/auth/routes'

/**
 * Every guarded prefix has a page behind it.
 *
 * `TERMINAL_PREFIXES` is what `src/proxy.ts` redirects on, and it is written by
 * hand. The failure it invites is quiet: someone adds a prefix — or a nav link
 * pointing at one — with no route file, and the guard dutifully protects a 404.
 * A click-through finds that only by accident, and only if someone thinks to
 * click the new link while signed in.
 *
 * This runs in node against the filesystem rather than rendering anything, which
 * is what tier 1 can do (`constraints.md` → Testing: no jsdom, no Testing
 * Library). It checks existence, not content — the placeholder pages F21, F27
 * and F30–F35 replace are deliberately thin.
 */

const TERMINAL_DIR = join(process.cwd(), 'src', 'app', '(terminal)')

/**
 * `/stocks` is a dynamic segment: its page lives at `stocks/[symbol]/page.tsx`,
 * because there is no meaningful index of every instrument. Listed explicitly so
 * the mapping is a decision in the test rather than a guess in a glob.
 */
const DYNAMIC_SEGMENTS: Record<string, string> = {
  '/stocks': 'stocks/[symbol]',
}

describe('the terminal route table', () => {
  it.each(TERMINAL_PREFIXES)('%s has a page', (prefix) => {
    const segment = DYNAMIC_SEGMENTS[prefix] ?? prefix.replace(/^\//, '')
    expect(existsSync(join(TERMINAL_DIR, segment, 'page.tsx'))).toBe(true)
  })

  it('is guarded by the proxy, which is why the pages above must exist', () => {
    // Guards the inverse mistake: deleting a prefix from the table leaves the
    // page reachable signed-out, and every case above would still pass.
    expect(TERMINAL_PREFIXES).toContain('/dashboard')
    expect(TERMINAL_PREFIXES.length).toBeGreaterThanOrEqual(8)
  })

  // Both files claimed this was covered and neither covered it: the cases above
  // iterate TERMINAL_PREFIXES, so a nav link pointing at a path *not* in that
  // table shipped a 404 with the whole suite green. Found at the Phase 3
  // checkpoint. The nav is the only way most of these pages are ever reached,
  // so it is the list most worth checking.
  it.each(TERMINAL_NAV_LINKS.map((link) => link.href))('nav link %s is guarded', (href) => {
    expect(TERMINAL_PREFIXES).toContain(href)
  })

  it.each(TERMINAL_NAV_LINKS.map((link) => link.href))('nav link %s has a page', (href) => {
    const segment = DYNAMIC_SEGMENTS[href] ?? href.replace(/^\//, '')
    expect(existsSync(join(TERMINAL_DIR, segment, 'page.tsx'))).toBe(true)
  })
})
