import { defineConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { fileURLToPath, URL } from 'node:url'


// No @vitejs/plugin-react here on purpose: esbuild already handles the JSX transform for
// tests, and pulling the plugin in creates a duplicate-vite-version type conflict (storybook's
// builder resolves its own vite) — same class of problem as documented in the desktop app's
// vite.config.ts.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^monaco-editor$/, replacement: fileURLToPath(new URL('./.storybook/vitest.setup.ts', import.meta.url)) },
      { find: /^monaco-editor\/esm\/vs\/editor\/editor\.worker.*/, replacement: fileURLToPath(new URL('./.storybook/vitest.setup.ts', import.meta.url)) },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          css: false,
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: '.storybook',
          }),
        ],
        test: {
          name: 'storybook',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts', './.storybook/vitest.setup.ts'],
          css: false,
        },
      },
    ],
  },
})
