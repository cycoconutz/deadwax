import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup.ts'],
    globalSetup: ['test/global-setup.ts'],
    // Every file shares one Postgres database, so files must not run at once:
    // a truncate in one file would pull the rug from under another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
