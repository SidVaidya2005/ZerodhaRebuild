/**
 * The two pure decisions the route guard makes.
 *
 * `src/proxy.ts` cannot be reached by tier 1 — it needs a real `NextRequest` and
 * a live Supabase session — but these two functions are where a bug is both
 * silent and expensive: a terminal route left unguarded, or a callback that
 * forwards to whatever host an attacker puts in the query string. They live here
 * so `routes.test.ts` can falsify them, and the proxy imports them.
 */

/**
 * Every path prefix under `src/app/(terminal)/`, from `architecture.md` →
 * Authentication. Everything not listed here is public.
 */
export const TERMINAL_PREFIXES = [
  '/dashboard',
  '/orders',
  '/holdings',
  '/positions',
  '/funds',
  '/reports',
  '/settings',
  '/stocks',
] as const

/** Where an unauthenticated visitor is sent, and where sign-in starts. */
export const LOGIN_PATH = '/auth/login'

/** Where a signed-in visitor lands when nothing better is known. */
export const DEFAULT_SIGNED_IN_PATH = '/dashboard'

/**
 * Prefix matching with a segment boundary, not `startsWith` alone: `/ordersXYZ`
 * is not a terminal route and must not be guarded as one, while `/stocks/INFY`
 * must be. A bare `startsWith` gets the first case wrong.
 */
export function isTerminalPath(pathname: string): boolean {
  return TERMINAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Decides where `/auth/callback` forwards to.
 *
 * Only a same-origin, absolute path survives. A protocol-relative `//evil.com`
 * is the case a naive `startsWith('/')` check lets through — the browser reads
 * it as a host, so it is rejected explicitly. Anything else falls back to the
 * dashboard, which is what `architecture.md` names as the post-login
 * destination.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return DEFAULT_SIGNED_IN_PATH
  if (!next.startsWith('/')) return DEFAULT_SIGNED_IN_PATH
  if (next.startsWith('//')) return DEFAULT_SIGNED_IN_PATH
  // `/\evil.com` is treated as protocol-relative by some browsers.
  if (next.startsWith('/\\')) return DEFAULT_SIGNED_IN_PATH
  return next
}
