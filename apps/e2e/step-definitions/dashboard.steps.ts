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

/**
 * Builds both fixtures, seeds them into `savedRepos` in one write, then reloads.
 *
 * One write for both repos rather than one step per repo: two separate seed-then-reload calls
 * would race the same lingering-page zustand-persist clobber daily-summary.steps.ts's version of
 * this works around with a retry loop — a single seed sidesteps the race instead of retrying
 * around it.
 */
async function seedDashboardRepos(names: [string, string], pinned: boolean) {
  for (const name of names) {
    execFileSync('bash', [join(SCENARIOS_DIR, `${name}.sh`)], { stdio: 'inherit' })
  }
  const repos = names.map((name) => ({ path: join(FIXTURE_ROOT, name), name, pinned }))

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

Given(
  /^the "([^"]*)" and "([^"]*)" fixture repositories are listed in the dashboard$/,
  async (first: string, second: string) => {
    await seedDashboardRepos([first, second], false)
  }
)

// Pinned rather than merely listed: only Favorites, Recent and Open get the section-wide
// Fetch/Pull/editor toolbar (RepoSectionHeader's `showRepoTools`) — "All repositories" deliberately
// doesn't, so a stray click there can't fetch or pull dozens of repos at once (useSectionActions.ts).
Given(
  /^the "([^"]*)" and "([^"]*)" fixture repositories are pinned on the dashboard$/,
  async (first: string, second: string) => {
    await seedDashboardRepos([first, second], true)
  }
)

// The empty state (`sections.totalKnownCount === 0`) needs BOTH `savedRepos` and `discoveredRepos`
// gone — either one alone still leaves a repo the dashboard knows about. Open tabs are left
// untouched: `totalKnownCount` never counts them, so a stray one from an earlier scenario can't
// leak into this state visually (DashboardPage.tsx renders the empty state in place of every
// section, `open` included, whenever this is true).
Given(/^no repositories are known to the dashboard$/, async () => {
  const stamp = `dashboard-empty-${Date.now()}`
  const origin = await browser.execute(() => window.location.origin)
  await browser.execute(() => {
    localStorage.setItem(
      'git-manager-repos',
      JSON.stringify({ state: { savedRepos: [], discoveredRepos: [] }, version: 0 })
    )
  })
  await navigateAndSettle(`${origin}/?e2e=${stamp}`, stamp)
})

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

// The colour swatches live inline inside the section's own "..." menu (SectionColorPicker, see
// RepoSectionHeader.tsx) rather than a separate popover, and picking one deliberately does not
// close it (its own `stopPropagation`) — so a *second* pick in the same scenario finds the menu
// still open, and re-triggering `openMenuViaJs` would toggle it shut instead of opening it.
When(
  /^I color the "([^"]*)" dashboard section "([^"]*)"$/,
  async (sectionId: string, color: string) => {
    const swatch = $(`[data-testid="dashboard-color-${sectionId}-${color}"]`)
    if (!(await swatch.isExisting())) await openMenuViaJs(`dashboard-section-menu-${sectionId}`)
    await swatch.click()
  }
)

// `data-color` on the section header itself is real applied state (RepoSectionHeader.tsx), not
// just the picker's own pressed button.
Then(
  /^the "([^"]*)" dashboard section is colored "([^"]*)"$/,
  async (sectionId: string, color: string) => {
    await expect($(`[data-testid="dashboard-section-header-${sectionId}"]`)).toHaveAttribute(
      'data-color',
      color
    )
  }
)

Then(/^the dashboard shows its empty state$/, async () => {
  await $('[data-testid="dashboard-empty-state"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the "([^"]*)" dashboard section is not colored$/, async (sectionId: string) => {
  await expect($(`[data-testid="dashboard-section-header-${sectionId}"]`)).toHaveAttribute(
    'data-color',
    'none'
  )
})

// ─── Section-wide bulk actions: checkbox selection, Fetch/Pull over the checked rows ────────────

When(
  /^I select the "([^"]*)" and "([^"]*)" projects on the dashboard$/,
  async (first: string, second: string) => {
    for (const name of [first, second]) {
      await repoRow(name).$('[data-testid="repo-row-checkbox"]').click()
    }
  }
)

Then(/^the favorites section reports (\d+) selected$/, async (count: string) => {
  await expect($('[data-testid="dashboard-section-selected-count-favorites"]')).toHaveText(
    `${count} selected`
  )
})

// The trigger is a Radix `DropdownMenuTrigger`, which opens on `pointerdown` — a driver `.click()`
// leaves it shut (see `openMenuViaJs`'s own doc comment).
When(/^I pull the favorites section with the "([^"]*)" strategy$/, async (strategy: string) => {
  await openMenuViaJs('dashboard-section-pull-favorites')
  await $(`[data-testid="dashboard-section-pull-favorites-${strategy}"]`).click()
  // Sequential per useBulkRepoAction.ts, so this can take a couple of seconds for two repos —
  // wait for the run to leave its busy state rather than the fixed settle timeout below.
  await $('[data-testid="dashboard-section-progress-favorites"]').waitForExist({
    timeout: 15000,
    reverse: true,
  })
})

Then(
  /^the "([^"]*)" project's HEAD commit subject contains "([^"]*)"$/,
  async (name: string, expected: string) => {
    const subject = execFileSync('git', [
      '-C',
      join(FIXTURE_ROOT, name),
      'log',
      '-1',
      '--pretty=%s',
    ])
      .toString()
      .trim()
    if (!subject.includes(expected)) {
      throw new Error(
        `expected "${name}"'s HEAD commit subject to contain "${expected}", got "${subject}"`
      )
    }
  }
)
