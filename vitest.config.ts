import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/api/test/**/*.test.ts', 'packages/cli/test/**/*.test.ts', 'scripts/**/*.test.ts'],
    globalSetup: ['packages/api/test/global-setup.ts'],
    testTimeout: 20_000,
    alias: { '@todo/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname },
    coverage: {
      provider: 'v8',
      include: ['packages/api/src/**', 'packages/shared/src/**', 'packages/cli/src/**'],
      // Entry points that need a live process, a real OS keychain or a real browser.
      exclude: [
        '**/*.test.ts',
        'packages/api/src/main.ts',
        'packages/api/src/cleanup-sessions.ts',
        'packages/cli/src/main.ts',
        'packages/cli/src/common/keychain-store.ts',
      ],
      thresholds: {
        'packages/api/**': { lines: 90, branches: 90 },
        'packages/shared/**': { lines: 90, branches: 90 },
        'packages/cli/**': { lines: 80, branches: 80 },
      },
    },
  },
});
