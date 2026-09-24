import { z } from 'zod'

/**
 * Public environment variables — inlined into the browser bundle by Next.js and
 * therefore safe to import from anywhere, server or client.
 *
 * Secrets live in `env.server.ts`, which is guarded by `server-only` so that
 * importing it from a Client Component fails the build rather than throwing at
 * runtime. Never move a value across that line.
 */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>

/**
 * Next.js substitutes `process.env.NEXT_PUBLIC_*` at build time only for literal
 * member accesses, so each key is named explicitly. Spreading `process.env` here
 * would yield `undefined` for every one of them in the browser.
 */
function readPublicEnv(): Record<string, unknown> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  }
}

export function parsePublicEnv(source: Record<string, unknown> = readPublicEnv()): PublicEnv {
  const parsed = publicEnvSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error(
      `Invalid public environment variables:\n${z.prettifyError(parsed.error)}\n` +
        'Copy .env.example to .env.local and fill in the missing values.'
    )
  }
  return parsed.data
}

/**
 * A deployed instance must not carry a localhost site URL.
 *
 * `NEXT_PUBLIC_SITE_URL` is the OAuth `redirectTo` (`server/actions/auth.ts`),
 * built from env rather than from the request on purpose — a request-derived
 * origin is a host-header-injection vector and Supabase must have the exact URL
 * allow-listed. The cost of that correctness is that a wrong value is **silent**:
 * every page renders, the health check passes, and sign-in sends the user to
 * `localhost` with nothing in the logs. That is what happened on the first
 * Render deploy.
 *
 * It is not enough to set the variable — `NEXT_PUBLIC_*` is inlined at build
 * time, so the fix is always "set it **and** redeploy", which is what the
 * message says.
 *
 * Gated on a platform marker rather than `NODE_ENV`, because `pnpm start`
 * locally is also a production build and legitimately serves localhost — the
 * accessibility and overflow audits both depend on it.
 */
export function assertDeployableSiteUrl(siteUrl: string, platform: string | undefined): void {
  if (!platform) return
  const { hostname } = new URL(siteUrl)
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    throw new Error(
      `NEXT_PUBLIC_SITE_URL is "${siteUrl}" on a deployed instance (${platform}).\n` +
        'Google sign-in would send every user to localhost after authenticating.\n' +
        "Set it to this service's public URL, then trigger a new deploy — the value " +
        'is inlined at build time, so saving it alone changes nothing.'
    )
  }
}

export const env: PublicEnv = parsePublicEnv()
