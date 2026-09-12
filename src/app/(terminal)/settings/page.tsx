import type { Metadata } from 'next'

import { PersistedThemeToggle } from '@/components/terminal/PersistedThemeToggle'
import { ProfileCard } from '@/components/terminal/ProfileCard'
import { ResetAccountDialog } from '@/components/terminal/ResetAccountDialog'
import { Button } from '@/components/ui/button'
import type { FundsOverview } from '@/lib/funds/types'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/server/actions/auth'
import { throwOnReadError } from '@/lib/read-errors'

export const metadata: Metadata = {
  title: 'Settings — ZerodhaRebuild',
}

/**
 * The account's own page: who is signed in, the one stored preference, and the
 * two irreversible acts.
 *
 * **Almost entirely read-only.** The only field any user can write in this
 * whole feature is `profiles.theme`, and F35 narrows the table's UPDATE grant to
 * exactly that column — before it, `grant select, update on public.profiles`
 * let an authenticated user rewrite their own `client_id` by direct PostgREST
 * call.
 *
 * **No `OrderChannel`.** Every other terminal page mounts one because a fill
 * moves what it renders; nothing here changes when an order fills except the
 * reset dialog's counts, and re-rendering the page under a user reading their
 * own client ID would be motion without information.
 *
 * `funds_overview` is read for the reset dialog alone — it names what it is
 * about to delete, and a dialog that said "your trading history" instead is one
 * a user skims rather than weighs.
 */
export default async function SettingsPage() {
  const supabase = await createClient()

  const [
    {
      data: { user },
    },
    { data: profile, error: profileError },
    { data: overviewRow, error: overviewError },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('profiles').select('client_id').single(),
    supabase
      .from('funds_overview')
      .select(
        'available_cash, used_margin, opening_balance, realised_pnl, order_count, trade_count, holding_count, position_count, ledger_count'
      )
      .maybeSingle(),
  ])

  // Logged and thrown, so `error.tsx` catches it. A failed read here used to
  // render a plausible-looking page with an em dash where the client ID
  // belongs — a wrong page rather than an honest failure. (F36)
  throwOnReadError('settings', {
    profiles: profileError,
    funds_overview: overviewError,
  })

  const overview: FundsOverview = {
    availableCash: Number(overviewRow?.available_cash ?? 0),
    usedMargin: Number(overviewRow?.used_margin ?? 0),
    openingBalance: Number(overviewRow?.opening_balance ?? 0),
    realisedPnl: Number(overviewRow?.realised_pnl ?? 0),
    orderCount: Number(overviewRow?.order_count ?? 0),
    tradeCount: Number(overviewRow?.trade_count ?? 0),
    holdingCount: Number(overviewRow?.holding_count ?? 0),
    positionCount: Number(overviewRow?.position_count ?? 0),
    ledgerCount: Number(overviewRow?.ledger_count ?? 0),
  }

  // The same chain the terminal layout uses, and for the same reason: the shell
  // must always be able to say who is acting.
  const meta = user?.user_metadata ?? {}
  const name =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    user?.email ??
    'Account'
  const avatarUrl =
    (meta.avatar_url as string | undefined) ?? (meta.picture as string | undefined) ?? null

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-6 sm:px-6">
      <h1 className="text-title text-ink">Settings</h1>
      <p className="mt-1 text-body-sm text-muted">
        Your account, how this terminal looks, and the two things you cannot undo.
      </p>

      <section className="mt-6" aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="text-title-sm font-semibold text-ink">
          Profile
        </h2>
        <p className="mt-1 text-body-sm text-muted">
          Your name, email and picture come from Google and are not editable here. The client ID was
          issued by this simulator when you signed up.
        </p>

        <div className="mt-4">
          <ProfileCard
            name={name}
            email={user?.email ?? ''}
            avatarUrl={avatarUrl}
            clientId={profile?.client_id ?? null}
          />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading" className="text-title-sm font-semibold text-ink">
          Appearance
        </h2>

        <div className="mt-4 flex items-center justify-between gap-4 rounded-md border border-hairline bg-surface p-4">
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-ink">Theme</p>
            <p className="mt-1 text-caption text-muted">
              Switch between the dark and light terminal. Saved to your account, so it follows you
              to any browser you sign in from.
            </p>
          </div>
          <PersistedThemeToggle />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="account-heading">
        <h2 id="account-heading" className="text-title-sm font-semibold text-ink">
          Account
        </h2>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-md border border-hairline bg-surface p-4">
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-ink">Reset account</p>
            <p className="mt-1 text-caption text-muted">
              Deletes every order, trade, holding and position, and returns your balance to the
              opening credit. Your profile and watchlist are kept.
            </p>
          </div>
          {/* The same component `/funds` mounts, which is what makes "behaves
              identically" structural rather than a matter of matching copy. */}
          <ResetAccountDialog overview={overview} />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-md border border-hairline bg-surface p-4">
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-ink">Sign out</p>
            <p className="mt-1 text-caption text-muted">
              Ends this session. Your simulated account is untouched.
            </p>
          </div>
          {/* A real form posting to a Server Action, so it works with
              JavaScript disabled — the F07B standard `AvatarMenu` follows. */}
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </section>
    </div>
  )
}
