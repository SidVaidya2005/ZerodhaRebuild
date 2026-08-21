import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tier 1 is pure logic with no database and no DOM — see code-standards.md → Testing.
    // jsdom and Testing Library are deliberately absent; neither is an approved dependency.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // src/lib/env.ts validates on import. These dummy values let it load; every
    // assertion about validation passes its own source object explicitly.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
    },
  },
  resolve: {
    alias: {
      // vite-tsconfig-paths is not an approved dependency, so the alias is declared here
      // and must be kept in step with the `paths` entry in tsconfig.json.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The Edge Function's shared logic, imported by the app and by tier 1.
      // Deno resolves these paths with an explicit `.ts`, which Vite strips.
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
      // `server-only` throws unless resolved under React's "react-server" condition,
      // which the node test environment does not set. Point it at the package's own
      // empty entry so the guarded module can be unit tested. This does not weaken the
      // guard: `next build` still resolves the throwing entry for client bundles.
      'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
    },
  },
})
