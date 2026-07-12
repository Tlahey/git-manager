import { expect, $ } from '@wdio/globals'
import { Then } from '@wdio/cucumber-framework'

// On a detached HEAD the branch indicator (BranchContext) reads the literal "HEAD" pseudo-ref
// instead of a real branch name like "main" — the discriminator between detached and on-a-branch.
Then(/^the branch indicator reads "([^"]*)"$/, async (expected: string) => {
  const label = $('[data-testid="branch-context-label"]')
  await label.waitForDisplayed({ timeout: 10000 })
  expect((await label.getText()).trim()).toBe(expected)
})
