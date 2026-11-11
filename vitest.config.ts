import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    // several tests grow plants for a decade or build every organ model; with all files
    // running side by side on a slow or busy machine they need more than the default 5 s
    testTimeout: 30_000,
  },
});
