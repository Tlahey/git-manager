import { defineConfig } from 'vitest/config'

// No @vitejs/plugin-react on purpose: esbuild already handles the JSX transform for tests (see
// the same note in packages/code-view/vitest.config.ts).
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
  },
})
