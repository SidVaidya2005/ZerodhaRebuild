import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SIGNED_IN_PATH,
  TERMINAL_PREFIXES,
  callbackBaseUrl,
  isTerminalPath,
  safeNext,
} from '@/lib/auth/routes'

describe('isTerminalPath', () => {
  it('guards every prefix architecture.md lists', () => {
    for (const prefix of TERMINAL_PREFIXES) {
      expect(isTerminalPath(prefix), prefix).toBe(true)
    }
  })

  it('guards nested terminal routes', () => {
    expect(isTerminalPath('/stocks/RELIANCE')).toBe(true)
    expect(isTerminalPath('/orders/completed')).toBe(true)
  })

  it('leaves every public route alone', () => {
    for (const path of ['/', '/about', '/pricing', '/support', '/legal', '/api/health']) {
      expect(isTerminalPath(path), path).toBe(false)
    }
  })

  it('does not guard the auth routes, or sign-in becomes a redirect loop', () => {
    expect(isTerminalPath('/auth/login')).toBe(false)
    expect(isTerminalPath('/auth/callback')).toBe(false)
  })

  it('matches on a segment boundary, not a bare prefix', () => {
    // The bug a plain startsWith would introduce: a public route that merely
    // begins with a terminal prefix would be guarded.
    expect(isTerminalPath('/ordersomething')).toBe(false)
    expect(isTerminalPath('/settings-guide')).toBe(false)
    expect(isTerminalPath('/fundsxyz')).toBe(false)
  })
})

describe('safeNext', () => {
  it('keeps an ordinary same-origin path', () => {
    expect(safeNext('/positions')).toBe('/positions')
    expect(safeNext('/stocks/INFY')).toBe('/stocks/INFY')
  })

  it('falls back to the dashboard when nothing was requested', () => {
    expect(safeNext(null)).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNext(undefined)).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNext('')).toBe(DEFAULT_SIGNED_IN_PATH)
  })

  it('refuses an absolute URL — the callback is not an open redirect', () => {
    expect(safeNext('https://evil.com')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNext('http://evil.com/steal')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNext('javascript:alert(1)')).toBe(DEFAULT_SIGNED_IN_PATH)
  })

  it('refuses a protocol-relative path, which a bare startsWith(/) accepts', () => {
    expect(safeNext('//evil.com')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNext('//evil.com/steal')).toBe(DEFAULT_SIGNED_IN_PATH)
    expect(safeNext('/\\evil.com')).toBe(DEFAULT_SIGNED_IN_PATH)
  })
})

describe('callbackBaseUrl', () => {
  const origin = 'http://localhost:3000'

  it('keeps the request origin when nothing is forwarded', () => {
    expect(callbackBaseUrl({ origin, forwardedHost: null, forwardedProto: null })).toBe(origin)
  })

  it('does not invent https for a local production build', () => {
    // The bug this exists to prevent: `pnpm start` runs with NODE_ENV=production
    // and Next.js sets x-forwarded-host on every request, so assuming https here
    // redirected sign-in to https://localhost:3000 and failed the TLS handshake.
    expect(
      callbackBaseUrl({ origin, forwardedHost: 'localhost:3000', forwardedProto: 'http' })
    ).toBe('http://localhost:3000')
  })

  it('follows the proxy when it really is terminating TLS', () => {
    expect(
      callbackBaseUrl({
        origin: 'http://10.0.0.4:10000',
        forwardedHost: 'zerodha-rebuild.onrender.com',
        forwardedProto: 'https',
      })
    ).toBe('https://zerodha-rebuild.onrender.com')
  })

  it('reads only the first hop when the request crossed several proxies', () => {
    expect(
      callbackBaseUrl({
        origin: 'http://10.0.0.4:10000',
        forwardedHost: 'zerodha-rebuild.onrender.com, internal',
        forwardedProto: 'https, http',
      })
    ).toBe('https://zerodha-rebuild.onrender.com')
  })

  it('falls back to the origin rather than trusting an odd scheme', () => {
    expect(
      callbackBaseUrl({ origin, forwardedHost: 'evil.com', forwardedProto: 'javascript' })
    ).toBe(origin)
    expect(callbackBaseUrl({ origin, forwardedHost: 'evil.com', forwardedProto: null })).toBe(
      origin
    )
  })
})
