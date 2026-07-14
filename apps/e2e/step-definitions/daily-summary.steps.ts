import { join } from 'node:path'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then, After } from '@wdio/cucumber-framework'

// Mirror repo.steps' fixture layout: fixtures live at /tmp/git-manager-fixtures/<name>, and a repo's
// display name is the directory's basename.
const FIXTURE_ROOT = '/tmp/git-manager-fixtures'

// This suite shares ONE app window across all specs, and this feature is the first to write the
// launchpad's persisted `savedRepos` + the daily-summary cache + the `dailySummary` settings. Without
// cleanup those keys would leak into every later spec (a phantom saved repo on their dashboard, a
// stored briefing, auto-generation left on), causing unrelated failures downstream. Reset them after
// each of this feature's scenarios so the shared window returns to the suite's baseline. Tagged
// `@daily-summary` (not the broad `@ai`) so it doesn't touch the commit-generation scenarios.
After({ tags: '@daily-summary' }, async () => {
  await browser.execute(() => {
    localStorage.removeItem('git-manager-repos')
    localStorage.removeItem('git-manager-daily-summaries')
    const raw = localStorage.getItem('git-manager-settings')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.state?.settings) {
        delete parsed.state.settings.dailySummary
        localStorage.setItem('git-manager-settings', JSON.stringify(parsed))
      }
    }
  })
})

// The fake-server Given ("the AI provider is pointed at a fake server") and the prompt-assertion
// Thens ("the sent prompt's system/user message contains …") are shared — see ai-generation.steps.
// Opening a fixture repo is shared — see repo.steps.

// `window.location.href = ...` navigates *asynchronously*: the assignment returns immediately and
// the old document (with all its JS, including zustand-persist) keeps running until the new one
// commits. Polling `getTitle()` can't tell the two documents apart (the title never changes), so a
// step can carry on against the OLD page. Stamping the target URL with a unique marker and waiting
// for `location.search` to carry it is the only reliable "the reload really happened" signal.
async function waitForStampedReload(stamp: string) {
  await browser.waitUntil(
    async () =>
      await browser
        .execute((marker: string) => window.location.search.includes(marker), stamp)
        .catch(() => false), // the execute can race the document swap itself — just poll again
    { timeout: 10000, timeoutMsg: `The reload stamped "${stamp}" never committed` }
  )
}

// Seeds `git-manager-settings` directly then reloads (the same pattern ai-generation.steps uses for
// the `ai` block), merging the given settings keys into the persisted snapshot. Used here to toggle
// the `dailySummary` feature flags without driving the Settings UI — those are covered by unit tests.
async function seedSettingsAndReload(patch: Record<string, unknown>) {
  const stamp = `settings-${Date.now()}`
  await browser.execute(
    (key: string, patchJson: string, marker: string) => {
      const raw = localStorage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : { state: { settings: {} }, version: 0 }
      parsed.state = parsed.state ?? {}
      parsed.state.settings = { ...parsed.state.settings, ...JSON.parse(patchJson) }
      localStorage.setItem(key, JSON.stringify(parsed))
      window.location.href = `/?e2e=${marker}`
    },
    'git-manager-settings',
    JSON.stringify(patch),
    stamp
  )
  await waitForStampedReload(stamp)
}

// Two setup concerns folded into one reload:
//  1. The launchpad only renders its repo sections when it knows at least one *saved/discovered*
//     repo (`totalKnownCount > 0`); the fixture-open step seeds only `openTabs`, so without this the
//     dashboard shows its empty state and no RepoRow (hence no briefing button) ever mounts. Register
//     the fixture into `git-manager-repos` (savedRepos) so the project actually appears. The path is
//     computed here in Node (like repo.steps) rather than read back from the persisted `openTabs`,
//     which proved unreliable across this scenario's reload chain.
//  2. The per-project briefings persist in `git-manager-daily-summaries`, and that localStorage
//     survives across scenarios in this suite's single shared app window. Clearing it guarantees each
//     scenario starts with no stored briefing — so the morning auto-run actually fires (a leftover
//     fresh summary would make it skip, sending no request) and the "empty state" scenario is empty.
Given(
  /^the "([^"]*)" project is listed in the launchpad with no briefing yet$/,
  async (fixtureName: string) => {
    const repoPath = join(FIXTURE_ROOT, fixtureName)
    // The seed is written into whatever document is current — and the *previous* reload of this
    // Background's chain can still be alive at that moment (its own `location.href` navigation is
    // asynchronous). That lingering page is a freshly mounted RepoView whose `apiOpenRepo(...)`
    // resolution calls `setRepoCache`, and any zustand set() makes zustand-persist rewrite the whole
    // partialized `git-manager-repos` snapshot from ITS in-memory state — where `savedRepos` is
    // still `[]` — silently clobbering the seed we just wrote. The launchpad then renders its empty
    // state (`totalKnownCount === 0`): no RepoRow, no briefing button, for the whole scenario.
    // (Observed in scenario 1, which always performs the session's first — cold, slow — open of the
    // fixture, so the clobbering write reliably lands just after the seed.) So: stamp each
    // attempt's URL, wait for the stamped document to actually commit (only then is the potential
    // clobberer gone), verify the seed survived, and re-seed if it didn't.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const stamp = `repo-seed-${Date.now()}-${attempt}`
      await browser.execute(
        (path: string, name: string, marker: string) => {
          localStorage.setItem(
            'git-manager-repos',
            JSON.stringify({
              state: { savedRepos: [{ path, name, pinned: false }], discoveredRepos: [] },
              version: 0,
            })
          )
          localStorage.removeItem('git-manager-daily-summaries')
          window.location.href = `/?e2e=${marker}`
        },
        repoPath,
        fixtureName,
        stamp
      )
      await waitForStampedReload(stamp)
      const seedSurvived = await browser.execute((path: string) => {
        try {
          const raw = localStorage.getItem('git-manager-repos')
          const saved = raw ? JSON.parse(raw)?.state?.savedRepos : null
          return (
            Array.isArray(saved) && saved.some((r: { path?: string }) => r?.path === path)
          )
        } catch {
          return false
        }
      }, repoPath)
      if (seedSurvived) return
    }
    throw new Error(
      `Seeding "${fixtureName}" into git-manager-repos was clobbered by a lingering page instance on every attempt`
    )
  }
)

