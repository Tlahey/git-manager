import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, expect, $, $$ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { setActiveRepoPath } from '../support/activeRepo'
import { navigateAndSettle } from '../support/navigation'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_ROOT = '/tmp/git-manager-fixtures'
const SCENARIOS_DIR = join(__dirname, '../../../tools/git-fixtures/scenarios')
const REPO_DATA_KEY = 'git-manager-repos'
const REPO_UI_KEY = 'git-manager-repos-ui'

// W3C WebDriver key value for Meta (Command on macOS), same pattern as command-palette.steps.ts /
// settings.steps.ts / undo-redo.steps.ts.
const META = String.fromCharCode(0xe03d)

function fixtureRepoPath(fixtureName: string): string {
  return join(FIXTURE_ROOT, fixtureName)
}

function liveRepoUIState(): Promise<{ openTabs: string[]; activeTab: string; activeRepo: string | null }> {
  return browser.execute(() => {
    const store = (
      window as unknown as {
        __e2eRepoUIStore?: {
          getState: () => { openTabs: string[]; activeTab: string; activeRepo: string | null }
        }
      }
    ).__e2eRepoUIStore
    if (!store) throw new Error('__e2eRepoUIStore is not exposed — is this an e2e build?')
    return store.getState()
  })
}

// Builds the fixture on disk and registers it as a saved + most-recently-opened repository,
// without opening it as a tab — this is exactly the persisted shape the New Tab page's recent
// list reads (`repoData.store.ts`'s `savedRepos`/`recentRepoPaths`). Opening a repo for real goes
// through the native OS folder picker, which WebDriver can't drive — see README.md "Driving UI
// state without a real native dialog"; this is that same workaround applied to the recent list
// instead of `openTabs`.
//
// Also resets `openTabs` to empty (Dashboard active, no repo tabs): this Background step is
// every scenario's starting line, and the app is a long-lived process shared across the whole
// suite (and across separate `wdio run` invocations — the webview's localStorage lives on disk,
// not in memory) — without this, a tab another scenario opened and never closed (e.g. the
// Open/Clone/Create regressions below) leaks into this scenario's tab strip, which the @doc
// screenshot would otherwise capture.
Given(/^the "([^"]*)" fixture repository is listed as recent$/, async (fixtureName: string) => {
  execFileSync('bash', [join(SCENARIOS_DIR, `${fixtureName}.sh`)], { stdio: 'inherit' })
  const repoPath = fixtureRepoPath(fixtureName)
  setActiveRepoPath(repoPath)

  await browser.execute(
    (key: string, value: string, uiKey: string, uiValue: string) => {
      localStorage.setItem(key, value)
      localStorage.setItem(uiKey, uiValue)
    },
    REPO_DATA_KEY,
    JSON.stringify({
      state: {
        savedRepos: [{ path: repoPath, name: fixtureName, pinned: false }],
        recentRepoPaths: [repoPath],
      },
      version: 0,
    }),
    REPO_UI_KEY,
    JSON.stringify({
      state: { openTabs: [], activeTab: 'dashboard', activeRepo: null },
      version: 0,
    })
  )
})

Given(/^the "([^"]*)" fixture repository is already open in a tab$/, async (fixtureName: string) => {
  const repoPath = fixtureRepoPath(fixtureName)
  await browser.execute(
    (key: string, value: string) => localStorage.setItem(key, value),
    REPO_UI_KEY,
    JSON.stringify({
      state: { openTabs: [repoPath], activeRepo: repoPath, activeTab: repoPath },
      version: 0,
    })
  )
})

When(/^I open a new tab$/, async () => {
  const origin = await browser.execute(() => window.location.origin)
  // Land on the base route first (same reasoning as repo.steps.ts's seedAndReload: a prior
  // feature may have left the shared app window on a different route or repo), then open a
  // genuinely blank tab on top of it.
  const stamp = `new-tab-${Date.now()}`
  await navigateAndSettle(`${origin}/?e2e=${stamp}`, stamp)
  // Wait for the app shell to actually mount before sending the chord: `useKeyboardShortcuts`'s
  // `window.addEventListener('keydown', ...)` only exists once React has, and firing the key
  // chord right after `browser.url()` races that mount. Whether the reload lands on the Dashboard
  // (no repo open) or straight into a repo tab (a scenario that seeded one) depends on what the
  // scenario set up before this step, so wait for either landmark rather than assuming one.
  await browser.waitUntil(
    async () =>
      (await $('[data-testid="open-repo-button"]').isExisting()) ||
      (await $('[data-testid="repo-view"]').isExisting()),
    { timeout: 10000, interval: 250, timeoutMsg: 'Neither the Dashboard nor a repo view ever rendered' }
  )
  await browser.keys([META, 't'])
  await $('[data-testid="new-tab-page"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I pick the "([^"]*)" recent repository$/, async (fixtureName: string) => {
  const repoPath = fixtureRepoPath(fixtureName)
  const row = $(`[data-testid="new-tab-recent-repo-${repoPath}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  await row.click()
})

Then(/^the "([^"]*)" repository is open and focused$/, async (fixtureName: string) => {
  const repoPath = fixtureRepoPath(fixtureName)
  await $('[data-testid="repo-view"]').waitForDisplayed({ timeout: 15000 })
  const { activeRepo } = await liveRepoUIState()
  expect(activeRepo).toBe(repoPath)
})

Then(/^only one tab is open for it$/, async () => {
  const { openTabs } = await liveRepoUIState()
  expect(openTabs.filter((path) => !path.startsWith('new-tab:'))).toHaveLength(1)
  const rows = await $$('[data-testid^="tab-repo-"]')
  expect(rows).toHaveLength(1)
})

const NEW_TAB_BUTTON_TESTID: Record<string, string> = {
  Open: 'new-tab-open-button',
  Clone: 'new-tab-clone-button',
  Create: 'new-tab-create-button',
}

When(/^I click the New Tab "(Open|Clone|Create)" button$/, async (label: string) => {
  await $(`[data-testid="${NEW_TAB_BUTTON_TESTID[label]}"]`).click()
})

// Real Open/Clone/Create all end at the native OS folder picker, which WebDriver can't drive (see
// README.md). `pickFolder.ts` swaps in `E2eFolderPickerDialog` — a plain in-webview dialog — for
// any e2e build, so this drives that instead: never a real UI a user sees, never screenshotted.
When(/^I choose "([^"]*)" in the folder picker$/, async (path: string) => {
  const dialog = $('[data-testid="e2e-folder-picker-dialog"]')
  await dialog.waitForDisplayed({ timeout: 10000 })
  await $('[data-testid="e2e-folder-picker-input"]').setValue(path)
  await $('[data-testid="e2e-folder-picker-confirm"]').click()
})

When(/^I enter "([^"]*)" as the clone URL$/, async (url: string) => {
  await $('input[placeholder="git@github.com:owner/repo.git"]').setValue(url)
})

When(/^I click the clone dialog's Browse button$/, async () => {
  await $('[data-testid="clone-dialog-browse-button"]').click()
})

When(/^I click the clone dialog's Clone button$/, async () => {
  await $('[data-testid="clone-dialog-submit"]').click()
})

Given(/^"([^"]*)" is an empty directory on disk$/, (path: string) => {
  rmSync(path, { recursive: true, force: true })
  mkdirSync(path, { recursive: true })
})

Then(/^a repository is open at "([^"]*)"$/, async (path: string) => {
  await $('[data-testid="repo-view"]').waitForDisplayed({ timeout: 15000 })
  const { activeRepo } = await liveRepoUIState()
  expect(activeRepo).toBe(path)
})
