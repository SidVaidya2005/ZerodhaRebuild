import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import type { Database } from '@/types/database'

/**
 * The session-refreshing client for `src/proxy.ts`, and the mutable response it
 * writes refreshed cookies onto.
 *
 * Copied from `architecture.md` → Key Patterns verbatim. The cookie handling is
 * deliberately not re-derived: `setAll` has to write to **both** the request
 * (so the same pass reads the refreshed token) and a rebuilt response (so the
 * browser receives it). Getting one of the two wrong logs users out at random,
 * intermittently, days later.
 *
 * The caller must return `response` unmodified, and must place no code between
 * constructing this client and calling `getUser()`.
 */
export function createProxyClient(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // `response` is read through a getter because `setAll` above reassigns it.
  return {
    supabase,
    get response() {
      return response
    },
  }
}
