import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'

const here = dirname(fileURLToPath(import.meta.url))

// Two Vitest projects here:
//  · unit      — jsdom component tests (fast, no browser). `pnpm test` runs only this.
//  · storybook — the official Storybook Test integration: `storybookTest` turns every
//                story into a browser test and addon-a11y runs on it — WCAG 2.x + APCA
//                Bronze (the preview calls enableApcaInA11yAddon) — so a11y results +
//                test status surface in the Storybook UI (Accessibility tab, sidebar
//                badges) and the run FAILS on contrast until every theme passes. Runs
//                each story once at its default globals. configDir is absolute — a
//                relative one made the plugin lose the runner.
//
// The rendered APCA + theme×surface sweep lives in a SEPARATE config
// (vitest.apca.config.ts, `pnpm test:apca`): Vitest allows only one chromium browser
// project per config, and a separate process also isolates the matrix's global axe
// reconfigure (its runAxe disables WCAG color-contrast) from the storybook project's
// a11y runs, which keep both WCAG + APCA.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: [resolve(here, 'vitest.setup.ts')],
          include: ['src/**/*.test.{ts,tsx}'],
          css: false,
        },
      },
      {
        plugins: [storybookTest({ configDir: resolve(here, '.storybook') })],
        optimizeDeps: {
          // axe-core/apca-check: imported by the preview (via storybook-a11y); without
          // pre-bundling, Vite discovers them mid-run and the forced reload crashes
          // the Vitest browser runner.
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
          name: 'storybook',
          // NO setupFiles here: since Storybook 10.3 the storybookTest plugin applies
          // the project annotations (preview + addons, incl. addon-a11y's afterEach)
          // itself. A manual setProjectAnnotations([preview]) call REPLACES that full
          // set and silently drops addon-a11y — the a11y run never happened with it.
          // .storybook/vitest.setup.ts is still used by vitest.apca.config.ts, where
          // composeStory() genuinely needs the annotations.
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
