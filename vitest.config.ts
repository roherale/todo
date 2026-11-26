import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/api/test/**/*.test.ts', 'scripts/**/*.test.ts'],
    globalSetup: ['packages/api/test/global-setup.ts'],
    testTimeout: 20_000,
    alias: { '@todo/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname },
    coverage: {
      provider: 'v8',
      include: ['packages/api/src/**', 'packages/shared/src/**'],
      exclude: ['**/*.test.ts', 'packages/api/src/main.ts', 'packages/api/src/cleanup-sessions.ts'],
      thresholds: { lines: 90, branches: 90 },
    },
  },
});
