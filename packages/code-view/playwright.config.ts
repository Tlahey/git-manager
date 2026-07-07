import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  expect: {
    toHaveScreenshot: {
      // Baselines live next to the spec (*.spec.ts-snapshots/) and are committed — that's the
      // visual-regression reference between two versions. They're platform-suffixed
      // (-darwin/-linux): regenerate with `npx playwright test --update-snapshots` when a
      // visual change is intentional.
      animations: 'disabled',
      stylePath: './e2e/screenshot.css',
      // Small allowance for font antialiasing jitter; real regressions (a ribbon changing
      // state, a line appearing/moving) shift thousands of pixels.
      maxDiffPixels: 1500,
    },
  },
  use: {
    baseURL: 'http://localhost:6006',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec storybook dev -p 6006 --ci',
    url: 'http://localhost:6006',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
