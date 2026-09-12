import { afterEach, describe, expect, it, vi } from 'vitest'

import { throwOnReadError } from './read-errors'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('throwOnReadError', () => {
  it('does nothing when every read succeeded', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => throwOnReadError('holdings', { portfolio_holdings: null })).not.toThrow()
    expect(logged).not.toHaveBeenCalled()
  })

  it('logs and throws when a read failed', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() =>
      throwOnReadError('holdings', {
        portfolio_holdings: { code: '42703', message: 'column does not exist' },
      })
    ).toThrow(/portfolio_holdings/)

    expect(logged).toHaveBeenCalledTimes(1)
  })

  // The regression this whole feature exists to prevent: before F36 a failed
  // read fell through to the empty state, so the page rendered as if the
  // account were empty. Anything that stops this throwing puts that back.
  it('throws rather than returning, so the boundary catches it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() =>
      throwOnReadError('funds', { fund_ledger: { code: '08006', message: 'connection failure' } })
    ).toThrow()
  })

  it('names every failed relation, not just the first', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() =>
      throwOnReadError('reports', {
        trade_history: { code: '42703' },
        reports_summary: null,
        portfolio_summary: { code: '42703' },
      })
    ).toThrow(/trade_history, portfolio_summary/)
  })

  // PostgREST answers an offset past the end of the set with PGRST103. A
  // bookmarked page that outlives its rows is an ordinary outcome, and the
  // tables already render a "past the end" branch for it — throwing here would
  // replace that branch with an error boundary.
  it('does not throw on a past-the-end page read', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => throwOnReadError('reports', { trade_history: { code: 'PGRST103' } })).not.toThrow()
    expect(logged).not.toHaveBeenCalled()
  })

  it('still throws on a real failure alongside a past-the-end read', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() =>
      throwOnReadError('reports', {
        trade_history: { code: 'PGRST103' },
        reports_summary: { code: '42703' },
      })
    ).toThrow(/reports_summary/)
  })
})
