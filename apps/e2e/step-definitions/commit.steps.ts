import { execFileSync } from 'node:child_process'
import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { clickViaJs } from '../support/interactions.js'

function activeRepoPath(): Promise<string | null> {
  return browser.execute(() => {
    const raw = localStorage.getItem('git-manager-repos-ui')
    return raw ? (JSON.parse(raw).state.activeRepo as string) : null
  })
}

// The WIP staging panel (WipStagingPanel) drives a real commit: type into the message box, click
// Commit, which calls the real apiCreateCommit against the staged changes the stash-stack fixture
// leaves behind.
When(/^I enter the commit message "([^"]*)"$/, async (message: string) => {
  const input = $('[data-testid="commit-message-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(message)
})

When(/^I commit the staged changes$/, async () => {
  // `commit-btn` is the SplitButton's primary segment — the caret beside it holds the
  // "commit without hooks" escape hatch, which no scenario here wants.
  const button = $('[data-testid="commit-btn"]')
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
  const repoPath = await activeRepoPath()
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

// Ticking amend needs no staged file of its own (WipCommitForm's SplitButton is enabled with zero
// staged files once `isAmend` is true) — this only drives the checkbox, the message-box prefill is
// `useWipCommitPanel`'s own `handleToggleAmend` behaviour, asserted separately below.
When(/^I turn on the amend-previous-commit option$/, async () => {
  await clickViaJs('commit-amend-checkbox')
})

Then(/^the commit message box holds "([^"]*)"$/, async (expected: string) => {
  await expect($('[data-testid="commit-message-input"]')).toHaveValue(expected)
})

// Proves the amend rewrote HEAD in place rather than stacking a new commit on top of it: the
// commit *before* HEAD must still be the one that was there before the amend ever happened.
Then(/^the commit before HEAD has the subject "([^"]*)"$/, async (expected: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const subject = execFileSync(
    'git',
    ['-C', repoPath as string, 'log', '-1', '--pretty=%s', 'HEAD~1'],
    { encoding: 'utf8' }
  ).trim()
  expect(subject).toBe(expected)
})
