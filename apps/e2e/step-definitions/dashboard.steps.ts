import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, $, expect } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { navigateAndSettle } from '../support/navigation'
import { openMenuViaJs } from '../support/interactions'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = '/tmp/git-manager-fixtures'
const SCENARIOS_DIR = join(__dirname, '../../../tools/git-fixtures/scenarios')

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
    // Seed in one execute, then navigate through WebDriver (repo.steps.ts's pattern): an in-page
    // `location.href` assignment either tears the context down before the driver's response is
    // sent (hanging the await for cucumber's 60s step timeout) or, deferred, fires mid-scenario
    // later. The stamped wait below then proves the reload actually committed.
    const origin = await browser.execute(() => window.location.origin)
    await browser.execute((reposJson: string) => {
      localStorage.setItem(
        'git-manager-repos',
        JSON.stringify({
          state: { savedRepos: JSON.parse(reposJson), discoveredRepos: [] },
          version: 0,
        })
      )
    }, JSON.stringify(repos))
    await navigateAndSettle(`${origin}/?e2e=${stamp}`, stamp)
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

/**
 * Asserts the panel actually rendered the repository's own README, not just that it opened: the
 * text has to have come through `get_repo_readme` and the Markdown renderer.
 */
Then(/^the README panel shows "([^"]*)"$/, async (text: string) => {
  const body = $('[data-testid="readme-rendered-content"]')
  await body.waitForDisplayed({ timeout: 15000 })
  await browser.waitUntil(async () => (await body.getText()).includes(text), {
    timeout: 10000,
    timeoutMsg: `the rendered README never showed "${text}"`,
  })
})

When(/^I switch the README panel to its source view$/, async () => {
  const toggle = $('[data-testid="readme-toggle-mode"]')
  await toggle.waitForClickable({ timeout: 10000 })
  await toggle.click()
})

/** The raw view shows the file verbatim — Markdown syntax included, which is the point of it. */
Then(/^the README source shows "([^"]*)"$/, async (text: string) => {
  const raw = $('[data-testid="readme-raw-content"]')
  await raw.waitForDisplayed({ timeout: 10000 })
  await browser.waitUntil(async () => (await raw.getText()).includes(text), {
    timeout: 10000,
    timeoutMsg: `the README source never showed "${text}"`,
  })
})

/** The row for one fixture, matched on the repo path its `data-repo-path` carries. */
function repoRow(name: string) {
  return $(`[data-testid="dashboard-repo-row"][data-repo-path="${join(FIXTURE_ROOT, name)}"]`)
}

Then(/^the "([^"]*)" row is on branch "([^"]*)"$/, async (name: string, branch: string) => {
  const cell = repoRow(name).$('[data-testid="repo-row-branch"]')
  await cell.waitForDisplayed({ timeout: 15000 })
  await expect(cell).toHaveText(branch)
})

/**
 * The counters come from `get_repo_summary`, i.e. a real status read of the fixture on disk —
 * `stash-stack` leaves exactly one staged file and one untracked one behind.
 */
Then(
  /^the "([^"]*)" row reports (\d+) staged and (\d+) untracked change(?:s)?$/,
  async (name: string, staged: string, untracked: string) => {
    const row = repoRow(name)
    await row.waitForDisplayed({ timeout: 15000 })
    await expect(row.$('[data-testid="repo-row-staged"]')).toHaveText(`+${staged}`)
    await expect(row.$('[data-testid="repo-row-untracked"]')).toHaveText(`?${untracked}`)
  }
)

Then(/^the "([^"]*)" row reports a clean working tree$/, async (name: string) => {
  const row = repoRow(name)
  await row.waitForDisplayed({ timeout: 15000 })
  await expect(row.$('[data-testid="repo-row-clean"]')).toBeDisplayed()
})

// ─── Toolbar: search, collapse/expand-all, hidden sections ─────────────────

When(/^I filter the dashboard for "([^"]*)"$/, async (text: string) => {
  await $('[data-testid="dashboard-search"]').setValue(text)
})

When(/^I clear the dashboard filter$/, async () => {
  await $('[data-testid="dashboard-search"]').setValue('')
})

Then(/^the "([^"]*)" project is shown on the dashboard$/, async (name: string) => {
  await repoRow(name).waitForDisplayed({ timeout: 10000 })
})

Then(/^the "([^"]*)" project is not shown on the dashboard$/, async (name: string) => {
  await repoRow(name).waitForDisplayed({ timeout: 10000, reverse: true })
})

When(/^I collapse all dashboard sections$/, async () => {
  await $('[data-testid="dashboard-collapse-all"]').click()
})

When(/^I expand all dashboard sections$/, async () => {
  await $('[data-testid="dashboard-expand-all"]').click()
})

// "all" / "favorites" / "recent" / "open" — DASHBOARD_SECTION_IDS in dashboard.store.ts. Both
// menus are Radix `DropdownMenuTrigger`s, which open on `pointerdown` rather than `click` — see
// `openMenuViaJs`'s own doc comment.
When(/^I hide the "([^"]*)" dashboard section$/, async (sectionId: string) => {
  await openMenuViaJs(`dashboard-section-menu-${sectionId}`)
  await $(`[data-testid="dashboard-section-menu-${sectionId}-hide"]`).click()
})

Then(/^the "([^"]*)" dashboard section is not shown$/, async (sectionId: string) => {
  await $(`[data-testid="dashboard-section-${sectionId}"]`).waitForExist({
    timeout: 10000,
    reverse: true,
  })
})

Then(/^the "([^"]*)" dashboard section is shown$/, async (sectionId: string) => {
  await $(`[data-testid="dashboard-section-${sectionId}"]`).waitForExist({ timeout: 10000 })
})

When(
  /^I restore the "([^"]*)" dashboard section from the hidden sections menu$/,
  async (sectionId: string) => {
    await openMenuViaJs('dashboard-hidden-sections')
    await $(`[data-testid="dashboard-restore-section-${sectionId}"]`).click()
  }
)
