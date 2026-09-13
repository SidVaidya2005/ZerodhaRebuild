/**
 * Next.js calls `register()` once per server instance, before the server handles
 * its first request, and deliberately skips it during `next build`. That is the
 * behaviour this file depends on: a missing variable breaks `dev` and `start`
 * loudly and by name, while `build` stays green on a machine holding no secrets.
 */
export async function register() {
  // The edge runtime has neither `server-only` resolution nor the full env.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { env, assertDeployableSiteUrl } = await import('@/lib/env')
  await import('@/lib/env.server')

  // A present-but-wrong value is the failure mode this catches: the first Render
  // deploy booted clean, served every page, passed its health check, and sent
  // sign-in to localhost. `RENDER` is set by Render itself, so this stays inert
  // for `pnpm start` locally, which the audits depend on.
  //
  // **Exit rather than throw.** Next catches an instrumentation throw, logs
  // "Failed to prepare server" and leaves the process alive but not serving —
  // on a platform that is an instance failing its health check forever, not a
  // failed deploy. A non-zero exit is the unambiguous signal, and it puts the
  // one line that matters at the end of the build log.
  try {
    assertDeployableSiteUrl(env.NEXT_PUBLIC_SITE_URL, process.env.RENDER)
  } catch (error) {
    console.error('[instrumentation]', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
