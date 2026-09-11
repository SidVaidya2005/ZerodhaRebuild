import type { TradeRow } from './types'

/**
 * The trade history as a CSV file.
 *
 * Pure and tier-1 tested, because the route handler that serves it cannot be:
 * no tier drives a route handler with a session cookie, so everything except the
 * database read lives here where it can be falsified.
 *
 * **Money is written unformatted** — `1400.00`, not `₹1,400.00`. The file exists
 * to be opened in a spreadsheet and summed; a rupee sign and a thousands
 * separator would make every money column text. Formatting is what the screen is
 * for.
 */

/** RFC 4180's line terminator. Excel and Numbers both want CRLF. */
const CRLF = '\r\n'

/**
 * A UTF-8 BOM.
 *
 * Excel on Windows reads a BOM-less UTF-8 file as the system code page, which
 * turns every non-ASCII character in an instrument name into mojibake. Three
 * bytes is a cheap price for a file that opens correctly everywhere.
 */
const BOM = '﻿'

export type CsvCell = string | number | boolean | null

/**
 * One field, quoted only when it has to be.
 *
 * RFC 4180: quote when the value contains a comma, a double quote, CR or LF, and
 * escape an inner quote by doubling it.
 *
 * **No spreadsheet-formula guard, deliberately.** The usual mitigation prefixes
 * a leading `=`, `+`, `-` or `@` with an apostrophe — but every negative money
 * figure in this file starts with `-`, so applying it here would corrupt the
 * data it was meant to protect. Nothing in these columns is user-authored: the
 * numbers come from Postgres and the names from the seeded `instruments` table.
 */
export function escapeCsvField(value: CsvCell): string {
  if (value === null) return ''

  const text = typeof value === 'string' ? value : String(value)
  if (!/[",\r\n]/.test(text)) return text

  return `"${text.replaceAll('"', '""')}"`
}

/** A matrix of cells — header row included — as CSV text. */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => row.map(escapeCsvField).join(',')).join(CRLF)
}

/**
 * The columns, in the order they appear in the file.
 *
 * The seven charge components ride along after the total, so the exported file
 * carries the same detail the expandable row does — §12.6 guarantees they sum to
 * `Charges`, which makes the export auditable in the spreadsheet rather than
 * only on screen.
 */
const HEADER: readonly string[] = [
  'Date (IST)',
  'Time (IST)',
  'Symbol',
  'Name',
  'Side',
  'Product',
  'Order type',
  'Quantity',
  'Price',
  'Value',
  'Charges',
  'Realised P&L',
  'Auto square-off',
  'Brokerage',
  'STT',
  'Exchange transaction',
  'SEBI turnover fee',
  'Stamp duty',
  'DP charge',
  'GST',
]

const CHARGE_KEYS: readonly string[] = [
  'brokerage',
  'stt',
  'exchange_txn',
  'sebi_turnover',
  'stamp_duty',
  'dp_charge',
  'gst',
]

/**
 * IST time of day. The **date** is not computed here — `tradedOn` already is the
 * IST calendar day, decided in SQL, and re-deriving it in TypeScript is exactly
 * the duplication `trade_history.traded_on` exists to prevent.
 */
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** The complete file contents for a set of trades, BOM included. */
export function tradesToCsv(trades: readonly TradeRow[]): string {
  const rows: CsvCell[][] = [[...HEADER]]

  for (const trade of trades) {
    rows.push([
      trade.tradedOn,
      timeFormatter.format(new Date(trade.tradedAt)),
      trade.symbol,
      trade.name,
      trade.side,
      trade.product,
      trade.orderType,
      trade.quantity,
      trade.price.toFixed(2),
      trade.value.toFixed(2),
      trade.charges.toFixed(2),
      trade.realisedPnl.toFixed(2),
      trade.isAutoSquareoff ? 'yes' : 'no',
      ...CHARGE_KEYS.map((key) => (trade.chargeBreakdown[key] ?? 0).toFixed(2)),
    ])
  }

  // A trailing CRLF, so the last record is terminated like every other one and a
  // naive line-splitting reader does not treat it as special.
  return `${BOM}${toCsv(rows)}${CRLF}`
}

/**
 * A filename that records what the file actually contains.
 *
 * A folder of files all called `trades.csv` is a folder of files nobody can tell
 * apart, and the range is the thing that distinguishes two exports of the same
 * account.
 */
export function csvFilename(query: {
  from: string | null
  to: string | null
  symbol: string | null
}): string {
  const parts = ['trades']
  if (query.symbol !== null) parts.push(query.symbol.toLowerCase())
  if (query.from !== null || query.to !== null) {
    parts.push(`${query.from ?? 'start'}_to_${query.to ?? 'today'}`)
  }
  return `${parts.join('-')}.csv`
}
