const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  // ── Ignored paths ─────────────────────────────────────────────────────────
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.tmp/**',
      'coverage/**',
      // Compiled CLI output (built from .ts sources — do not lint)
      'ghostrun.js',
      'mcp-server.js',
      // Test artefacts
      'tests/visual/baselines/**',
      'tests/visual/screenshots/**',
      'mock-app/**',
      // Nested package node_modules
      '**/node_modules/**',
    ],
  },

  // ── Plain JS / MJS ────────────────────────────────────────────────────────
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    rules: {
      // Correctness
      eqeqeq: ['warn', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',

      // Noise reduction for a large CLI codebase
      'no-unused-vars': ['warn', { vars: 'all', args: 'after-used', ignoreRestSiblings: true }],
      'no-console': 'off',

      // Stylistic — off to avoid mass warnings
      curly: 'off',
    },
  },

  // ── TypeScript source files ───────────────────────────────────────────────
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        require: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        Response: 'readonly',
        document: 'readonly',
        window: 'readonly',
        location: 'readonly',
        CSS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // Correctness
      eqeqeq: ['warn', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',

      // TypeScript handles unused vars better than the base rule
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          // Underscore-prefixed names are intentionally unused
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],

      // CLI app — console output is intentional
      'no-console': 'off',

      // Stylistic — off to avoid mass warnings
      curly: 'off',
    },
  },

  // ── Test files — relaxed rules ────────────────────────────────────────────
  {
    files: [
      'tests/**/*.ts',
      'tests/**/*.js',
      '**/*.test.ts',
      '**/*.test.js',
      '**/*.spec.ts',
      '**/*.spec.js',
    ],
    rules: {
      // For TS test files: use only the TS-aware rule (base rule is already off for TS)
      '@typescript-eslint/no-unused-vars': 'warn',
      // For plain JS test files: use base rule (no TS plugin available)
      'no-unused-vars': 'off',

      // prefer-const/no-var still apply in tests
      'no-var': 'error',
      'prefer-const': 'error',

      // Console output useful in test debugging
      'no-console': 'off',
    },
  },
];
