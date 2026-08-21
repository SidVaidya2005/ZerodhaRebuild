import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { serverEnv } from '@/lib/env.server'
import type { Database } from '@/types/database'

/**
 * The service-role client. It **bypasses RLS entirely** — the one client in the
 * project that is not subject to the security boundary — so the `server-only`
 * import above is load-bearing, not decorative: it turns any client-side import
 * of this module into a build error rather than a runtime surprise.
 *
 * `architecture.md` → System Boundaries limits its callers to server-only
 * modules. Nothing in F12 calls it; it ships with the rest of the client set,
 * and its guard was observed failing a build rather than assumed (F01's
 * falsifiability rule).
 *
 * No session is persisted and no token is auto-refreshed: this client is used
 * for one-off administrative calls, never on behalf of a user.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
