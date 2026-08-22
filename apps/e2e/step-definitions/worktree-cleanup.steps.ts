import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { browser, $, $$ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'
import { openMenuViaJs } from '../support/interactions'

/**
 * Steps for the Worktrees section's bulk-cleanup dialogs (`features/worktree-cleanup.feature`) —
 * pruning administrative metadata for worktrees whose folder is gone, and removing merged
 * worktrees whole. `worktree-cleanup.feature`'s own "gone upstream" branch reuses
 * `branch-cleanup.steps.ts`'s step (creating it at HEAD, then giving it a since-deleted upstream)
 * for the same reason that file's comment gives: `apiRemoveWorktree` deletes without `force` too.
 */

function worktreePathFor(branch: string): string {
  return `${getActiveRepoPath().replace(/\/+$/, '')}.worktrees/${branch}`
}

// Set by whichever "a worktree for … exists on disk" step ran — "that worktree's folder is
// deleted" (below) names no branch of its own in the feature's prose, so it needs to recall which
// one it means.
let lastWorktreeBranch = ''

Given(/^a worktree for a new branch "([^"]*)" exists on disk$/, (branch: string) => {
  const repoPath = getActiveRepoPath()
  const path = worktreePathFor(branch)
  rmSync(path, { recursive: true, force: true })
  execFileSync('git', ['-C', repoPath, 'worktree', 'add', '-b', branch, path])
  lastWorktreeBranch = branch
})

Given(/^a worktree for the branch "([^"]*)" exists on disk$/, (branch: string) => {
  const repoPath = getActiveRepoPath()
  const path = worktreePathFor(branch)
  rmSync(path, { recursive: true, force: true })
  execFileSync('git', ['-C', repoPath, 'worktree', 'add', path, branch])
  lastWorktreeBranch = branch
})

Given(/^that worktree's folder is deleted directly from disk$/, () => {
  // No `git worktree remove` — the point is a folder gone without git's own bookkeeping, the same
  // as an externally deleted directory or a dropped external drive (see the feature's own intro).
  rmSync(worktreePathFor(lastWorktreeBranch), { recursive: true, force: true })
})

When(/^I open the worktree actions menu$/, async () => {
  await openMenuViaJs('worktree-actions-menu-trigger')
})

When(/^I pick "([^"]*)" from the worktree actions menu$/, async (label: string) => {
  const item = $(`//div[@role="menuitem"][contains(., "${label}")]`)
  await item.waitForDisplayed({ timeout: 10000 })
  await item.click()
})

// Matched by branch text, not the exact `worktree-prune-item-<path>` testid: git canonicalizes a
// worktree's path (on macOS, `/tmp` itself is a symlink to `/private/tmp`), so the path git
// reports back rarely matches the literal string this suite built it from — the same reason
// worktree.steps.ts's own `findWorktreeRowByBranch` matches on branch text instead.
async function findItemByBranch(testidPrefix: string, branch: string) {
  return browser.waitUntil(
    async () => {
      const rows = await $$(`[data-testid^="${testidPrefix}"]`)
      for (const row of rows) {
        if ((await row.getText()).includes(branch)) return row
      }
      return false
    },
    { timeout: 20000, timeoutMsg: `no "${testidPrefix}" row mentions branch "${branch}"` }
  )
}

Then(
  /^the worktree-prune dialog lists the worktree for branch "([^"]*)"$/,
  async (branch: string) => {
    await findItemByBranch('worktree-prune-item-', branch)
  }
)

When(/^I confirm the worktree-prune dialog$/, async () => {
  const button = $('[data-testid="worktree-prune-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(
  /^the worktree-remove-merged dialog lists the worktree for branch "([^"]*)"$/,
  async (branch: string) => {
    await findItemByBranch('worktree-remove-merged-item-', branch)
  }
)

When(/^I confirm the worktree-remove-merged dialog$/, async () => {
  const button = $('[data-testid="worktree-remove-merged-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(
  /^the repository no longer has a worktree entry for branch "([^"]*)"$/,
  async (branch: string) => {
    const repoPath = getActiveRepoPath()
    await browser.waitUntil(
      () =>
        !execFileSync('git', ['-C', repoPath, 'worktree', 'list', '--porcelain'])
          .toString()
          .includes(`branch refs/heads/${branch}`),
      { timeout: 15000, timeoutMsg: `git still lists a worktree entry for branch "${branch}"` }
    )
  }
)

Then(
  /^the worktree folder for branch "([^"]*)" no longer exists on disk$/,
  async (branch: string) => {
    const path = worktreePathFor(branch)
    await browser.waitUntil(() => !existsSync(path), {
      timeout: 15000,
      timeoutMsg: `the worktree folder at ${path} still exists on disk`,
    })
  }
)
