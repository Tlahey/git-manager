import { defineConfig } from 'vitest/config'

// Pure logic package — no DOM, so the default node environment is enough.
export default defineConfig({
  test: {
    environment: 'node',
  },
})
