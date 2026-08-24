import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { browser, $, $$ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo.js'

const TIMEOUT = 15000

// Written directly to the already-open fixture's working tree, before the AI-settings reload that
// follows in every scenario using this — same "write first, reload picks it up" order as
// `worktree.steps.ts`'s `the linked worktree has uncommitted changes` step. Two directories (plus
// whatever the `stash-stack` fixture itself left at the repo root) give `useWipCommitPanel.ts`'s
// mechanical top-level-directory grouping three distinct groups to prove against, rather than one.
Given(
  /^the working tree also has changes in "([^"]*)" and "([^"]*)"$/,
  (dirA: string, dirB: string) => {
    const repoPath = getActiveRepoPath()
    for (const dir of [dirA, dirB]) {
      mkdirSync(join(repoPath, dir), { recursive: true })
      writeFileSync(join(repoPath, dir, 'fixture.txt'), `content for ${dir}\n`)
    }
  }
)

When(/^I toggle WIP batch mode on$/, async () => {
  await $('[data-testid="batch-mode-toggle"]').click()
})

When(/^I click the generate-all-batches button$/, async () => {
  const button = $('[data-testid="batch-generate-all"]')
  await button.waitForEnabled({ timeout: TIMEOUT })
  await button.click()
})

When(/^I click the commit-all-batches button$/, async () => {
  const button = $('[data-testid="batch-commit-all"]')
  await button.waitForEnabled({ timeout: TIMEOUT })
  await button.click()
})

Then(/^every WIP batch group has a generated message$/, async () => {
  await browser.waitUntil(
    async () => {
      const count = await $$('[data-testid^="batch-message-"]').length
      if (count === 0) return false
      const values = await $$('[data-testid^="batch-message-"]').map((box) => box.getValue())
      return values.every((v) => v.trim().length > 0)
    },
    { timeout: TIMEOUT, timeoutMsg: 'not every WIP batch group got a generated message' }
  )
})

Then(/^the repository has one commit per changed top-level directory$/, async () => {
  const repoPath = getActiveRepoPath()
  await browser.waitUntil(
    async () => {
      const count = await $$('[data-testid^="batch-group-"]').length
      return count === 0
    },
    { timeout: TIMEOUT, timeoutMsg: 'WIP batch groups never cleared after committing' }
  )
  const subjects = execFileSync('git', ['-C', repoPath, 'log', '--format=%s', '-n', '3', 'HEAD'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
  const dirs = new Set(['root', 'src', 'docs'])
  if (subjects.length !== dirs.size) {
    throw new Error(
      `expected ${dirs.size} new commits, found ${subjects.length}: ${subjects.join(', ')}`
    )
  }
})
