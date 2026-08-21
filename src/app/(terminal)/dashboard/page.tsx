import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { LOGIN_PATH } from '@/lib/auth/routes'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/server/actions/auth'

export const metadata: Metadata = {
  title: 'Dashboard — ZerodhaRebuild',
}

/**
 * A deliberately minimal landing page: it exists so `/dashboard` is a real
 * destination for sign-in rather than a 404, and so this feature has somewhere
 * to prove a session actually arrived. F17 replaces it wholesale with the
 * terminal shell, which is also where the avatar menu belongs.
 *
 * The session is re-checked here rather than trusted from `src/proxy.ts`. The
 * proxy is a convenience; a page that reads user data should not depend on a
 * guard running in a different layer, and `getUser()` costs one call.
 */
export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(LOGIN_PATH)

  // Google's own claims, straight from the identity — F13 is what copies these
  // into a `profiles` row and opens the account with its ₹1,00,000.
  const name = (user.user_metadata.full_name as string | undefined) ?? 'Signed in'

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-4 py-16">
      <div className="max-w-prose">
        <h1 className="text-display-sm font-semibold text-ink">{name}</h1>
        <p className="mt-4 text-body text-muted-strong">{user.email}</p>

        <p className="mt-8 text-body">
          Signed in. The terminal itself — watchlist, orders, holdings — arrives in Phase 3; this
          page exists so sign-in has somewhere to land.
        </p>

        <form action={signOut} className="mt-8">
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  )
}
