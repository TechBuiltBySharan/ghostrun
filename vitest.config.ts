/**
 * Vitest configuration for GhostRun
 * 
 * Test structure:
 * - tests/unit/  - Unit tests for individual functions
 * - tests/integration/ - Integration tests for flows
 * - tests/e2e/ - End-to-end browser/API tests
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/flows/**', 'tests/results/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/**'],
      exclude: ['packages/**/node_modules/**'],
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // reporters: ['verbose', 'html'],
    outputFile: {
      html: 'tests/results/coverage.html',
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
