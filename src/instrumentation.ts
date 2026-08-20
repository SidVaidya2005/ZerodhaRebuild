/**
 * Next.js calls `register()` once per server instance, before the server handles
 * its first request, and deliberately skips it during `next build`. That is the
 * behaviour this file depends on: a missing variable breaks `dev` and `start`
 * loudly and by name, while `build` stays green on a machine holding no secrets.
 */
export async function register() {
  // The edge runtime has neither `server-only` resolution nor the full env.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  await import('@/lib/env')
  await import('@/lib/env.server')
}
