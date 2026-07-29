import { defineConfig } from 'vitest/config'

// The generator is plain Node code (string transforms + fs), so it needs no
// DOM: the default node environment is what these tests run in.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
  },
})
