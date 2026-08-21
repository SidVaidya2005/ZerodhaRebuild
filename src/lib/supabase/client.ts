import { createBrowserClient } from '@supabase/ssr'

import type { Database } from '@/types/database'

/**
 * The Supabase client for Client Components.
 *
 * Not used by sign-in: F12 starts OAuth from a Server Action so the flow works
 * with JavaScript disabled. This client exists for the browser-side surfaces
 * that follow — the Realtime quote channel (F19) above all — and it reads the
 * same cookies `server.ts` and `proxy.ts` write, so all three see one session.
 *
 * Only the publishable key is ever passed here. It ships in the browser bundle
 * by design; RLS is what makes that safe.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
