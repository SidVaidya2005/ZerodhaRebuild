import { describe, expect, it } from 'vitest'

import { OPENING_BALANCE } from '@/lib/constants'

describe('OPENING_BALANCE', () => {
  /**
   * The other half of this assertion lives in `supabase/tests/02-bootstrap.sql`,
   * which checks a bootstrapped account holds exactly 100000.00.
   *
   * The two are deliberately not derived from each other — the trigger runs in
   * Postgres and cannot import this module — so both are pinned to
   * `trading-contract.md` §11's figure instead. Changing one without the other
   * fails a test rather than quietly opening accounts at the wrong balance.
   */
  it('is the ₹1,00,000 the trading contract specifies, matching the bootstrap trigger', () => {
    expect(OPENING_BALANCE).toBe(100000)
  })
})
