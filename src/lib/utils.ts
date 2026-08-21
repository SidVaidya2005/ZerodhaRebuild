import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Money formatting for display only. Every stored monetary figure is computed in
 * Postgres `numeric` and read back — TypeScript renders numbers, it never
 * produces one that gets stored. See trading-contract.md §1.
 *
 * `Intl.NumberFormat('en-IN')` produces Indian digit grouping natively
 * (12,34,567.50 rather than 1,234,567.50), so nothing here is hand-rolled.
 */
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const percentFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Charge rates run to five decimals (0.00307%) and carry no trailing zeros. */
const rateFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 5,
})

const quantityFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
})

/** `₹12,34,567.50`. Negatives render as `-₹12,34,567.50`. */
export function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

/**
 * `+₹1,234.50` / `−₹1,234.50`, for figures whose sign carries meaning — P&L,
 * day change. Uses a true minus sign (U+2212) rather than a hyphen so the glyph
 * aligns with `+` in a tabular column.
 *
 * Colour alone must never carry the sign (accessibility pass, feature 38), which
 * is why this exists as its own function rather than a flag on formatCurrency.
 */
export function formatSignedCurrency(value: number): string {
  const sign = value < 0 ? '−' : '+'
  return `${sign}${currencyFormatter.format(Math.abs(value))}`
}

/** `5.23%`. Takes a percentage, not a ratio — pass 5.23 for 5.23%. */
export function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`
}

/**
 * `0.00307%`, `0.1%`, `18%` — a statutory charge rate, which needs far more
 * precision than a P&L percentage and no trailing zeros.
 *
 * `formatPercent` is fixed at 2dp because that is right for day change, but it
 * renders 0.00307% as "0.00%" and 0.015% as "0.02%" — wrong numbers on the
 * pricing page rather than merely imprecise ones. Hence a separate function
 * rather than a flag: the two have genuinely different jobs.
 *
 * Takes a percentage, not a ratio — pass 0.00307 for 0.00307%.
 */
export function formatRate(value: number): string {
  return `${rateFormatter.format(value)}%`
}

/** `+5.23%` / `−5.23%`, for day change and returns. */
export function formatSignedPercent(value: number): string {
  const sign = value < 0 ? '−' : '+'
  return `${sign}${percentFormatter.format(Math.abs(value))}%`
}

/** `12,34,567` — share counts are whole numbers. */
export function formatQuantity(value: number): string {
  return quantityFormatter.format(value)
}
