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

/**
 * The absolute base URL `/auth/callback` redirects against.
 *
 * A proxy that terminates TLS rewrites the host, so the forwarded headers are
 * what describe the URL the visitor actually typed — but **the scheme must come
 * from `x-forwarded-proto`, never be assumed**. Hardcoding `https://` when a
 * forwarded host is present sends a local production build to
 * `https://localhost:3000`, which fails with ERR_SSL_PROTOCOL_ERROR: Next.js
 * sets `x-forwarded-host` on every request, so "a forwarded host exists" does
 * not mean "there is a TLS-terminating proxy in front" (F12).
 *
 * Falls back to the request's own origin whenever the pair is incomplete.
 */
export function callbackBaseUrl({
  origin,
  forwardedHost,
  forwardedProto,
}: {
  origin: string
  forwardedHost: string | null
  forwardedProto: string | null
}): string {
  if (!forwardedHost || !forwardedProto) return origin
  // A comma-separated list means the request crossed more than one proxy; the
  // first entry is the one the client actually spoke to.
  const proto = forwardedProto.split(',')[0]?.trim()
  const host = forwardedHost.split(',')[0]?.trim()
  if (!host) return origin
  if (proto !== 'http' && proto !== 'https') return origin
  return `${proto}://${host}`
}
