import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { TopNav } from '@/components/terminal/TopNav'
import { WatchlistRail } from '@/components/terminal/WatchlistSidebar'
import { LOGIN_PATH } from '@/lib/auth/routes'
import { loadHolidays } from '@/lib/market/market-hours'
import { createClient } from '@/lib/supabase/server'
import type { UniverseEntry, WatchlistRow } from '@/lib/watchlist/schemas'

/**
 * The chrome every terminal page sits inside, and the one place the session is
 * checked.
 *
 * **Pages beneath this do not re-check.** `dashboard/page.tsx` used to, on the
 * argument that `src/proxy.ts` is a convenience rather than a boundary — true,
 * and it buys nothing once a layout exists: every page here reads through
 * RLS-scoped queries that return nothing without a session, so a second
 * `getUser()` is a round trip that cannot change an outcome. One check per
 * navigation, and no future page can forget to make it.
 *
 * The calendar is loaded here rather than in the pill, because the pill is a
 * Client Component and must not hold a database client. It is twenty rows behind
 * an indexed primary key.
 */
export default async function TerminalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(LOGIN_PATH)

  const [{ data: profile }, { data: funds }, holidays, { data: watchlist }, { data: universe }] =
    await Promise.all([
      supabase.from('profiles').select('client_id, full_name').single(),
      supabase.from('funds').select('available_cash').single(),
      loadHolidays(supabase),
      // One round trip for the panel, with the change already computed. The view
      // holds no predicate of its own — RLS on watchlist_items scopes it through
      // security_invoker, which is what the pgTAP suite falsifies.
      supabase
        .from('watchlist_rows')
        .select('symbol, name, exchange, sort_order, ltp, change, change_pct')
        .order('sort_order'),
      // The whole tradable universe, ~200 rows, for the search palette. Loaded
      // here rather than queried per keystroke: Postgres seq-scans a table this
      // small whatever index sits on it, so a round trip would buy nothing and
      // cost a network hop on every character.
      supabase
        .from('instruments')
        .select('symbol, name, exchange')
        .eq('is_active', true)
        .order('symbol'),
    ])

  // Prefer the profile the bootstrap wrote, then Google's claim, then the email.
  // The shell must always be able to say who is acting.
  const name =
    profile?.full_name ??
    (user.user_metadata.full_name as string | undefined) ??
    user.email ??
    'Account'

  // Numbers cross PostgREST as JSON numbers, but every one of these is nullable
  // — a symbol with no quote row yet has no price at all — so each is narrowed
  // rather than coerced. No arithmetic happens here: the change and its
  // percentage arrive already computed, per CLAUDE.md's money rule.
  const rows: WatchlistRow[] = (watchlist ?? []).map((row) => ({
    symbol: row.symbol ?? '',
    name: row.name ?? '',
    exchange: row.exchange ?? 'NSE',
    sortOrder: row.sort_order ?? 0,
    ltp: row.ltp === null ? null : Number(row.ltp),
    change: row.change === null ? null : Number(row.change),
    changePct: row.change_pct === null ? null : Number(row.change_pct),
  }))

  const instruments: UniverseEntry[] = (universe ?? []).map((row) => ({
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
  }))

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav
        name={name}
        email={user.email ?? ''}
        clientId={profile?.client_id ?? null}
        availableCash={funds ? Number(funds.available_cash) : null}
        holidays={[...holidays]}
        serverNow={new Date().toISOString()}
        watchlist={rows}
        universe={instruments}
      />
      <div className="flex flex-1">
        <WatchlistRail rows={rows} universe={instruments} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
