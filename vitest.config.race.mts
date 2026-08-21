import { defineConfig } from 'vitest/config'

/**
 * Tier 3 only. Kept in its own config rather than excluded from the tier-1 one,
 * so `pnpm test` can never pick these up by accident — these tests commit.
 *
 * Single-threaded and serial on purpose: two tier-3 files racing each other
 * would contend for the same rows and produce failures that say nothing about
 * the code under test.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/concurrency/**/*.race.test.ts'],
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
