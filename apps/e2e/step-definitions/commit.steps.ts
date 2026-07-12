import { execFileSync } from 'node:child_process'
import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// The WIP staging panel (WipStagingPanel) drives a real commit: type into the message box, click
// Commit, which calls the real apiCreateCommit against the staged changes the stash-stack fixture
// leaves behind.
When(/^I enter the commit message "([^"]*)"$/, async (message: string) => {
  const input = $('[data-testid="commit-message-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(message)
})

When(/^I commit the staged changes$/, async () => {
  const button = $('[data-testid="commit-button"]')
  // Enabled only once React sees a non-empty message + at least one staged file — wait for the
  // controlled-input state to settle before clicking rather than racing it.
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
  // Don't assert on the panel here: committing the only staged change cleans the tree, which
  // removes the synthetic WIP node and unmounts the whole staging panel. The commit's completion
  // is proven by the HEAD assertion below, which polls the real repo until the commit lands.
})

// End-to-end proof: read the real fixture repo's HEAD subject straight off disk (the wdio worker
// runs in Node, same as the fixture-build step), not a volatile UI value. The commit is async, so
// poll until it lands. The active repo path is whatever the shared open-repo step seeded.
Then(/^the repository HEAD commit subject is "([^"]*)"$/, async (expected: string) => {
  const repoPath = await browser.execute(() => {
    const raw = localStorage.getItem('git-manager-repos-ui')
    return raw ? (JSON.parse(raw).state.activeRepo as string) : null
  })
  expect(repoPath).toBeTruthy()

  const headSubject = () =>
    execFileSync('git', ['-C', repoPath as string, 'log', '-1', '--pretty=%s'], {
      encoding: 'utf8',
    }).trim()

  await browser.waitUntil(() => headSubject() === expected, {
    timeout: 15000,
    timeoutMsg: `HEAD subject never became "${expected}" (last: "${headSubject()}")`,
  })
})
