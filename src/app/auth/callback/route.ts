import { NextResponse, type NextRequest } from 'next/server'

import { LOGIN_PATH, safeNext } from '@/lib/auth/routes'
import { createClient } from '@/lib/supabase/server'

/**
 * The OAuth code exchange. Google sends the visitor here with a `code`; this
 * handler trades it for a session and writes the auth cookies, then forwards on.
 *
 * `next` is never trusted as it arrives — `safeNext()` rejects absolute and
 * protocol-relative values, which is what stops this route being an open
 * redirect for anyone who can get a visitor to click a crafted link.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Render terminates TLS at a load balancer, so `origin` is the internal
      // host there. In production the forwarded host is the real one; locally
      // there is no balancer, so `origin` is correct and is used as-is.
      const forwardedHost = request.headers.get('x-forwarded-host')
      const base =
        process.env.NODE_ENV === 'development' || !forwardedHost
          ? origin
          : `https://${forwardedHost}`

      return NextResponse.redirect(`${base}${next}`)
    }

    console.error('[auth.callback]', error)
  }

  // No code, or an exchange that failed. Either way the user sees mapped copy on
  // the login page, never the provider's error text.
  return NextResponse.redirect(`${origin}${LOGIN_PATH}?error=auth`)
}
