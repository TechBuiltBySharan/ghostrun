/**
 * Vitest configuration for GhostRun
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: [
      'tests/flows/**',
      'tests/results/**',
      'tests/visual/**',
      'node_modules/**'
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/**'],
      exclude: ['packages/**/node_modules/**'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    outputFile: {
      json: 'tests/results/test-results.json',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@ghostrun/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
    },
  },
});
