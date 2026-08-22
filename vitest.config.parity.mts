import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

/**
 * Tier 4 — parity. Its own config, for the same reason tier 3 has one: `pnpm
 * test` must never pick these up, because they need a database and tier 1 is
 * defined by not having one.
 *
 * Unlike tier 3 this tier is **read-only**. `calculate_charges` and
 * `charge_rates` touch no table and write nothing, so there is no commit to
 * gate and no cleanup to do — which is why this runs inside a plain
 * `pnpm test:all` while tier 3 stays opt-in.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/parity/**/*.parity.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      // Kept in step with tsconfig.json's `paths`, as in the tier-1 config —
      // vite-tsconfig-paths is not an approved dependency.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
  },
})
