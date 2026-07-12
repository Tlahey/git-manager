import { browser, $ } from '@wdio/globals'
import { Then } from '@wdio/cucumber-framework'

// The branch indicator (BranchContext) reads the current branch name — or the literal "HEAD"
// pseudo-ref when detached, the discriminator between detached and on-a-branch. Shared across the
// detached-head and undo-redo features. Polls rather than reading once: after an undo/redo (Cmd+Z)
// the checkout + query invalidation are async, so the label updates a beat after the key press.
Then(/^the branch indicator reads "([^"]*)"$/, async (expected: string) => {
  const label = $('[data-testid="branch-context-label"]')
  await label.waitForDisplayed({ timeout: 10000 })
  await browser.waitUntil(async () => (await label.getText()).trim() === expected, {
    timeout: 10000,
    timeoutMsg: `branch indicator never read "${expected}"`,
  })
})
