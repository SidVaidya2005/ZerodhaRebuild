import { NextResponse, type NextRequest } from 'next/server'

import { LOGIN_PATH, isTerminalPath } from '@/lib/auth/routes'
import { createProxyClient } from '@/lib/supabase/proxy'

/**
 * Session refresh and the route guard, on every request that is not a static
 * asset. In Next.js 16 this file replaces `middleware.ts`, the export is named
 * `proxy`, and it runs on the Node.js runtime — which is not configurable, so
 * there is no `runtime` export here.
 *
 * Refreshing matters as much as guarding: without this pass, a Server Component
 * reading an expired token has no way to write the refreshed one back, and the
 * user is signed out mid-session.
 *
 * This is a convenience, never the security boundary. RLS in Postgres is what
 * actually protects a row (`architecture.md` → Invariants), which is why the
 * terminal pages re-check the session themselves rather than trusting this.
 */
export async function proxy(request: NextRequest) {
  const { supabase, response } = createProxyClient(request)

  // Nothing may go between creating the client and getUser(): the call is what
  // refreshes the cookies, and any earlier code can consume the request stream.
  // getUser() revalidates the token with Supabase; getSession() would trust a
  // cookie the client can write, so it is never used for authorisation.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && isTerminalPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = LOGIN_PATH
    // Carry the intended destination so signing in returns the visitor to the
    // page they asked for. `/auth/callback` re-validates it through safeNext().
    url.search = ''
    url.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)

    // Carry over whatever this pass wrote onto `response`. The case that matters
    // is an expired refresh token: `getUser()` fails, `@supabase/ssr` calls
    // setAll to *clear* the `sb-<ref>-auth-token` chunks, and returning a bare
    // redirect would drop those Set-Cookie headers — leaving the dead chunks in
    // the browser on every subsequent request. That is the HTTP 431 this
    // project already documents, arrived at from the other direction.
    const redirect = NextResponse.redirect(url)
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie)
    }
    return redirect
  }

  // Returned unmodified. Attaching anything to a different response object drops
  // the refreshed cookies this pass just set.
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
