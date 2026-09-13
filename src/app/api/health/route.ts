import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/**
 * Liveness probe: is this build up, and can it reach the database?
 *
 * **A route handler, and `code-standards.md` already names it** as one of the
 * three permitted ones — it is a read, not a mutation, and it has to be a URL
 * because the things that call it are not browsers: Render's health check, and
 * whatever external scheduler keeps the Supabase project from pausing.
 *
 * **Why it calls an RPC rather than selecting a row.** `anon` can read nothing
 * in this schema by design — the publishable key ships in the browser bundle,
 * so `constraints/security.md` forbids granting it a reference table (F10).
 * `health_check()` is a `security definer` function that returns a boolean and
 * a timestamp and no table data, which is the narrow exception; tier 2 asserts
 * that adding it widened nothing else.
 *
 * **No service-role client here, ever.** This endpoint is unauthenticated, so
 * reaching it must never reach a privileged client. It uses the ordinary server
 * client, which runs as `anon` when no session cookie is present.
 *
 * The response body carries no Postgres text. A failed probe is logged with its
 * real error and answered with a bare code, per `code-standards.md` → Error
 * Handling.
 */

// The whole point is to observe the live database on every call; a cached
// answer would report the health of whenever it was cached.
export const dynamic = 'force-dynamic'
export const revalidate = 0

type HealthBody = {
  status: 'ok' | 'degraded'
  database: 'reachable' | 'unreachable'
  /** Whether the instrument universe is seeded — a deployed-but-empty database
   *  answers queries happily and is still broken. */
  instrumentsSeeded: boolean | null
  /** The database clock, not this process's. Also surfaces clock skew, which
   *  has already produced one `PGRST303 "JWT issued at future"` in this app. */
  databaseTime: string | null
  /** Render injects this; absent locally, which is why it is read directly
   *  rather than through `env.ts`. Deviates from the Environment Variables rule
   *  deliberately: it is optional, non-secret and platform-supplied, and
   *  validating it would fail `pnpm dev` on every machine. */
  commit: string | null
}

export async function GET() {
  const commit = process.env.RENDER_GIT_COMMIT ?? null

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('health_check')

    if (error) {
      console.error('[health.GET]', error)
      return NextResponse.json<HealthBody>(
        {
          status: 'degraded',
          database: 'unreachable',
          instrumentsSeeded: null,
          databaseTime: null,
          commit,
        },
        { status: 503 }
      )
    }

    // The function `returns table (...)`, so PostgREST answers with an array.
    const row = data?.[0] ?? null

    return NextResponse.json<HealthBody>(
      {
        status: row?.instruments_seeded ? 'ok' : 'degraded',
        database: 'reachable',
        instrumentsSeeded: row?.instruments_seeded ?? null,
        databaseTime: row?.checked_at ?? null,
        commit,
      },
      // A reachable database with no universe is degraded, not down: the app
      // boots and signs in, and every quote surface is empty. 200 keeps Render
      // from cycling an instance that only needs seeding.
      { status: 200 }
    )
  } catch (error) {
    // A throw here is the network or the client itself, not a query result.
    console.error('[health.GET]', error)
    return NextResponse.json<HealthBody>(
      {
        status: 'degraded',
        database: 'unreachable',
        instrumentsSeeded: null,
        databaseTime: null,
        commit,
      },
      { status: 503 }
    )
  }
}
