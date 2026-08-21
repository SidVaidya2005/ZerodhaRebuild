'use server'

import { redirect } from 'next/navigation'

import { LOGIN_PATH, safeNext } from '@/lib/auth/routes'
import { env } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

/**
 * The two auth actions.
 *
 * **Both deviate from `code-standards.md`'s Server Action shape** — no
 * `input: unknown`, no `ActionResult<T>` — and the deviation is the point: they
 * are submitted by a plain `<form action={...}>`, so sign-in works with
 * JavaScript disabled, the same standard F07B set for the support form. An
 * action that ends in a redirect has no result to return. `code-standards.md`
 * carries this exception alongside the `useActionState` one.
 *
 * `redirect()` works by throwing a `NEXT_REDIRECT` error that the framework
 * catches, so every call below sits **outside** any `try`. Wrapping one would
 * swallow the redirect and leave the user on a page that silently did nothing.
 */
export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get('next')?.toString())

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Absolute, and built from NEXT_PUBLIC_SITE_URL rather than the request:
      // this URL must match one Supabase has been configured to allow.
      redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })

  if (error || !data.url) {
    // Raw provider text is logged and never reaches the UI.
    console.error('[auth.signInWithGoogle]', error)
    redirect(`${LOGIN_PATH}?error=auth`)
  }

  // The PKCE code verifier was just written to a cookie by the client above;
  // `/auth/callback` reads it back with the same client to complete the exchange.
  redirect(data.url)
}

export async function signOut() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('[auth.signOut]', error)
  }

  // Home either way. A failed sign-out that left the user on a signed-in page
  // would be the more confusing outcome, and the cookies are cleared locally
  // even when the network call fails.
  redirect('/')
}
