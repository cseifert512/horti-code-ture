import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    // several tests grow a dozen plants for twelve years or build every organ model; with all files
    // running side by side on a busy machine they need far more than the default 5 s, and more
    // again as each taxon comes to carry the stems and leaves of the real plant
    testTimeout: 120_000,
  },
});
