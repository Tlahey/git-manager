import { defineConfig } from 'vitest/config'

// No @vitejs/plugin-react here on purpose: esbuild already handles the JSX transform for
// tests, and pulling the plugin in creates a duplicate-vite-version type conflict (storybook's
// builder resolves its own vite) — same class of problem as documented in the desktop app's
// vite.config.ts.
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
