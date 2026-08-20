import { describe, expect, it } from 'vitest'

import {
  cn,
  formatCurrency,
  formatPercent,
  formatQuantity,
  formatSignedCurrency,
  formatSignedPercent,
} from '@/lib/utils'

describe('formatCurrency', () => {
  it('groups digits the Indian way, not the western way', () => {
    expect(formatCurrency(1234567.5)).toBe('₹12,34,567.50')
  })

  it('renders the opening balance exactly', () => {
    expect(formatCurrency(100000)).toBe('₹1,00,000.00')
  })

  it('always shows two decimal places', () => {
    expect(formatCurrency(1234)).toBe('₹1,234.00')
    expect(formatCurrency(0)).toBe('₹0.00')
  })

  it('keeps the sign ahead of the symbol for negatives', () => {
    expect(formatCurrency(-1234567.5)).toBe('-₹12,34,567.50')
  })
})

describe('formatSignedCurrency', () => {
  it('leads a gain with a plus', () => {
    expect(formatSignedCurrency(1234.5)).toBe('+₹1,234.50')
  })

  it('leads a loss with a true minus sign, not a hyphen', () => {
    expect(formatSignedCurrency(-1234.5)).toBe('−₹1,234.50')
  })

  it('treats zero as non-negative', () => {
    expect(formatSignedCurrency(0)).toBe('+₹0.00')
  })
})

describe('formatPercent', () => {
  it('renders two decimals with a trailing sign', () => {
    expect(formatPercent(5.234)).toBe('5.23%')
  })

  it('signs a change explicitly when asked', () => {
    expect(formatSignedPercent(5.23)).toBe('+5.23%')
    expect(formatSignedPercent(-5.23)).toBe('−5.23%')
  })
})

describe('formatQuantity', () => {
  it('groups share counts without decimals', () => {
    expect(formatQuantity(1234567)).toBe('12,34,567')
  })
})

describe('cn', () => {
  it('lets a later utility win a Tailwind conflict', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('drops falsey values', () => {
    expect(cn('text-body', false && 'hidden', undefined)).toBe('text-body')
  })
})
