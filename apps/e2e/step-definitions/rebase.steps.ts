import { execFileSync } from 'node:child_process'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'

function activeRepoPath(): Promise<string | null> {
  return browser.execute(() => {
    const raw = localStorage.getItem('git-manager-repos-ui')
    return raw ? (JSON.parse(raw).state.activeRepo as string) : null
  })
}

// The rebase-conflict fixture leaves a paused rebase; GitGraph detects it via a real
// get_rebase_state IPC call and auto-selects the synthetic conflict row, which surfaces the
// ConflictResolutionPanel (guards the bc754e2 "auto-open the conflict panel" fix).
Then(/^the conflict resolution panel is shown$/, async () => {
  await expect($('[data-testid="conflict-resolution-panel"]')).toBeDisplayed()
})

// With an unresolved conflict the panel shows Skip (nothing staged yet) + Abort; the Continue
// button only replaces Skip once every conflicted file is resolved (they're mutually exclusive
// in ConflictResolutionPanel). Abort is always available.
Then(/^the conflict panel offers to skip or abort the rebase$/, async () => {
  await expect($('[data-testid="conflict-panel-skip-button"]')).toBeDisplayed()
  await expect($('[data-testid="conflict-panel-abort-button"]')).toBeDisplayed()
})

// The panel renders file names, step progress and stable commit subjects — no shas/timestamps —
// so its layout is a clean snapshot target (see COVERAGE.md "Snapshot strategy").
Then(
  /^the conflict resolution panel matches the visual snapshot "([^"]*)"$/,
  async (tag: string) => {
    const panel = $('[data-testid="conflict-resolution-panel"]')
    await panel.waitForDisplayed({ timeout: 10000 })
    await stabiliseForSnapshot()
    await expect(panel).toMatchElementSnapshot(tag, 1)
  }
)

// The panel unmounts once GitGraph's rebase-state query reports the rebase is no longer paused
// (abort/skip/continue all end the paused state one way or another) — reverse-poll rather than a
// single check, since the state-settling + query invalidation is async.
Then(/^the conflict resolution panel is not shown$/, async () => {
  await $('[data-testid="conflict-resolution-panel"]').waitForExist({
    reverse: true,
    timeout: 15000,
  })
})

When(/^I abort the rebase$/, async () => {
  const button = $('[data-testid="conflict-panel-abort-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// Only offered while nothing's staged yet (ConflictResolutionPanel's `noneResolved` gate) — true
// on a freshly-opened fixture. This fixture rebases a single commit, so skipping it drops the
// commit entirely and the rebase completes immediately rather than pausing on a next step.
When(/^I skip the rebase step$/, async () => {
  const button = $('[data-testid="conflict-panel-skip-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

When(/^I continue the rebase$/, async () => {
  const button = $('[data-testid="conflict-panel-continue-button"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// Resolves the conflict directly on disk (bypassing the merge editor's block-accept UI, which is
// a separate, not-yet-covered piece of work — see COVERAGE.md) so "Continue" can be tested on its
// own: does clicking it actually call `git rebase --continue` and complete the rebase. Taking
// "ours" is an arbitrary but valid resolution — correctness of the merge isn't what's under test.
// The app's queries don't know about this until the page reloads (see the next step).
Given(/^the conflicted file is resolved on disk$/, async () => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  execFileSync('git', ['-C', repoPath as string, 'checkout', '--ours', 'dependency-manifest.txt'])
  execFileSync('git', ['-C', repoPath as string, 'add', 'dependency-manifest.txt'])
})
