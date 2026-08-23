import { execFileSync } from 'node:child_process'
import { browser, $, expect } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'
import { openMenuViaJs } from '../support/interactions'

/**
 * Steps for the Branches section's bulk-cleanup dialogs (`features/branch-cleanup.feature`):
 * pruning branches whose upstream is gone, and removing merged branches. Both read the same local
 * "gone upstream" signal without a GitHub account — see `git_worktree.rs`'s
 * `gone_upstream_branches` doc comment for why that needs a real `git fetch --prune`, which is why
 * this file drives one directly rather than trusting the app's own toolbar fetch (whose `--prune`
 * behaviour depends on the auto-prune setting, not something this scenario wants to depend on).
 */

// Created at HEAD rather than at `origin/<remoteBranch>` itself — `apiDeleteBranch` runs unforced
// (see `git_branch.rs::delete_branch`), which refuses anything not merged into local HEAD, and
// `origin/feature/diverged`'s own commit is a sibling of HEAD, not an ancestor of it (see the
// `remote-ahead` fixture's own comment). Sitting at HEAD makes the branch trivially "merged" while
// `--set-upstream-to` still gives it the tracking config the gone-upstream check reads — the two
// are independent, so this pins down only the one thing this scenario is actually about.
Given(
  /^a local branch "([^"]*)" tracks "([^"]*)" on the remote$/,
  (branchName: string, remoteBranch: string) => {
    const repoPath = getActiveRepoPath()
    execFileSync('git', ['-C', repoPath, 'branch', branchName])
    execFileSync('git', [
      '-C',
      repoPath,
      'branch',
      `--set-upstream-to=origin/${remoteBranch}`,
      branchName,
    ])
  }
)

Given(/^the remote branch "([^"]*)" is deleted$/, (branchName: string) => {
  const repoPath = getActiveRepoPath()
  execFileSync('git', ['-C', repoPath, 'push', 'origin', '--delete', branchName])
})

Given(/^the remote is fetched with prune$/, () => {
  const repoPath = getActiveRepoPath()
  execFileSync('git', ['-C', repoPath, 'fetch', '--prune'])
})

When(/^I open the branch actions menu$/, async () => {
  await openMenuViaJs('branch-actions-menu-trigger')
})

When(/^I pick "([^"]*)" from the branch actions menu$/, async (label: string) => {
  const item = $(`//div[@role="menuitem"][contains(., "${label}")]`)
  await item.waitForDisplayed({ timeout: 10000 })
  await item.click()
})

Then(/^the branch-prune dialog lists "([^"]*)" as prunable$/, async (branchName: string) => {
  await $(`[data-testid="branch-prune-item-${branchName}"]`).waitForDisplayed({ timeout: 20000 })
})

When(/^I confirm the branch-prune dialog$/, async () => {
  const button = $('[data-testid="branch-prune-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(
  /^the branch-remove-merged dialog lists "([^"]*)" as removable$/,
  async (branchName: string) => {
    await $(`[data-testid="branch-remove-merged-item-${branchName}"]`).waitForDisplayed({
      timeout: 20000,
    })
  }
)

When(/^I confirm the branch-remove-merged dialog$/, async () => {
  const button = $('[data-testid="branch-remove-merged-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// "Mine" scope reuses RemoveMergedBranchesDialog's own testid (`mineOnly` only changes what it
// shows) — without a real connected account, nothing ever carries a PR author to match against,
// so the confirm button never enables and the "no GitHub" hint explains why.
Then(/^the branch-remove-my-merged dialog reports nothing to remove$/, async () => {
  await $('[data-testid="branch-remove-merged-github-hint"]').waitForDisplayed({ timeout: 10000 })
  await expect($('[data-testid="branch-remove-merged-confirm-button"]')).not.toBeEnabled()
})

Then(/^the branch "([^"]*)" no longer exists in the repository$/, async (branchName: string) => {
  const repoPath = getActiveRepoPath()
  await browser.waitUntil(
    () =>
      execFileSync('git', ['-C', repoPath, 'branch', '--list', branchName]).toString().trim()
        .length === 0,
    { timeout: 15000, timeoutMsg: `the repository still has a branch "${branchName}"` }
  )
})
