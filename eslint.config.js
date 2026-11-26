import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';

const testFiles = ['**/*.test.ts', '**/test/**/*.ts'];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/reports/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    // Layering: services and repositories never import express (UC architecture guardrail).
    files: ['packages/api/src/modules/**/*.service.ts', 'packages/api/src/modules/**/*.repository.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: 'express', message: 'Services and repositories must not import express.' }] }],
    },
  },
  {
    // Modules talk to each other only through index.ts.
    files: ['packages/api/src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['../*/*', '!../*/index.js'], message: 'Import other modules only through their index.ts.' }] }],
    },
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
