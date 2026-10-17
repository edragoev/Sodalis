import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: [
      // Routes live under src/app; everything else (lib, utils) is at the repo root.
      { find: /^@\/app\//, replacement: path.resolve(import.meta.dirname, 'src/app') + '/' },
      { find: /^@\//, replacement: path.resolve(import.meta.dirname) + '/' },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // DB tests share one Supabase instance, so run files one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
  },
})
