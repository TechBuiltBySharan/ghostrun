/**
 * Vitest configuration for GhostRun
 */

import { defineConfig, type UserConfig } from 'vitest/config';
import path from 'path';
import os from 'os';

const isCI = !!process.env.CI;

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,

    // Explicitly target unit and e2e test directories
    include: [
      'tests/unit/**/*.test.ts',
      'tests/e2e/**/*.test.ts',
    ],

    exclude: [
      'node_modules/**',
      'coverage/**',
      '.ghostrun/**',
      'tests/flows/**',
      'tests/results/**',
      'tests/visual/**',
      'tests/integration/**',
    ],

    // 30 s is enough headroom for browser/API tests
    testTimeout: 30000,
    hookTimeout: 30000,

    // Verbose in watch mode so output is readable; default (dot) in CI
    reporter: isCI ? 'default' : 'verbose',

    outputFile: {
      json: 'tests/results/test-results.json',
    },

    // Provide a writable temp directory that tests can use via GHOSTRUN_TMPDIR
    env: {
      GHOSTRUN_TMPDIR: path.join(os.tmpdir(), 'ghostrun-test'),
    },

    coverage: {
      provider: 'v8',

      // Cover all package source files
      include: [
        'packages/*/src/**/*.ts',
      ],
      exclude: [
        'packages/**/node_modules/**',
        'packages/**/*.d.ts',
        'packages/**/__tests__/**',
      ],

      // Achievable thresholds given current test suite
      thresholds: {
        lines: 15,
        functions: 15,
      },

      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
    },
  } as UserConfig['test'],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
