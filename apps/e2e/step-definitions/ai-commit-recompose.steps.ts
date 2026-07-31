import { execFileSync } from 'node:child_process'
import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath as activeRepoPath } from '../support/activeRepo'

// Every commit-scoped AI action (recompose, explain, review) lives *only* on the graph row's
// right-click menu, which is a real native macOS context menu (`nativeMenuSpec.ts`/
// `nativeMenu.api.ts`) — WebDriver cannot open or click into it, the same limitation
// `tag-context-menu.feature` documents for the tag badge menu. There is no dedicated command-palette
// entry for recompose either (unlike reset/revert/branch/tag, see `useCommitCommands.ts`). But the
// native menu and a hypothetical palette command would both ultimately just call
// `setPendingGraphAction({ kind: 'recompose', ... })` on the repoUI store — GitGraph.tsx forwards
// that into its own real `RecomposeDialog` regardless of who set it (see the store's own doc comment
// on `pendingGraphAction`: "dispatched from outside GitGraph.tsx (e.g. the command palette)"). So
// this step dispatches through that same real store bridge (`window.__e2eRepoUIStore`, already
// exposed for e2e in main.tsx) instead of a menu click — everything from here on (the dialog, the
// real AI completion call, the real interactive rebase on Apply) is exactly what a real click would
// have produced.
When(/^I choose "Rewrite this commit's message \(LLM\)" from the commit's row menu$/, async () => {
  await browser.execute(() => {
    const store = (
      window as unknown as {
        __e2eRepoUIStore?: {
          getState: () => {
            setPendingGraphAction: (action: { kind: 'recompose'; includeChildren: boolean }) => void
          }
        }
      }
    ).__e2eRepoUIStore
    if (!store) throw new Error('__e2eRepoUIStore is not exposed on window')
    store.getState().setPendingGraphAction({ kind: 'recompose', includeChildren: false })
  })
  await $('[data-testid="recompose-dialog"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the proposed message becomes "([^"]*)"$/, async (expected: string) => {
  const repoPath = activeRepoPath()
  const shortOid = execFileSync('git', ['-C', repoPath, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).trim()
  const textarea = $(`[data-testid="recompose-message-${shortOid}"]`)
  await textarea.waitForDisplayed({ timeout: 10000 })
  await browser.waitUntil(async () => (await textarea.getValue()) === expected, {
    timeout: 15000,
    timeoutMsg: `recompose proposal for ${shortOid} never became "${expected}"`,
  })
})

When(/^I apply the rewritten message$/, async () => {
  const button = $('[data-testid="recompose-apply"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
  // The dialog closes itself on a successful apply (`onSuccess={closeDialog}` in
  // GitGraphOverlayManager.tsx) — waiting for that rather than polling HEAD directly avoids a race
  // against the interactive rebase still running.
  await $('[data-testid="recompose-dialog"]').waitForExist({ reverse: true, timeout: 15000 })
})

Then(/^the recompose warning about rewriting history is shown$/, async () => {
  await expect($('[data-testid="recompose-warning"]')).toBeDisplayed()
})