Given(/^morning auto-generation of briefings is disabled$/, async () => {
  await seedSettingsAndReload({ dailySummary: { enabled: true, autoGenerate: false } })
})

Given(/^the daily summary feature is disabled in settings$/, async () => {
  await seedSettingsAndReload({ dailySummary: { enabled: false, autoGenerate: false } })
})

When(/^I open the launchpad dashboard$/, async () => {
  // Switch to the pinned dashboard tab via the e2e-exposed store (the tab button carries no
  // testid). Right after a reload the hook may not be installed yet, and `store?.` would silently
  // no-op — poll until the store is actually there and the switch really happened.
  await browser.waitUntil(
    async () =>
      await browser.execute(() => {
        const store = (
          window as unknown as {
            __e2eRepoUIStore?: { getState: () => { setActiveTab: (id: string) => void } }
          }
        ).__e2eRepoUIStore
        if (!store) return false
        store.getState().setActiveTab('dashboard')
        return true
      }),
    {
      timeout: 10000,
      timeoutMsg: '__e2eRepoUIStore never became available to switch to the dashboard tab',
    }
  )
  // The Browse button lives in the dashboard header — a fixture-agnostic "launchpad is shown" signal.
  await $('[data-testid="open-repo-button"]').waitForDisplayed({ timeout: 15000 })
})

When(/^I open the project's daily briefing$/, async () => {
  // The row proves the launchpad actually knows the seeded repo (vs rendering its empty state
  // because the savedRepos seed was lost) — a much more precise failure signal than the briefing
  // button silently timing out.
  await $('[data-testid="dashboard-repo-row"]').waitForExist({
    timeout: 15000,
    timeoutMsg:
      'No dashboard-repo-row — the launchpad is in its empty state, the savedRepos seed did not survive',
  })
  const button = $('[data-testid="repo-summary-button"]')
  await button.waitForDisplayed({ timeout: 15000 })
  await button.click()
  // The panel header's refresh button exists in every panel state — proves the panel mounted.
  await $('[data-testid="daily-summary-refresh-button"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the daily briefing headline becomes "([^"]*)"$/, async (expected: string) => {
  // The rendered summary proves the real get_ai_activity → ai_complete(schema) → parse chain ran end
  // to end (whether triggered by the morning auto-run or the on-demand button).
  const content = $('[data-testid="daily-summary-content"]')
  await content.waitForExist({ timeout: 20000 })
  await browser.waitUntil(async () => (await content.getText()).includes(expected), {
    timeout: 20000,
    timeoutMsg: `daily briefing content never included the headline "${expected}"`,
  })
})

Then(
  /^the daily briefing "([^"]*)" list contains "([^"]*)"$/,
  async (section: string, expected: string) => {
    const list = $(`[data-testid="daily-summary-${section}"]`)
    await list.waitForExist({ timeout: 20000 })
    await browser.waitUntil(async () => (await list.getText()).includes(expected), {
      timeout: 20000,
      timeoutMsg: `daily briefing "${section}" list never contained "${expected}"`,
    })
  }
)

Then(/^the daily briefing shows its empty state$/, async () => {
  await $('[data-testid="daily-summary-generate-button"]').waitForDisplayed({ timeout: 15000 })
})

When(/^I generate the daily briefing$/, async () => {
  const button = $('[data-testid="daily-summary-generate-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the project's daily briefing button is not shown$/, async () => {
  // Wait for the repo row to have rendered before asserting the summary button's absence, so this
  // can't pass simply because the row hasn't mounted yet.
  await $('[data-testid="dashboard-repo-row"]').waitForExist({ timeout: 15000 })
  await expect($('[data-testid="repo-summary-button"]')).not.toBeExisting()
})
