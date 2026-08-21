import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SIGNED_IN_PATH,
  TERMINAL_PREFIXES,
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
