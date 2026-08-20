import 'server-only'

import { z } from 'zod'

/**
 * Server-only environment variables. The `server-only` import above turns any
 * client-side import of this module into a build error — the same guard
 * `architecture.md` mandates for `lib/supabase/admin.ts`, applied one level
 * earlier so the service-role key can never be reached from the browser at all.
 *
 * The two optional values are genuinely optional at runtime: the Twelve Data
 * provider reports itself unavailable when its key is unset (library-docs.md →
 * Quote providers), and `TEST_DATABASE_URL` is only read by tiers 2 and 3.
 */
export const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  TWELVE_DATA_API_KEY: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

/** An empty string in a `.env` file means "unset", not "set to nothing". */
function emptyToUndefined(value: string | undefined): string | undefined {
  return value === '' ? undefined : value
}

export function parseServerEnv(source: Record<string, unknown> = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    TWELVE_DATA_API_KEY: emptyToUndefined(source.TWELVE_DATA_API_KEY as string | undefined),
    TEST_DATABASE_URL: emptyToUndefined(source.TEST_DATABASE_URL as string | undefined),
  })
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${z.prettifyError(parsed.error)}\n` +
        'Copy .env.example to .env.local and fill in the missing values.'
    )
  }
  return parsed.data
}

export const serverEnv: ServerEnv = parseServerEnv()
