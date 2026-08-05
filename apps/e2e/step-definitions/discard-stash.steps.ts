import { execFileSync } from 'node:child_process'
import { $, browser, expect } from '@wdio/globals'
import { Then, When } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'

// Steps for the two destructive/parking flows that had no coverage: discarding one file's
// working-tree changes, and creating a stash from the toolbar (plus renaming one afterwards).
// Everything is asserted against real git state on disk rather than the UI's own rendering.

/**
 * Discard asks for confirmation, and the whole flow is now the app's own: the confirmation is a
 * real React dialog (`useConfirm` in packages/components), not `window.confirm`.
 *
 * This step used to stub `window.confirm` to accept, on the grounds that a native dialog is the OS
 * rather than the app. When the confirmations moved to `useConfirm` the stub became dead code
 * pointed at a function nobody calls — so the click opened a dialog the suite then never answered,
 * `discard_file_changes` was never reached, and the scenario failed on an assertion about git
 * state that was, strictly speaking, correct: nothing had been discarded.
 *
 * So: answer the dialog. Every part of the flow is genuine now, the confirmation included — which
 * is what the scenario claims to cover ("It asks for confirmation first").
 */
When(/^I discard the changes to "([^"]*)"$/, async (filePath: string) => {
  const button = $(`[data-testid="file-discard-${filePath}"]`)
  // `waitForExist`, not `waitForDisplayed`: the button renders `opacity-0` until its row is
  // hovered (see CommitFileList.tsx's `hoverStage` branch), which WebDriver reads as not displayed
  // even though it occupies its box and takes the click.
  await button.waitForExist({ timeout: 10000 })
  await button.click()

  const dialog = $('[data-testid="discard-file-confirm-dialog"]')
  await dialog.waitForDisplayed({ timeout: 10000 })
  const confirmButton = dialog.$('[data-testid="confirm-dialog-confirm"]')
  await confirmButton.waitForClickable({ timeout: 10000 })
  await confirmButton.click()
  // The dialog unmounts as soon as it is answered (`settle` clears the options), so this is the
  // signal that the click landed — without it the next step races the command it just triggered.
  await dialog.waitForExist({ reverse: true, timeout: 10000 })
})

Then(/^the file "([^"]*)" has no working-tree changes$/, async (filePath: string) => {
  const repoPath = getActiveRepoPath()
  await browser.waitUntil(
    () =>
      execFileSync('git', ['-C', repoPath, 'status', '--porcelain', '--', filePath], {
        encoding: 'utf8',
      }).trim() === '',
    { timeout: 10000, timeoutMsg: `expected "${filePath}" to have no pending changes` }
  )
})

/**
 * The graph's WIP row carries its own message field (`GraphMessageCells`), and it — not the
 * staging panel's commit box, which is local component state — is what the toolbar's Stash
 * button reads for the stash name (`useActionToolbar`'s `wipMessages[activeRepo]`).
 */
When(/^I name the work in progress "([^"]*)"$/, async (message: string) => {
  const input = $('[data-testid="wip-row-message-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(message)
})

When(/^I stash the working changes$/, async () => {
  const button = $('[data-testid="toolbar-stash-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// "the repository has N stashes" and "the working tree is clean" already exist in
// command-palette.steps.ts — steps are global, so they are reused rather than redefined.
function stashList(): string[] {
  return execFileSync('git', ['-C', getActiveRepoPath(), 'stash', 'list', '--format=%gs'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean)
}

/**
 * `git stash list` prefixes each entry with `On <branch>: ` (or `WIP on …`) — the subject the app
 * shows is what follows, so match on containment rather than equality.
 */
Then(/^the newest stash is named "([^"]*)"$/, async (message: string) => {
  await browser.waitUntil(() => (stashList()[0] ?? '').includes(message), {
    timeout: 10000,
    timeoutMsg: `expected the newest stash to mention "${message}", got "${stashList()[0]}"`,
  })
})

/**
 * Renaming goes through the same commit-details message editor a commit's own message uses — the
 * panel swaps its `stash_store`-backed subject for an input once the message box is clicked.
 */
When(/^I rename the newest stash to "([^"]*)"$/, async (message: string) => {
  const row = $('[data-testid="stash-item-0"]')
  await row.waitForDisplayed({ timeout: 10000 })
  await row.click()

  const messageBox = $('[data-testid="commit-message-clickable"]')
  await messageBox.waitForDisplayed({ timeout: 10000 })
  await messageBox.click()

  const input = $('[data-testid="commit-subject-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(message)
  const submit = $('[data-testid="commit-amend-submit"]')
  await submit.waitForEnabled({ timeout: 10000 })
  await submit.click()
  await expect(input).not.toBeDisplayed()
})
