import { execFileSync } from 'node:child_process'
import { $, browser } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'

// "I check out the ... branch" and "the branch indicator reads ..." are shared — see
// undo-redo.steps.ts and detached.steps.ts.

When(/^I click the toolbar branch button$/, async () => {
  const button = $('[data-testid="toolbar-branch-button"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
  await $('[data-testid="toolbar-branch-name-input"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I set the new branch name to "([^"]*)"$/, async (name: string) => {
  const input = $('[data-testid="toolbar-branch-name-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(name)
})

When(/^I confirm the new branch creation$/, async () => {
  const button = $('[data-testid="toolbar-branch-create-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
  // The popover closes and the input unmounts once the branch is created — waiting it out proves
  // the create actually completed rather than racing the assertion that follows.
  await $('[data-testid="toolbar-branch-name-input"]').waitForExist({
    reverse: true,
    timeout: 10000,
  })
})

Then(/^the branch "([^"]*)" exists$/, async (name: string) => {
  const repoPath = getActiveRepoPath()
  const exists = () =>
    execFileSync('git', ['-C', repoPath, 'branch', '--list', name], {
      encoding: 'utf8',
    }).trim() !== ''
  await browser.waitUntil(exists, {
    timeout: 10000,
    timeoutMsg: `expected branch "${name}" to exist, it never appeared in \`git branch --list\``,
  })
})
