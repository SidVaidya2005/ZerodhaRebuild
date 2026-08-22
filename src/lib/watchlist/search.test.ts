import { describe, expect, it } from 'vitest'

import { SEARCH_LIMIT, searchUniverse } from '@/lib/watchlist/search'
import type { UniverseEntry } from '@/lib/watchlist/schemas'

const entry = (symbol: string, name: string): UniverseEntry => ({ symbol, name, exchange: 'NSE' })

const universe: UniverseEntry[] = [
  entry('RELIANCE', 'Reliance Industries Ltd.'),
  entry('RECLTD', 'REC Ltd.'),
  entry('DRREDDY', "Dr. Reddy's Laboratories Ltd."),
  entry('GROWW', 'Billionbrains Garage Ventures Ltd.'),
  entry('OBEROIRLTY', 'Oberoi Realty Ltd.'),
  entry('INFY', 'Infosys Ltd.'),
]

describe('the add-instrument palette', () => {
  it('surfaces RELIANCE first for "rel"', () => {
    // The build plan's own acceptance case.
    expect(searchUniverse(universe, 'rel')[0]?.symbol).toBe('RELIANCE')
  })

  it('does not match letters merely scattered through a name', () => {
    // cmdk's fuzzy filter answered "rel" with GROWW, because Billionbrains
    // contains r, e and l in order. That is the behaviour this replaces.
    const symbols = searchUniverse(universe, 'rel').map((row) => row.symbol)
    expect(symbols).not.toContain('GROWW')
  })

  it('ranks a symbol prefix above a substring buried in a name', () => {
    const symbols = searchUniverse(universe, 're').map((row) => row.symbol)
    expect(symbols.indexOf('RECLTD')).toBeLessThan(symbols.indexOf('DRREDDY'))
  })

  it('puts an exact symbol first even when others start with it', () => {
    const withExact = [...universe, entry('INF', 'Infra Holdings Ltd.')]
    expect(searchUniverse(withExact, 'inf')[0]?.symbol).toBe('INF')
  })

  it('matches case-insensitively and ignores surrounding space', () => {
    expect(searchUniverse(universe, '  ReLiAnCe  ')[0]?.symbol).toBe('RELIANCE')
  })

  it('returns nothing for an empty query rather than the whole universe', () => {
    // The palette renders only when there is a query; this makes the pure
    // function agree, so a future caller cannot paint 200 rows by accident.
    expect(searchUniverse(universe, '')).toEqual([])
    expect(searchUniverse(universe, '   ')).toEqual([])
  })

  it('caps the result list', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      entry(`REL${String(i).padStart(3, '0')}`, `Relatable Holdings ${i}`)
    )
    expect(searchUniverse(many, 'rel')).toHaveLength(SEARCH_LIMIT)
  })
})
