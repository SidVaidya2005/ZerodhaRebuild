import { describe, expect, it } from 'vitest'

import {
  REPORTS_PAGE_SIZE,
  exportHref,
  isActivePreset,
  pageCount,
  parseReportsQuery,
  reportsHref,
  reportsPresets,
  toRange,
  type ReportsQuery,
} from './query'

const EMPTY: ReportsQuery = { from: null, to: null, symbol: null, page: 1 }

describe('parseReportsQuery', () => {
  it('reads a complete view out of the querystring', () => {
    expect(
      parseReportsQuery({ from: '2026-03-10', to: '2026-03-12', symbol: 'RELIANCE', page: '3' })
    ).toEqual({ from: '2026-03-10', to: '2026-03-12', symbol: 'RELIANCE', page: 3 })
  })

  it('defaults to the whole statement when nothing is asked for', () => {
    expect(parseReportsQuery({})).toEqual(EMPTY)
  })

  // Each field falls back on its own, so one stale parameter does not discard a
  // good one beside it (F32's rule, applied to four fields instead of two).
  it('falls back per field rather than discarding the whole query', () => {
    expect(parseReportsQuery({ from: 'nonsense', to: '2026-03-12', page: '2' })).toEqual({
      from: null,
      to: '2026-03-12',
      symbol: null,
      page: 2,
    })
  })

  it.each(['0', '-1', 'abc', ''])('falls back to page 1 on page=%s', (page) => {
    expect(parseReportsQuery({ page }).page).toBe(1)
  })

  // The regex alone accepts these; Postgres would reject them as a `date` and
  // turn a hand-edited URL into a failed query instead of a fallback.
  it.each(['2026-02-31', '2026-13-01', '2026-00-10'])(
    'rejects %s, which matches the shape but is not a real date',
    (date) => {
      expect(parseReportsQuery({ from: date }).from).toBeNull()
    }
  )

  it('rejects a symbol that could not have come from the filter', () => {
    expect(parseReportsQuery({ symbol: 'reliance; drop' }).symbol).toBeNull()
    expect(parseReportsQuery({ symbol: 'M&M' }).symbol).toBe('M&M')
  })

  // An inverted range matches nothing, and a Reports page showing nothing is
  // indistinguishable from an account that has never traded.
  it('falls back to unbounded when from is after to, not to an empty set', () => {
    expect(parseReportsQuery({ from: '2026-03-12', to: '2026-03-10' })).toEqual(EMPTY)
  })

  it('keeps a single-day range, where from equals to', () => {
    expect(parseReportsQuery({ from: '2026-03-10', to: '2026-03-10' })).toMatchObject({
      from: '2026-03-10',
      to: '2026-03-10',
    })
  })

  it('takes the first value when a parameter repeats', () => {
    expect(parseReportsQuery({ symbol: ['INFY', 'RELIANCE'] }).symbol).toBe('INFY')
  })
})

describe('toRange', () => {
  // `range()` is inclusive at both ends: page 2 of 50 is (50, 99), and (50, 100)
  // would return 51 rows, leaking one row of page 3 onto page 2.
  it('produces 0-based inclusive bounds', () => {
    expect(toRange(1)).toEqual({ from: 0, to: REPORTS_PAGE_SIZE - 1 })
    expect(toRange(2)).toEqual({ from: 50, to: 99 })
    expect(toRange(3)).toEqual({ from: 100, to: 149 })
  })

  it('spans exactly one page', () => {
    const { from, to } = toRange(7)
    expect(to - from + 1).toBe(REPORTS_PAGE_SIZE)
  })
})

describe('pageCount', () => {
  it('never reports zero pages, so an empty statement reads "page 1 of 1"', () => {
    expect(pageCount(0)).toBe(1)
  })

  it('rounds a partial page up', () => {
    expect(pageCount(50)).toBe(1)
    expect(pageCount(51)).toBe(2)
    expect(pageCount(100)).toBe(2)
  })
})

describe('reportsHref', () => {
  it('is the bare path when nothing is filtered', () => {
    expect(reportsHref(EMPTY)).toBe('/reports')
  })

  it('omits page 1, so the first page has one canonical URL', () => {
    expect(reportsHref({ ...EMPTY, symbol: 'INFY' })).toBe('/reports?symbol=INFY')
  })

  it('round-trips through parseReportsQuery', () => {
    const query: ReportsQuery = {
      from: '2026-03-10',
      to: '2026-03-12',
      symbol: 'INFY',
      page: 4,
    }
    const search = reportsHref(query).split('?')[1] ?? ''
    expect(parseReportsQuery(Object.fromEntries(new URLSearchParams(search)))).toEqual(query)
  })
})

describe('exportHref', () => {
  // The CSV covers the filtered set, not the page on screen — filtering to a
  // year and receiving 50 rows is not an export anyone wants.
  it('drops the page, keeping every other filter', () => {
    expect(exportHref({ from: '2026-03-10', to: '2026-03-12', symbol: 'INFY', page: 4 })).toBe(
      '/reports/export?from=2026-03-10&to=2026-03-12&symbol=INFY'
    )
  })

  it('is the bare path when nothing is filtered', () => {
    expect(exportHref(EMPTY)).toBe('/reports/export')
  })
})

describe('reportsPresets', () => {
  // 2026-03-10 18:40Z is 00:10 IST on the 11th. A preset built from the UTC date
  // would offer ranges ending the day before the user's own "today".
  const lateEvening = new Date('2026-03-10T18:40:00Z')

  it('anchors every range on the IST date, not the UTC one', () => {
    const presets = reportsPresets(lateEvening)
    for (const preset of presets.slice(1)) {
      expect(preset.query.to).toBe('2026-03-11')
    }
  })

  it('offers all time first, with no bounds at all', () => {
    expect(reportsPresets(lateEvening)[0]).toMatchObject({
      label: 'All time',
      query: EMPTY,
    })
  })

  it('makes last-30-days a 30-day inclusive window', () => {
    const preset = reportsPresets(lateEvening).find((p) => p.label === 'Last 30 days')
    expect(preset?.query.from).toBe('2026-02-10')
    expect(preset?.query.to).toBe('2026-03-11')
  })

  it('starts this month on the first', () => {
    const preset = reportsPresets(lateEvening).find((p) => p.label === 'This month')
    expect(preset?.query.from).toBe('2026-03-01')
  })

  // The Indian financial year runs April to March, which is the period a P&L
  // statement is read against here.
  it('starts this FY in April of the current FY, not January', () => {
    const march = reportsPresets(new Date('2026-03-10T06:00:00Z')).find(
      (p) => p.label === 'This FY'
    )
    expect(march?.query.from).toBe('2025-04-01')

    const april = reportsPresets(new Date('2026-04-10T06:00:00Z')).find(
      (p) => p.label === 'This FY'
    )
    expect(april?.query.from).toBe('2026-04-01')
  })
})

describe('isActivePreset', () => {
  const presets = reportsPresets(new Date('2026-03-10T06:00:00Z'))

  it('matches on the range alone, so a symbol filter does not clear the highlight', () => {
    const thisMonth = presets.find((p) => p.label === 'This month')
    expect(thisMonth).toBeDefined()
    expect(isActivePreset(thisMonth!, { ...thisMonth!.query, symbol: 'INFY', page: 3 })).toBe(true)
  })

  it('does not match a different range', () => {
    const thisMonth = presets.find((p) => p.label === 'This month')
    expect(isActivePreset(thisMonth!, EMPTY)).toBe(false)
  })
})
