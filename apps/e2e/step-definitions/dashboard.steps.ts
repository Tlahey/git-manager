import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, $, expect } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = '/tmp/git-manager-fixtures'
const SCENARIOS_DIR = join(__dirname, '../../../tools/git-fixtures/scenarios')

// `window.location.href = ...` navigates asynchronously — the same reason repo.steps.ts and
// daily-summary.steps.ts drive the reload through `browser.url` / a stamped marker instead of a
// bare assignment. Stamping and polling `location.search` is the reliable "the reload actually
// committed" signal (see daily-summary.steps.ts's own note on this).
async function waitForStampedReload(stamp: string) {
  await browser.waitUntil(
    async () =>
      await browser
        .execute((marker: string) => window.location.search.includes(marker), stamp)
        .catch(() => false),
    { timeout: 10000, timeoutMsg: `The reload stamped "${stamp}" never committed` }
  )
}

// Both repos are seeded into `savedRepos` in one write + one reload, rather than one step per
// repo: two separate seed-then-reload calls would race the same lingering-page zustand-persist
// clobber daily-summary.steps.ts's version of this works around with a retry loop — a single seed
// sidesteps the race instead of retrying around it.
Given(
  /^the "([^"]*)" and "([^"]*)" fixture repositories are listed in the dashboard$/,
  async (first: string, second: string) => {
    execFileSync('bash', [join(SCENARIOS_DIR, `${first}.sh`)], { stdio: 'inherit' })
    execFileSync('bash', [join(SCENARIOS_DIR, `${second}.sh`)], { stdio: 'inherit' })
    const repos = [first, second].map((name) => ({
      path: join(FIXTURE_ROOT, name),
      name,
      pinned: false,
    }))

    const stamp = `dashboard-seed-${Date.now()}`
    await browser.execute(
      (reposJson: string, marker: string) => {
        localStorage.setItem(
          'git-manager-repos',
          JSON.stringify({
            state: { savedRepos: JSON.parse(reposJson), discoveredRepos: [] },
            version: 0,
          })
        )
        window.location.href = `/?e2e=${marker}`
      },
      JSON.stringify(repos),
      stamp
    )
    await waitForStampedReload(stamp)
  }
)

// "When I open the dashboard" is shared — defined once in daily-summary.steps.ts.

When(/^I pin the "([^"]*)" project$/, async (name: string) => {
  const repoPath = join(FIXTURE_ROOT, name)
  const row = $(`[data-testid="dashboard-repo-row"][data-repo-path="${repoPath}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  await row.$('[data-testid="repo-row-star"]').click()
})

Then(/^the "([^"]*)" project is in the favorites section$/, async (name: string) => {
  const section = $('[data-testid="dashboard-section-favorites"]')
  await section.waitForDisplayed({ timeout: 10000 })
  await expect(section).toHaveText(name, { containing: true })
})

When(/^I open the "([^"]*)" project's README$/, async (name: string) => {
  const repoPath = join(FIXTURE_ROOT, name)
  const row = $(`[data-testid="dashboard-repo-row"][data-repo-path="${repoPath}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  await row.$('[data-testid="repo-row-readme-button"]').click()
})

Then(/^the README panel is shown$/, async () => {
  await $('[data-testid="readme-panel-close-button"]').waitForDisplayed({ timeout: 15000 })
})
