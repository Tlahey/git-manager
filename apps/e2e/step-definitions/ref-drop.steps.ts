import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, $, expect } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo.js'

const TIMEOUT = 15000

function git(args: string[]): string {
  return execFileSync('git', ['-C', getActiveRepoPath(), ...args], { encoding: 'utf8' }).trim()
}

function commitOid(ref: string): string {
  return git(['rev-parse', ref])
}

// Fast-forward needs a target that is a strict ancestor of the source — the fixture's own
// branches (`main`, `feature/login`) diverge on purpose (for merge-conflict/blame coverage
// elsewhere), so this builds a purely linear pair instead of hunting for one. Leaves HEAD back on
// "main" so the fixture's usual clean-tree assumption still holds for later steps.
Given(/^branch "([^"]*)" exists one commit ahead of "([^"]*)"$/, (branch: string, base: string) => {
  const repoPath = getActiveRepoPath()
  git(['checkout', '-q', '-b', branch, base])
  writeFileSync(join(repoPath, `${branch.replace(/\//g, '-')}.txt`), 'fast-forward fixture\n')
  git(['add', '.'])
  git([
    '-c',
    'user.name=E2E',
    '-c',
    'user.email=e2e@example.invalid',
    'commit',
    '-q',
    '-m',
    'feat: ff fixture commit',
  ])
  git(['checkout', '-q', base])
})

/**
 * Drives `useRefDrop.ts`'s `runRefDropAction` directly through the e2e bridge rather than a real
 * drag-and-drop: `handleDrop` pops a real native OS menu (`showNativeMenu`), which is not just
 * unclickable by WebDriver but reportedly blocks the whole webview's JS loop while open (see
 * `tag-menu.steps.ts`) — so, like `branch-rename.steps.ts`'s equivalent problem, this never
 * triggers the real menu at all. `source`/`target` are built here from real git data (a `GitRef`'s
 * exact shape, `commitOid` included) rather than resolved from the live store, so the step has no
 * dependency on internal store shape beyond the bridge signature itself.
 */
When(
  /^I run the ref-drop action "([^"]*)" dropping "([^"]*)" onto "([^"]*)"$/,
  async (actionId: string, sourceName: string, targetName: string) => {
    const source = {
      name: `refs/heads/${sourceName}`,
      shortName: sourceName,
      type: 'branch',
      commitOid: commitOid(sourceName),
    }
    const target = {
      name: `refs/heads/${targetName}`,
      shortName: targetName,
      type: 'branch',
      commitOid: commitOid(targetName),
    }
    await browser.execute(
      (id: string, src: typeof source, tgt: typeof target) => {
        const bridge = (
          window as unknown as {
            __e2eRefDropActions?: {
              run: (actionId: string, source: unknown, target: unknown) => void
            }
          }
        ).__e2eRefDropActions
        if (!bridge) throw new Error('__e2eRefDropActions is not exposed on window')
        bridge.run(id, src, tgt)
      },
      actionId,
      source,
      target
    )
  }
)

Then(
  /^the branch "([^"]*)" points at the same commit as "([^"]*)"$/,
  async (branch: string, other: string) => {
    await browser.waitUntil(() => commitOid(branch) === commitOid(other), {
      timeout: TIMEOUT,
      timeoutMsg: `"${branch}" never fast-forwarded to "${other}"`,
    })
  }
)

Then(
  /^the branch "([^"]*)" is a merge commit with "([^"]*)" as a parent$/,
  async (branch: string, parent: string) => {
    const parentOid = commitOid(parent)
    await browser.waitUntil(
      () => git(['log', '-1', '--pretty=%P', branch]).split(' ').includes(parentOid),
      {
        timeout: TIMEOUT,
        timeoutMsg: `"${branch}"'s HEAD never gained "${parent}" as a merge parent`,
      }
    )
  }
)

Then(
  /^the create-pr form is open with head "([^"]*)" and base "([^"]*)"$/,
  async (head: string, base: string) => {
    await $('[data-testid="pr-create"]').waitForDisplayed({ timeout: TIMEOUT })
    await expect($('[data-testid="pr-create-head"]')).toHaveValue(head)
    await expect($('[data-testid="pr-create-base"]')).toHaveValue(base)
  }
)
