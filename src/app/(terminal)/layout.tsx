import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { TopNav } from '@/components/terminal/TopNav'
import { WatchlistRail } from '@/components/terminal/WatchlistSidebar'
import { LOGIN_PATH } from '@/lib/auth/routes'
import { loadHolidays } from '@/lib/market/market-hours'
import { createClient } from '@/lib/supabase/server'

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

  const [{ data: profile }, { data: funds }, holidays] = await Promise.all([
    supabase.from('profiles').select('client_id, full_name').single(),
    supabase.from('funds').select('available_cash').single(),
    loadHolidays(supabase),
  ])

  // Prefer the profile the bootstrap wrote, then Google's claim, then the email.
  // The shell must always be able to say who is acting.
  const name =
    profile?.full_name ??
    (user.user_metadata.full_name as string | undefined) ??
    user.email ??
    'Account'

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TopNav
        name={name}
        email={user.email ?? ''}
        clientId={profile?.client_id ?? null}
        availableCash={funds ? Number(funds.available_cash) : null}
        holidays={[...holidays]}
        serverNow={new Date().toISOString()}
      />
      <div className="flex flex-1">
        <WatchlistRail />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
