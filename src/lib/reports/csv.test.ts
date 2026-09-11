import { describe, expect, it } from 'vitest'

import { csvFilename, escapeCsvField, toCsv, tradesToCsv } from './csv'
import type { TradeRow } from './types'

const TRADE: TradeRow = {
  id: 'e2f0a1b2-0000-4000-8000-000000000001',
  // 09:50:01 UTC is 15:20:01 IST — the square-off minute.
  tradedAt: '2026-09-09T09:50:01.007Z',
  tradedOn: '2026-09-09',
  symbol: 'INFY',
  name: 'Infosys Ltd.',
  side: 'BUY',
  product: 'MIS',
  orderType: 'MARKET',
  quantity: 3,
  price: 1307.03,
  value: 3921.09,
  charges: 1.65,
  chargeBreakdown: {
    brokerage: 1.18,
    stt: 0,
    exchange_txn: 0.12,
    sebi_turnover: 0,
    stamp_duty: 0.12,
    dp_charge: 0,
    gst: 0.23,
  },
  realisedPnl: -18.18,
  isAutoSquareoff: true,
}

describe('escapeCsvField', () => {
  it('leaves an ordinary field unquoted', () => {
    expect(escapeCsvField('RELIANCE')).toBe('RELIANCE')
    expect(escapeCsvField(1400)).toBe('1400')
  })

  it('renders null as an empty field, not the word null', () => {
    expect(escapeCsvField(null)).toBe('')
  })

  it.each([
    ['Reliance Industries, Limited', '"Reliance Industries, Limited"'],
    ['a "quoted" name', '"a ""quoted"" name"'],
    ['two\nlines', '"two\nlines"'],
    ['carriage\rreturn', '"carriage\rreturn"'],
  ])('quotes %j', (input, expected) => {
    expect(escapeCsvField(input)).toBe(expected)
  })

  // Every negative money figure starts with `-`. An anti-formula guard that
  // prefixed those with an apostrophe would corrupt the data it was protecting.
  it('does not mangle a negative number', () => {
    expect(escapeCsvField('-18.18')).toBe('-18.18')
  })
})

describe('toCsv', () => {
  it('joins cells with commas and records with CRLF', () => {
    expect(
      toCsv([
        ['a', 'b'],
        [1, 2],
      ])
    ).toBe('a,b\r\n1,2')
  })

  it('is empty for no rows at all', () => {
    expect(toCsv([])).toBe('')
  })
})

describe('tradesToCsv', () => {
  const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n')

  it('starts with a UTF-8 BOM, so Excel reads it as UTF-8', () => {
    expect(tradesToCsv([TRADE]).startsWith('﻿')).toBe(true)
  })

  it('yields the header alone for an empty set', () => {
    const rows = lines(tradesToCsv([]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('Date (IST),Time (IST),Symbol')
  })

  it('writes one record per trade, plus the header', () => {
    expect(lines(tradesToCsv([TRADE, TRADE, TRADE]))).toHaveLength(4)
  })

  it('terminates the last record, so every line ends the same way', () => {
    expect(tradesToCsv([TRADE]).endsWith('\r\n')).toBe(true)
  })

  // The date is SQL's `traded_on` verbatim — re-deriving it here is the
  // duplication the column exists to prevent — while the time is formatted in
  // IST. 09:50 UTC is 15:20 IST, the square-off minute.
  it('takes the date from traded_on and renders the time in IST', () => {
    const [, record] = lines(tradesToCsv([TRADE]))
    expect(record?.startsWith('2026-09-09,15:20:01,INFY')).toBe(true)
  })

  it('writes money unformatted, with no symbol or separator', () => {
    const record = lines(tradesToCsv([TRADE]))[1] ?? ''
    expect(record).toContain('1307.03')
    expect(record).toContain('-18.18')
    expect(record).not.toContain('₹')
    expect(record).not.toContain('1,307')
  })

  it('carries the seven charge components, which sum to the total', () => {
    const cells = (lines(tradesToCsv([TRADE]))[1] ?? '').split(',')
    const components = cells.slice(13).map(Number)
    expect(components).toHaveLength(7)
    // §12.6, visible in the exported file rather than only on screen.
    expect(Number(components.reduce((a, b) => a + b, 0).toFixed(2))).toBe(TRADE.charges)
  })

  it('records an auto square-off as such', () => {
    expect(lines(tradesToCsv([TRADE]))[1]).toContain(',yes,')
    expect(lines(tradesToCsv([{ ...TRADE, isAutoSquareoff: false }]))[1]).toContain(',no,')
  })

  it('quotes a name containing a comma without breaking the column count', () => {
    const csv = tradesToCsv([{ ...TRADE, name: 'Reliance Industries, Limited' }])
    expect(csv).toContain('"Reliance Industries, Limited"')
  })

  it('writes 0.00 for a component the breakdown omits rather than an empty cell', () => {
    const csv = tradesToCsv([{ ...TRADE, chargeBreakdown: {} }])
    const cells = (lines(csv)[1] ?? '').split(',')
    expect(cells.slice(13)).toEqual(['0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00'])
  })
})

describe('csvFilename', () => {
  it('names the whole statement plainly', () => {
    expect(csvFilename({ from: null, to: null, symbol: null })).toBe('trades.csv')
  })

  it('records the symbol and the range, so two exports are distinguishable', () => {
    expect(csvFilename({ from: '2026-03-10', to: '2026-03-12', symbol: 'INFY' })).toBe(
      'trades-infy-2026-03-10_to_2026-03-12.csv'
    )
  })

  it('names an open-ended bound rather than leaving a gap', () => {
    expect(csvFilename({ from: null, to: '2026-03-12', symbol: null })).toBe(
      'trades-start_to_2026-03-12.csv'
    )
  })
})
