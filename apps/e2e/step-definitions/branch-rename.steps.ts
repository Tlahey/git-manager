import { execFileSync } from 'node:child_process'
import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'

// Branch rename (RenameBranchDialog.tsx) is only reachable from a native macOS context menu — the
// graph's commit menu (`useGitGraphActions.ts`'s `onRenameBranch`) and the sidebar's branch menu
// (`useSidebarBranchMenu.ts`) both open it from a real OS menu WebDriver can't drive (see
// tag-menu.steps.ts's comment on native menus). Rather than faking a menu click, this dispatches
// straight into the `pendingGraphAction` store bridge (`repoUI.store.ts`) that the ⌘K command
// palette also uses for its own dialog-based actions (reset/revert/create-branch/tag — see
// command-palette.steps.ts): `GitGraph.tsx`'s own effect picks the pending action up and forwards
// it into `GitGraphOverlayManager`, which renders the exact same dialog the native menu would.
// That effect is a no-op without a commit already selected (`primaryOid`) — the dialog resolves
// the clicked node from `nodes`, not from the action payload — so a scenario must select a commit
// first (`I select the "<ref>" commit in the graph`, shared from command-palette.steps.ts).
//
// The step's name says what the *reader* does — "open the rename dialog" — not how this gets
// there. It used to end "via the store bridge", and the `@doc` scenario rendered that verbatim as
// an instruction on the published page. How the dialog is reached is what this comment is for.
When(/^I open the rename dialog for the branch "([^"]*)"$/, async (branch: string) => {
  await browser.execute((branchName: string) => {
    const store = (
      window as unknown as {
        __e2eRepoUIStore?: {
          getState: () => { setPendingGraphAction: (action: unknown) => void }
        }
      }
    ).__e2eRepoUIStore
    store?.getState().setPendingGraphAction({ kind: 'renameBranch', branch: branchName })
  }, branch)
  await $('[data-testid="rename-branch-dialog"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the rename branch dialog is shown$/, async () => {
  await expect($('[data-testid="rename-branch-dialog"]')).toBeDisplayed()
})

// The input is pre-filled with the branch's current name (RenameBranchDialog.tsx's
// `useState(branch)`); `setValue` clears it before typing, same as every other name-input step in
// this suite (e.g. "I enter the branch name" in command-palette.steps.ts).
When(/^I set the rename branch name to "([^"]*)"$/, async (name: string) => {
  const input = $('[data-testid="rename-branch-name-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(name)
})

When(/^I confirm the branch rename$/, async () => {
  const button = $('[data-testid="rename-branch-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// A rejected rename (e.g. git_branch.rs's `rename_branch` refusing main/master) leaves the dialog
// open with an inline error instead of closing. No dedicated testid on the message itself
// (RenameBranchDialog.tsx just renders `<p className="text-xs text-destructive">`), so scope the
// query inside the dialog and match on that class — the same "assert by definitive CSS class"
// pattern the Ollama test-connection scenario uses (see COVERAGE.md "3. Settings").
Then(/^an inline rename error is shown$/, async () => {
  const error = $('[data-testid="rename-branch-dialog"] .text-destructive')
  await error.waitForDisplayed({ timeout: 10000 })
})

// Complements the shared "the branch \"...\" exists" step (branch-create.steps.ts) for the other
// side of a rename: proving the *old* name is actually gone, not just that the new one appeared.
Then(/^the branch "([^"]*)" no longer exists$/, async (name: string) => {
  const repoPath = getActiveRepoPath()
  const isGone = () =>
    execFileSync('git', ['-C', repoPath, 'branch', '--list', name], {
      encoding: 'utf8',
    }).trim() === ''
  await browser.waitUntil(isGone, {
    timeout: 10000,
    timeoutMsg: `expected branch "${name}" to be gone, it still appears in \`git branch --list\``,
  })
})
