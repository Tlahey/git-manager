import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { ApcaMatrixReporter } from '@git-manager/storybook-a11y/vitest-apca-reporter'

const here = dirname(fileURLToPath(import.meta.url))

// The rendered APCA + theme×surface sweep (stories/*.test.tsx → runA11yMatrix), in its
// OWN config/process rather than a project in vitest.config.ts. Two reasons:
//  · Vitest allows only one chromium browser project per config, and vitest.config.ts
//    already owns one (the Storybook Test integration).
//  · A separate process isolates apca-check's global axe reconfigure (it registers the
//    APCA rule + disables WCAG color-contrast) from the storybook project's a11y runs.
// Run with `pnpm test:apca`.
export default defineConfig({
  optimizeDeps: {
    // axe-core/apca-check are imported by the preview (via storybook-a11y); pre-bundle
    // them so Vite doesn't discover them mid-run and reload the browser runner.
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'axe-core',
      '@git-manager/storybook-a11y > apca-check',
    ],
  },
  test: {
    name: 'apca',
    include: ['stories/**/*.test.{ts,tsx}'],
    setupFiles: [resolve(here, '.storybook/vitest.setup.ts')],
    // Writes a11y-report/apca-report.{json,md} — the comparable theme × surface
    // artifact — from the structured results the matrix attaches to task.meta.
    reporters: ['default', new ApcaMatrixReporter()],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
