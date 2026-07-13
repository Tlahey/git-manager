import { execFileSync } from 'node:child_process'
import { browser, expect, $, $$ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// The Blame/History toggles + Diff/File tabs live in DiffToolbar (data-testids added for e2e). The
// blame gutter / annotations use `data-testid="blame-avatar-<sha>"` etc., matched by prefix since
// the sha is fixture-generated.

function activeRepoPath(): Promise<string | null> {
  return browser.execute(() => {
    const raw = localStorage.getItem('git-manager-repos-ui')
    return raw ? (JSON.parse(raw).state.activeRepo as string) : null
  })
}

// Open a committed file's diff deterministically via the e2e-only repoUI store hook (main.tsx,
// VITE_E2E-gated) instead of clicking a graph row + a commit-details file row — those clicks are
// racy on a cold graph render (the previous approaches failed there, not in the blame logic).
When(/^I open the diff for "([^"]*)" at "([^"]*)"$/, async (filePath: string, ref: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const oid = execFileSync('git', ['-C', repoPath as string, 'rev-parse', ref], {
    encoding: 'utf8',
  }).trim()

  await browser.execute(
    (file: { path: string; staged: boolean; oid: string }) => {
      const store = (
        window as unknown as {
          __e2eRepoUIStore?: { getState: () => { setActiveDiffFile: (f: unknown) => void } }
        }
      ).__e2eRepoUIStore
      store?.getState().setActiveDiffFile(file)
    },
    { path: filePath, staged: false, oid }
  )

  await $('[data-testid="diff-content-area"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I open the file history$/, async () => {
  const toggle = $('[data-testid="diff-history-toggle"]')
  await toggle.waitForClickable({ timeout: 10000 })
  await toggle.click()
  await $('[data-testid="file-history-list"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the history panel lists at least (\d+) version[s]?$/, async (min: string) => {
  await browser.waitUntil(
    async () => (await $$('[data-testid^="history-row-"]').length) >= Number(min),
    { timeout: 10000, timeoutMsg: `expected at least ${min} history row(s)` }
  )
})

When(/^I switch to the File view$/, async () => {
  const tab = $('[data-testid="diff-tab-file"]')
  await tab.waitForClickable({ timeout: 10000 })
  await tab.click()
  await $('[data-testid="blame-file-viewer"]').waitForDisplayed({ timeout: 10000 })
})

// Blame needs the backend blame call + Monaco layout before the scroll-synced avatars appear;
// give it a beat and then wait for the first avatar button.
Then(/^the blame gutter shows at least one author avatar$/, async () => {
  await browser.pause(1000)
  await $('[data-testid^="blame-avatar-"]').waitForDisplayed({ timeout: 15000 })
  const count = await $$('[data-testid^="blame-avatar-"]').length
  expect(count).toBeGreaterThan(0)
})

When(/^I enable blame mode$/, async () => {
  const toggle = $('[data-testid="diff-blame-toggle"]')
  await toggle.waitForClickable({ timeout: 10000 })
  await toggle.click()
})

Then(/^the blame column shows a commit annotation$/, async () => {
  await browser.pause(1000)
  await $('[data-testid^="blame-annotation-"]').waitForDisplayed({ timeout: 15000 })
})

When(/^I select the first history version$/, async () => {
  const firstRow = $('[data-testid^="history-row-"]')
  await firstRow.waitForClickable({ timeout: 10000 })
  await firstRow.click()
})

Then(/^the diff shows the version SHA bar$/, async () => {
  await $('[data-testid="diff-version-bar"]').waitForDisplayed({ timeout: 10000 })
  await expect($('[data-testid="diff-version-sha"]')).toBeDisplayed()
})
