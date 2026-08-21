import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from '@/types/database'

/**
 * The Supabase client for React Server Components and Server Actions.
 *
 * Copied from `architecture.md` → Key Patterns verbatim; the cookie handling is
 * not re-derived, because getting it subtly wrong produces sessions that work
 * until they silently do not.
 *
 * `code-standards.md` allows `createServerClient` to be called only from inside
 * `src/lib/supabase/`. Feature 12 adds the browser, proxy and admin clients
 * alongside this one — this file is the first of the set, not a stand-in for it.
 *
 * With no session cookie present the request runs as the `anon` role, which is
 * exactly what the public support form needs and exactly what its RLS policy is
 * written against.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // src/proxy.ts refreshes the session instead (feature 12).
          }
        },
      },
    }
  )
}
