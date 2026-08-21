import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { IST_OFFSET_MINUTES } from '@/lib/constants'
import {
  getMarketStatus,
  isTradingDay,
  isTradingSession,
  isTradingSessionAt,
  loadHolidays,
  marketStatusAt,
  type HolidayReader,
  type HolidaySet,
} from '@/lib/market/market-hours'
import type { Database } from '@/types/database'

/**
 * The calendar readers take a structural client, so `_shared/` can stay
 * import-free and be loaded by Deno. Nothing in the app calls them until F20,
 * which means nothing would otherwise prove a *real* client still satisfies
 * that shape — this assertion fails the build the moment it stops being true,
 * rather than letting F20 discover it.
 */
type RealClientIsAHolidayReader = SupabaseClient<Database> extends HolidayReader ? true : never
const _realClientIsAHolidayReader: RealClientIsAHolidayReader = true

/** The 2026 calendar F14 seeded, trimmed to the dates these tests use. */
const HOLIDAYS: HolidaySet = new Set([
  '2026-01-26', // Republic Day — a Monday
  '2026-02-15', // Mahashivratri — a Sunday, already closed
  '2026-03-03', // Holi — a Tuesday
])

/** An instant, given as IST wall-clock time. */
function ist(date: string, time: string): Date {
  return new Date(`${date}T${time}+05:30`)
}

describe('the IST offset assumption', () => {
  /**
   * The module uses a fixed +05:30 rather than a timezone database, on the
   * grounds that India has had no daylight saving since 1945. That is an
   * assumption about the world, so it is checked against the platform's own
   * timezone data rather than asserted in a comment.
   */
  it('matches Intl across the year, including both hemispheres’ DST changes', () => {
    const format = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    for (const iso of [
      '2026-01-15T06:30:00Z',
      '2026-03-29T06:30:00Z', // EU DST begins
      '2026-06-21T06:30:00Z',
      '2026-11-01T06:30:00Z', // US DST ends
      '2026-12-31T18:30:00Z', // crosses midnight in IST
    ]) {
      const at = new Date(iso)
      const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000)
      const ours = `${shifted.toISOString().slice(0, 10)}, ${shifted.toISOString().slice(11, 16)}`
      expect(format.format(at).replace(/ /g, ' '), iso).toBe(ours)
    }
  })
})

describe('session boundaries', () => {
  const day = '2026-08-20' // an ordinary Thursday

  it('is closed one second before the open and open on the stroke', () => {
    expect(isTradingSessionAt(ist(day, '09:14:59'), HOLIDAYS)).toBe(false)
    expect(isTradingSessionAt(ist(day, '09:15:00'), HOLIDAYS)).toBe(true)
  })

  it('is open one second before the close and closed on the stroke', () => {
    expect(isTradingSessionAt(ist(day, '15:29:59'), HOLIDAYS)).toBe(true)
    expect(isTradingSessionAt(ist(day, '15:30:00'), HOLIDAYS)).toBe(false)
  })

  it('outranks the cron window that invokes the tick', () => {
    // 08:45 IST is 03:15 UTC, which `* 3-10 * * 1-5` fires on: the scheduler
    // will call the tick here, half an hour before the market does anything.
    // The window is a cost bound — no hours field can express 09:15–15:30 — so
    // if the gate ever agreed with the schedule the tick would write quotes
    // into a closed market every weekday morning.
    const at = ist(day, '08:45:00')
    expect(at.getUTCHours()).toBe(3) // inside the cron window
    expect(isTradingSessionAt(at, HOLIDAYS)).toBe(false)
    expect(marketStatusAt(at, HOLIDAYS).state).toBe('CLOSED')
  })

  it('does not treat pre-open as a session', () => {
    // The call auction is not continuous trading: no quote is written and no
    // order fills, so the gate must say false even though the state is PRE_OPEN.
    expect(marketStatusAt(ist(day, '09:05:00'), HOLIDAYS).state).toBe('PRE_OPEN')
    expect(isTradingSessionAt(ist(day, '09:05:00'), HOLIDAYS)).toBe(false)
  })

  it('is still open through the 15:20 square-off', () => {
    // Square-off happens during the session, not after it. If this were false
    // the square-off job could never run.
    expect(isTradingSessionAt(ist(day, '15:20:00'), HOLIDAYS)).toBe(true)
  })
})

describe('the timezone is IST, not the server’s', () => {
  /**
   * 04:00 UTC is 09:30 IST — inside the session. A server in UTC or New York
   * reading local hours would call it closed, which is the bug this guards.
   */
  it('reports the same state whatever TZ the process runs in', () => {
    const duringSession = new Date('2026-08-20T04:00:00Z')
    expect(isTradingSessionAt(duringSession, HOLIDAYS)).toBe(true)

    // 23:00 UTC is 04:30 IST the next day — outside the session, and on a date
    // the server's own calendar has not reached yet.
    const overnight = new Date('2026-08-20T23:00:00Z')
    const status = marketStatusAt(overnight, HOLIDAYS)
    expect(status.state).toBe('CLOSED')
    expect(status.istDate).toBe('2026-08-21')
  })
})

