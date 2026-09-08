import { describe, expect, it } from 'vitest'

import {
  LEDGER_PAGE_SIZE,
  LEDGER_TYPE_LABEL,
  LEDGER_TYPES,
  ledgerHref,
  pageCount,
  parseLedgerQuery,
  toRange,
} from '@/lib/funds/ledger'

describe('the filter vocabulary', () => {
  it('is the enum Postgres actually holds', () => {
    // Read from the generated types rather than restated here, so a ninth
    // ledger_type added in SQL cannot go missing from the filter.
    expect(LEDGER_TYPES).toContain('SIGNUP_CREDIT')
    expect(LEDGER_TYPES).toContain('SIMULATION_ADJUSTMENT')
    expect(LEDGER_TYPES).toHaveLength(8)
  })

  it('gives every type a label, so none can render as its enum name', () => {
    // Asserted over the enum rather than the map, so a ninth type added in SQL
    // fails here rather than reaching a user as SIMULATION_ADJUSTMENT.
    for (const type of LEDGER_TYPES) {
      expect(LEDGER_TYPE_LABEL[type]).toBeTruthy()
      expect(LEDGER_TYPE_LABEL[type]).not.toBe(type)
    }
  })
})

describe('reading the view state out of the URL', () => {
  it('defaults to the first page, unfiltered', () => {
    expect(parseLedgerQuery({})).toEqual({ type: null, page: 1 })
  })

  it('accepts a real ledger type and a real page', () => {
    expect(parseLedgerQuery({ type: 'CHARGES', page: '3' })).toEqual({ type: 'CHARGES', page: 3 })
  })

  it('falls back on a type that is not in the enum', () => {
    // A stale bookmark from a build where the vocabulary differed.
    expect(parseLedgerQuery({ type: 'NOT_A_TYPE' }).type).toBeNull()
  })

  it('falls back on a non-numeric page', () => {
    expect(parseLedgerQuery({ page: 'abc' }).page).toBe(1)
  })

  it('falls back on page zero and on a negative page', () => {
    // range() would compute a negative offset and PostgREST would reject it.
    expect(parseLedgerQuery({ page: '0' }).page).toBe(1)
    expect(parseLedgerQuery({ page: '-2' }).page).toBe(1)
  })

  it('falls back on a fractional page', () => {
    expect(parseLedgerQuery({ page: '1.5' }).page).toBe(1)
  })

  it('keeps a good parameter when the other is bad', () => {
    // Independent fallbacks: one broken field must not discard the other.
    expect(parseLedgerQuery({ type: 'CHARGES', page: 'abc' })).toEqual({
      type: 'CHARGES',
      page: 1,
    })
    expect(parseLedgerQuery({ type: 'NOPE', page: '4' })).toEqual({ type: null, page: 4 })
  })

  it('takes the first value when a parameter repeats', () => {
    expect(parseLedgerQuery({ page: ['2', '9'] }).page).toBe(2)
  })
})

describe('translating a page into range() bounds', () => {
  it('puts page 1 at rows 0 to 49', () => {
    expect(toRange(1)).toEqual({ from: 0, to: 49 })
  })

  it('puts page 2 at rows 50 to 99, not 50 to 100', () => {
    // range() is inclusive, so `from + size` would return 51 rows and leak the
    // first row of page 3 onto page 2.
    expect(toRange(2)).toEqual({ from: 50, to: 99 })
  })

  it('spans exactly one page of rows', () => {
    const { from, to } = toRange(7)
    expect(to - from + 1).toBe(LEDGER_PAGE_SIZE)
  })
})

describe('counting pages', () => {
  it('reports one page for an empty ledger, never zero', () => {
    expect(pageCount(0)).toBe(1)
  })

  it('does not open a second page for an exactly full first one', () => {
    expect(pageCount(50)).toBe(1)
    expect(pageCount(51)).toBe(2)
  })
})

describe('building links', () => {
  it('drops the defaults, so the unfiltered first page is a clean URL', () => {
    expect(ledgerHref({ type: null, page: 1 })).toBe('/funds')
  })

  it('carries the filter and the page when they are not default', () => {
    expect(ledgerHref({ type: 'CHARGES', page: 2 })).toBe('/funds?type=CHARGES&page=2')
  })

  it('round-trips through the parser', () => {
    const query = { type: 'MARGIN_BLOCK', page: 4 } as const
    const href = ledgerHref(query)
    const parsed = parseLedgerQuery(
      Object.fromEntries(new URL(`http://x${href}`).searchParams.entries())
    )
    expect(parsed).toEqual(query)
  })
})
