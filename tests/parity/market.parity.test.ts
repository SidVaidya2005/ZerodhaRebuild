import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  IST_OFFSET_MINUTES,
  MARKET_CLOSE_IST,
  MARKET_OPEN_IST,
  PRE_OPEN_START_IST,
  QUOTE_STALE_AFTER_MS,
} from '@shared/market-constants.ts'
import { marketStatusAt, type HolidaySet } from '@shared/market-hours.ts'

/**
 * The two session implementations are one session implementation.
 *
 * `architecture.md` used to say market time is decided in exactly one place.
 * F24 broke that deliberately: `place_order` has to reject a MARKET order
 * outside the session, `place_order` is granted to `authenticated`, and a check
 * that lives in a Server Action is bypassed by anything calling the RPC
 * directly. So the rule became "decided in two places, proven equal here" —
 * which is only worth anything if this test actually drives the boundaries.
 *
 * Every instant below is a boundary or one second off one. A test that sampled
 * random times would agree almost always and never exercise 09:15:00, which is
 * the whole point.
 */

let db: Client

beforeAll(async () => {
  db = new Client({ connectionString: process.env.TEST_DATABASE_URL })
  await db.connect()
  // Read-only, like the rest of tier 4: the holiday row is inserted inside a
  // transaction that is rolled back in `afterAll`.
  await db.query('begin')
  await db.query(
    `insert into public.market_holidays (trading_date, description)
     values ('2026-08-26', 'Parity fixture: a Wednesday NSE is closed')
     on conflict (trading_date) do nothing`
  )
})

afterAll(async () => {
  await db.query('rollback')
  await db.end()
})

/** An IST wall-clock time as the UTC instant it occurs at. */
function ist(date: string, hours: number, minutes: number, seconds = 0): Date {
  return new Date(
    Date.parse(`${date}T00:00:00Z`) +
      (hours * 60 + minutes - IST_OFFSET_MINUTES) * 60_000 +
      seconds * 1000
  )
}

const HOLIDAYS: HolidaySet = new Set(['2026-08-26'])

// 2026-08-24 is a Monday, 2026-08-26 the seeded holiday, 2026-08-29 a Saturday
// and 2026-08-30 a Sunday.
const BOUNDARIES: ReadonlyArray<{ at: Date; label: string }> = [
  { at: ist('2026-08-24', 0, 0), label: 'Monday midnight IST' },
  { at: ist('2026-08-24', 8, 59, 59), label: 'one second before pre-open' },
  { at: ist('2026-08-24', 9, 0), label: 'pre-open opens' },
  { at: ist('2026-08-24', 9, 14, 59), label: 'one second before the session' },
  { at: ist('2026-08-24', 9, 15), label: 'the session opens' },
  { at: ist('2026-08-24', 12, 0), label: 'midday' },
  { at: ist('2026-08-24', 15, 19, 59), label: 'one second before square-off' },
  { at: ist('2026-08-24', 15, 20), label: 'square-off, still an open session' },
  { at: ist('2026-08-24', 15, 29, 59), label: 'one second before the close' },
  { at: ist('2026-08-24', 15, 30), label: 'the close' },
  { at: ist('2026-08-24', 23, 59, 59), label: 'Monday, last second IST' },
  { at: ist('2026-08-26', 12, 0), label: 'midday on a seeded holiday' },
  { at: ist('2026-08-26', 9, 15), label: 'the session open on a holiday' },
  { at: ist('2026-08-29', 12, 0), label: 'midday on a Saturday' },
  { at: ist('2026-08-30', 12, 0), label: 'midday on a Sunday' },
]

describe('the session constants are the same constants', () => {
  it('market_constants() matches _shared/market-constants.ts', async () => {
    const { rows } = await db.query('select * from public.market_constants()')
    const c = rows[0]

    expect(Number(c.ist_offset_minutes)).toBe(IST_OFFSET_MINUTES)
    expect(Number(c.pre_open_start_ist)).toBe(PRE_OPEN_START_IST)
    expect(Number(c.market_open_ist)).toBe(MARKET_OPEN_IST)
    expect(Number(c.market_close_ist)).toBe(MARKET_CLOSE_IST)
    expect(Number(c.quote_stale_after_ms)).toBe(QUOTE_STALE_AFTER_MS)
  })
})

describe('the two session implementations agree', () => {
  it.each(BOUNDARIES)('agrees at $label', async ({ at }) => {
    const { rows } = await db.query<{ state: string }>(
      'select public.market_state($1::timestamptz) as state',
      [at.toISOString()]
    )

    expect(rows[0]?.state).toBe(marketStatusAt(at, HOLIDAYS).state)
  })

  // The boundary list is hand-built, so it can only prove what it contains. A
  // dense sweep of one trading day catches an off-by-one the list would miss —
  // a `<=` where the shared module has `<`, say.
  it('agrees on every minute of a full trading day', async () => {
    // One query, not 1440 round trips: the sweep is dense precisely so it is
    // cheap to make it denser, and a per-minute query to a hosted database
    // times out long before it finds anything.
    const start = ist('2026-08-24', 0, 0)
    const { rows } = await db.query<{ at: Date; state: string }>(
      `select g.at, public.market_state(g.at) as state
         from generate_series($1::timestamptz, $1::timestamptz + interval '1439 minutes',
                              interval '1 minute') as g(at)`,
      [start.toISOString()]
    )

    expect(rows).toHaveLength(24 * 60)

    const mismatches = rows
      .filter((row) => row.state !== marketStatusAt(new Date(row.at), HOLIDAYS).state)
      .map((row) => `${new Date(row.at).toISOString()}: sql=${row.state}`)

    expect(mismatches).toEqual([])
  })
})