describe('the published calendar', () => {
  it('closes the market on a holiday that falls on a weekday', () => {
    // Republic Day 2026 is a Monday: a weekday the market is shut. 11:00 IST is
    // 05:30 UTC, so `* 3-10 * * 1-5` fires the tick straight through it — no
    // cron expression can encode ~15 annual closures, which is the whole reason
    // this calendar outranks the schedule. `03-reference-data.sql` pins the same
    // date as really present in `market_holidays`; this pins what it means.
    const at = ist('2026-01-26', '11:00:00')
    expect(at.getUTCHours()).toBe(5) // inside the cron window
    expect(isTradingSessionAt(at, HOLIDAYS)).toBe(false)
    expect(isTradingDay('2026-01-26', HOLIDAYS)).toBe(false)
  })

  it('changes nothing for a holiday that falls on a Sunday', () => {
    // NSE publishes these and F14 stores them as published; the weekend rule
    // already closed the day, so the entry is redundant rather than wrong.
    expect(isTradingDay('2026-02-15', HOLIDAYS)).toBe(false)
    expect(isTradingDay('2026-02-16', HOLIDAYS)).toBe(true)
  })

  it('closes the market at the weekend', () => {
    expect(isTradingSessionAt(ist('2026-08-22', '11:00:00'), HOLIDAYS)).toBe(false) // Saturday
    expect(isTradingSessionAt(ist('2026-08-23', '11:00:00'), HOLIDAYS)).toBe(false) // Sunday
  })
})

describe('next transition', () => {
  it('counts down to the open during pre-open', () => {
    const status = marketStatusAt(ist('2026-08-20', '09:05:00'), HOLIDAYS)
    expect(status.state).toBe('PRE_OPEN')
    expect(status.nextTransition.toISOString()).toBe(ist('2026-08-20', '09:15:00').toISOString())
  })

  it('counts down to the close during the session', () => {
    const status = marketStatusAt(ist('2026-08-20', '11:00:00'), HOLIDAYS)
    expect(status.state).toBe('OPEN')
    expect(status.nextTransition.toISOString()).toBe(ist('2026-08-20', '15:30:00').toISOString())
  })

  it('skips the weekend after Friday’s close', () => {
    // 2026-08-21 is a Friday; the next transition is Monday's pre-open, not
    // Saturday's — the bug a naive "tomorrow at 09:00" would introduce.
    const status = marketStatusAt(ist('2026-08-21', '16:00:00'), HOLIDAYS)
    expect(status.state).toBe('CLOSED')
    expect(status.nextTransition.toISOString()).toBe(ist('2026-08-24', '09:00:00').toISOString())
  })

  it('skips a holiday as well as the weekend', () => {
    // Friday 2026-01-23 closes; Monday the 26th is Republic Day, so the next
    // transition is Tuesday the 27th.
    const status = marketStatusAt(ist('2026-01-23', '16:00:00'), HOLIDAYS)
    expect(status.nextTransition.toISOString()).toBe(ist('2026-01-27', '09:00:00').toISOString())
  })

  it('points at today’s pre-open in the small hours of a trading day', () => {
    const status = marketStatusAt(ist('2026-08-20', '03:00:00'), HOLIDAYS)
    expect(status.state).toBe('CLOSED')
    expect(status.nextTransition.toISOString()).toBe(ist('2026-08-20', '09:00:00').toISOString())
  })
})

describe('the database-backed wrappers', () => {
  /** A structural stand-in for the Supabase client — no network, no mocking library. */
  function fakeClient(result: { data?: { trading_date: string }[]; error?: unknown }) {
    return {
      from: () => ({ select: async () => result }),
    } as unknown as Parameters<typeof loadHolidays>[0]
  }

  it('loads the published calendar into the set the pure core wants', async () => {
    const holidays = await loadHolidays(
      fakeClient({ data: [{ trading_date: '2026-01-26' }, { trading_date: '2026-03-03' }] })
    )
    expect(holidays.has('2026-01-26')).toBe(true)
    expect(holidays.size).toBe(2)
  })

  it('throws rather than quietly reporting an open market', async () => {
    // The failure mode this prevents: a read error yielding an empty set, which
    // is indistinguishable from a year with no holidays — and would have the
    // market trading on Republic Day with nothing in the logs.
    await expect(
      loadHolidays(fakeClient({ error: { message: 'connection refused' } }))
    ).rejects.toThrow('MARKET_CALENDAR_UNAVAILABLE')
  })

  it('gates the session using the loaded calendar', async () => {
    const client = fakeClient({ data: [{ trading_date: '2026-01-26' }] })
    expect(await isTradingSession(client, ist('2026-01-26', '11:00:00'))).toBe(false)
    expect(await isTradingSession(client, ist('2026-01-27', '11:00:00'))).toBe(true)
  })

  it('reports the status the pill renders', async () => {
    const client = fakeClient({ data: [] })
    const status = await getMarketStatus(client, ist('2026-08-20', '09:05:00'))
    expect(status.state).toBe('PRE_OPEN')
  })
})
