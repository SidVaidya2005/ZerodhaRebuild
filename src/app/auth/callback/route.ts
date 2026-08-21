import { NextResponse, type NextRequest } from 'next/server'

import { LOGIN_PATH, callbackBaseUrl, safeNext } from '@/lib/auth/routes'
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

  // Render terminates TLS at a load balancer, so `origin` can be the internal
  // host there. Both forwarded headers are read, and the scheme is taken from
  // x-forwarded-proto rather than assumed — Next.js sets x-forwarded-host on
  // every request, including a local `pnpm start`. Computed once, because the
  // success and failure redirects are equally wrong against a bad origin.
  const base = callbackBaseUrl({
    origin,
    forwardedHost: request.headers.get('x-forwarded-host'),
    forwardedProto: request.headers.get('x-forwarded-proto'),
  })

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${base}${next}`)
    }

    console.error('[auth.callback]', error)
  }

  // No code, or an exchange that failed. Either way the user sees mapped copy on
  // the login page, never the provider's error text.
  //
  // This uses `base` for the same reason the success path does. Sending a failed
  // sign-in to `${origin}` would redirect to Render's internal host — turning a
  // recoverable error, which has copy waiting for it on the login page, into an
  // unreachable address.
  return NextResponse.redirect(`${base}${LOGIN_PATH}?error=auth`)
}
