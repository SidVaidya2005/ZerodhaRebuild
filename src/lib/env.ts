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

export const env: PublicEnv = parsePublicEnv()
