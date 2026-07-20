import { defineConfig } from 'vitest/config'

// The graphical-contrast checker reads getComputedStyle over a real DOM, so this
// unit project runs in jsdom. (The rendered theme × surface matrix itself runs in a
// browser via the consumer's vitest.apca.config — this only covers the pure checker.)
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
