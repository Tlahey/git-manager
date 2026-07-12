import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then, After } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'

// The embedded provider shares ONE app instance across features, run sequentially. This feature
// navigates that shared window to the merge route, so it must hand it back on the main route or
// every feature that runs after it inherits `?window=merge` and can't find the main app.
After({ tags: '@merge' }, async () => {
  await browser.execute(() => {
    window.location.href = '/'
  })
  await browser.pause(500)
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCENARIOS_DIR = join(__dirname, '../../../tools/git-fixtures/scenarios')
const FIXTURE_ROOT = '/tmp/git-manager-fixtures'

let currentRepoPath = ''

Given(/^the "([^"]*)" fixture is built$/, (fixtureName: string) => {
  execFileSync('bash', [join(SCENARIOS_DIR, `${fixtureName}.sh`)], { stdio: 'inherit' })
  currentRepoPath = join(FIXTURE_ROOT, fixtureName)
})

When(/^I open the merge editor for "([^"]*)"$/, async (filePath: string) => {
  // The merge editor renders directly from URL params — main.tsx routes `?window=merge` to
  // ConflictMergeWindow, independent of the repoUI store — so navigating the current window is
  // enough; no need to drive the native second-window flow (WebviewWindowBuilder).
  const url = `/?window=merge&repoPath=${encodeURIComponent(currentRepoPath)}&filePath=${encodeURIComponent(filePath)}`
  await browser.execute((u: string) => {
    window.location.href = u
  }, url)
  // merge-auto-merge-button appears once get_merge_view resolves and the view is renderable.
  await $('[data-testid="merge-auto-merge-button"]').waitForDisplayed({ timeout: 20000 })
})

Then(/^the merge editor is shown$/, async () => {
  await expect($('[data-testid="merge-editor-window"]')).toBeDisplayed()
})

Then(/^the merge editor offers to auto-merge the non-conflicting blocks$/, async () => {
  await expect($('[data-testid="merge-auto-merge-button"]')).toBeDisplayed()
})

// The merge editor content (file path, conflict count, the three Monaco panes) is fixture-stable
// — no shas/dates. Give Monaco a beat to finish laying out all panes + syntax highlighting.
Then(/^the merge editor matches the visual snapshot "([^"]*)"$/, async (tag: string) => {
  await $('[data-testid="merge-auto-merge-button"]').waitForDisplayed({ timeout: 20000 })
  await browser.pause(1500)
  await stabiliseForSnapshot()
  await expect($('[data-testid="merge-editor-window"]')).toMatchElementSnapshot(tag, 1)
})
