import { readdirSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  MODIFY_ERROR_COPY,
  MODIFY_REASONS,
  ORDER_ERROR_COPY,
  REJECTION_CODES,
  orderPlacedMessage,
  toFaultCode,
  toModifyCode,
  toRejectionCode,
} from '@/lib/trading/order-copy'
import type { PlacedOrder } from '@/lib/trading/schemas'

describe('ORDER_ERROR_COPY', () => {
  // The guard that matters: a sixth rejection code added to the SQL and not
  // here would otherwise reach a user as a bare `SOME_NEW_REASON`.
  it.each(REJECTION_CODES)('has copy for %s', (code) => {
    expect(ORDER_ERROR_COPY[code]).toBeTruthy()
  })

  it('never leaves a code without copy', () => {
    for (const message of Object.values(ORDER_ERROR_COPY)) {
      expect(message.length).toBeGreaterThan(10)
    }
  })

  // `code-standards.md`: raw database text never reaches a UI string. A code is
  // database text, so no message may simply echo one back.
  it('renders prose, never a code', () => {
    for (const message of Object.values(ORDER_ERROR_COPY)) {
      expect(message).not.toMatch(/[A-Z]{4,}_[A-Z]/)
    }
  })

  // The unconfirmed case must not resolve the ambiguity it exists to report:
  // "try again" would invite a double-place, and "failed" could be a lie.
  it('does not tell an unconfirmed order to retry', () => {
    expect(ORDER_ERROR_COPY.UNCONFIRMED).toMatch(/check orders/i)
    expect(ORDER_ERROR_COPY.UNCONFIRMED).not.toMatch(/^try again/i)
  })
})

describe('toRejectionCode', () => {
  it.each(REJECTION_CODES)('passes %s through', (code) => {
    expect(toRejectionCode(code)).toBe(code)
  })

  it.each([['SOMETHING_NEW'], [''], [null]])('degrades %s to UNKNOWN', (reason) => {
    expect(toRejectionCode(reason)).toBe('UNKNOWN')
  })
})

describe('toFaultCode', () => {
  // 42501 is `place_order`'s no-session raise. The order may or may not exist,
  // so it is the unconfirmed case rather than a flat failure.
  it('reads a 42501 as unconfirmed', () => {
    expect(toFaultCode({ code: '42501' })).toBe('UNCONFIRMED')
  })

  it.each([[{ code: '23514' }], [{}], [null]])('reads %o as UNKNOWN', (error) => {
    expect(toFaultCode(error)).toBe('UNKNOWN')
  })
})

describe('orderPlacedMessage', () => {
  const base: PlacedOrder = {
    orderId: '00000000-0000-0000-0000-000000000000',
    status: 'COMPLETE',
    symbol: 'TCS',
    side: 'BUY',
    quantity: 10,
    price: 2999.5,
  }

  it('names the fill price on a completed buy', () => {
    expect(orderPlacedMessage(base)).toBe('Bought 10 TCS at ₹2,999.50.')
  })

  it('names the fill price on a completed sell', () => {
    expect(orderPlacedMessage({ ...base, side: 'SELL' })).toBe('Sold 10 TCS at ₹2,999.50.')
  })

  it('says a limit buy is waiting, at the limit the user set', () => {
    expect(orderPlacedMessage({ ...base, status: 'OPEN', price: 2950 })).toBe(
      'Limit buy placed — 10 TCS at ₹2,950.00, waiting to fill.'
    )
  })

  it('says a limit sell is waiting', () => {
    expect(orderPlacedMessage({ ...base, status: 'OPEN', side: 'SELL', price: 3100 })).toBe(
      'Limit sell placed — 10 TCS at ₹3,100.00, waiting to fill.'
    )
  })

  // The read-back can fail without the order failing, and a missing price must
  // not become "at ₹0.00" — the one way this copy could actively mislead.
  it('drops the price rather than inventing one when the read-back gave none', () => {
    expect(orderPlacedMessage({ ...base, price: null })).toBe('Bought 10 TCS.')
    expect(orderPlacedMessage({ ...base, status: 'OPEN', price: null })).toBe(
      'Limit buy placed — 10 TCS, waiting to fill.'
    )
  })

  it('groups a large quantity the Indian way', () => {
    expect(orderPlacedMessage({ ...base, quantity: 100000 })).toContain('1,00,000 TCS')
  })
})

describe('modify copy', () => {
  /**
   * Asserted over the map rather than case by case, exactly as the rejection
   * codes are: a sixth reason added in SQL and forgotten here would otherwise
   * reach the screen as a bare identifier, and no per-case test would notice
   * because no per-case test would exist for it.
   */
  it('has copy for every reason modify_order can return', () => {
    for (const reason of MODIFY_REASONS) {
      expect(MODIFY_ERROR_COPY[reason]).toBeTruthy()
    }
  })

  /**
   * The test above cannot catch the drift its own comment describes, because it
   * iterates `MODIFY_REASONS` — a reason present in SQL and absent here is
   * invisible to it. That is not hypothetical: `NO_HOLDING` shipped in
   * `20260906110000`, was asserted by `12-modify-order.sql`, and still reached
   * users as "that change did not go through" until the Phase 4 checkpoint.
   *
   * So this one reads the other side. It parses the reason literals out of the
   * newest migration that defines `modify_order` and demands set equality, which
   * fails in the direction that actually hurts: SQL gained a reason, TypeScript
   * did not.
   */
  it('knows exactly the reasons the live modify_order can return', () => {
    const dir = 'supabase/migrations'
    const defining = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) =>
        /create or replace function public\.modify_order/i.test(readFileSync(`${dir}/${f}`, 'utf8'))
      )

    expect(defining.length, 'no migration defines modify_order').toBeGreaterThan(0)

    const sql = readFileSync(`${dir}/${defining[defining.length - 1]}`, 'utf8')
    const inSql = new Set(
      [...sql.matchAll(/select\s+false\s*,\s*'([A-Z_]+)'::text/g)].map((m) => m[1])
    )

    expect([...inSql].sort()).toEqual([...MODIFY_REASONS].sort())
  })

  it('degrades an unknown reason to UNKNOWN rather than rendering it', () => {
    expect(toModifyCode('SOMETHING_NEW')).toBe('UNKNOWN')
    expect(toModifyCode(null)).toBe('UNKNOWN')
  })

  it('passes through every reason it does know', () => {
    for (const reason of MODIFY_REASONS) {
      expect(toModifyCode(reason)).toBe(reason)
    }
  })

  // The whole point of the subtransaction in `modify_order` is that a failed
  // modify changes nothing. If the copy did not say so, the user's only safe
  // assumption would be that their order is now in an unknown state.
  it('tells the user the order is untouched when the new terms are unaffordable', () => {
    expect(MODIFY_ERROR_COPY.INSUFFICIENT_FUNDS).toContain('unchanged')
  })
})
