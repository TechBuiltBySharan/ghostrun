import { defineConfig } from 'vitest/config';

// Separate from vitest.config.ts because visual tests hit live third-party sites and are
// excluded from the default (CI-gating) test run — this config is for running them on demand.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/visual/**/*.test.ts'],
    testTimeout: 30000,
  },
});
