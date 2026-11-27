import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';

const testFiles = ['**/*.test.ts', '**/test/**/*.ts'];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/reports/**', '**/.stryker-tmp/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    // Modules talk to each other only through index.ts.
    files: ['packages/api/src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: '^\\.\\./[^./][^/]*/(?!index\\.js$)', message: 'Import other modules only through their index.ts.' }] }],
    },
  },
  {
    // Layering: services and repositories never import express (UC architecture guardrail).
    files: ['packages/api/src/modules/**/*.service.ts', 'packages/api/src/modules/**/*.repository.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'express', message: 'Services and repositories must not import express.' }],
        patterns: [{ regex: '^\\.\\./[^./][^/]*/(?!index\\.js$)', message: 'Import other modules only through their index.ts.' }],
      }],
    },
  },
  {
    // Clients never import from the API (ADR: shared is the only package they depend on).
    files: ['packages/cli/**/*.ts', 'packages/web/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: '(^|/)api/(src|test)/|^@todo/api', message: 'Clients must not import from the API. Share code through @todo/shared.' }] }],
    },
  },
  {
    // The one exception: the CLI's own tests start the real API to test against it.
    files: ['packages/cli/test/**/*.ts', 'packages/cli/**/*.test.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: testFiles,
    plugins: { vitest },
    rules: {
      'vitest/no-disabled-tests': 'error',
      'vitest/no-focused-tests': 'error',
      'vitest/expect-expect': 'error',
      'vitest/no-identical-title': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-warning-comments': 'off',
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
);
