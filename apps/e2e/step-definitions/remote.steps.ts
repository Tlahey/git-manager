import { execFileSync } from 'node:child_process'
import { $, browser, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'

// "I check out the ... branch" is shared — see undo-redo.steps.ts.

When(/^I click the toolbar fetch button$/, async () => {
  const button = $('[data-testid="toolbar-fetch-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

When(/^I click the toolbar pull button$/, async () => {
  const button = $('[data-testid="toolbar-pull-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

When(/^I click the toolbar push button$/, async () => {
  const button = $('[data-testid="toolbar-push-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// The pull button's badge is `aheadCount`/`behindCount`-driven (ToolbarButton's NumberBadge) —
// it only appears once a fetch has updated the local remote-tracking ref, which is async.
Then(/^the toolbar pull button shows commits waiting to be pulled$/, async () => {
  const badge = $('[data-testid="toolbar-pull-button"] [data-testid="toolbar-button-badge"]')
  await badge.waitForDisplayed({ timeout: 15000 })
})

// Reads straight from the bare "origin" this fixture's clone points at, rather than the local
// clone's own (possibly stale) remote-tracking ref — the proof a push actually landed is the
// remote's own history, not what the local repo believes about it.
Then(
  /^the remote "([^"]*)" has the commit "([^"]*)" on branch "([^"]*)"$/,
  async (remote: string, subject: string, branch: string) => {
    const repoPath = getActiveRepoPath()
    const remoteUrl = execFileSync('git', ['-C', repoPath, 'remote', 'get-url', remote], {
      encoding: 'utf8',
    }).trim()
    const hasCommit = () =>
      execFileSync('git', ['-C', remoteUrl, 'log', branch, '--format=%s'], {
        encoding: 'utf8',
      }).includes(subject)
    await browser.waitUntil(hasCommit, {
      timeout: 10000,
      timeoutMsg: `expected "${remote}" (${remoteUrl}) branch "${branch}" to contain a commit "${subject}"`,
    })
  }
)

Then(
  /^the remote "([^"]*)" branch "([^"]*)" is unchanged since the last fetch$/,
  async (remote: string, branch: string) => {
    const repoPath = getActiveRepoPath()
    const remoteUrl = execFileSync('git', ['-C', repoPath, 'remote', 'get-url', remote], {
      encoding: 'utf8',
    }).trim()
    const remoteTip = execFileSync('git', ['-C', remoteUrl, 'rev-parse', branch], {
      encoding: 'utf8',
    }).trim()
    const knownTip = execFileSync('git', ['-C', repoPath, 'rev-parse', `${remote}/${branch}`], {
      encoding: 'utf8',
    }).trim()
    expect(remoteTip).toBe(knownTip)
  }
)

Then(/^a push-rejected error is shown$/, async () => {
  const toast = $('[role="status"]')
  await toast.waitForDisplayed({ timeout: 10000 })
})

// Reads the git config the push should have written directly, rather than the toolbar's
// ahead/behind badge — a freshly-pushed, up-to-date branch shows the same (empty) badge whether or
// not an upstream is configured, so the badge can't tell the two states apart. The config can.
Then(
  /^the branch "([^"]*)" has upstream tracking configured for "([^"]*)"$/,
  async (branch: string, remote: string) => {
    const repoPath = getActiveRepoPath()
    // `git config` exits non-zero (throwing on execFileSync) when the key isn't set yet, which is
    // simply "not there yet" while the push is still in flight — not a real error.
    const configuredRemote = () => {
      try {
        return execFileSync('git', ['-C', repoPath, 'config', `branch.${branch}.remote`], {
          encoding: 'utf8',
        }).trim()
      } catch {
        return ''
      }
    }
    await browser.waitUntil(() => configuredRemote() === remote, {
      timeout: 10000,
      timeoutMsg: `expected branch "${branch}" to track remote "${remote}"`,
    })
    const configuredMerge = execFileSync(
      'git',
      ['-C', repoPath, 'config', `branch.${branch}.merge`],
      {
        encoding: 'utf8',
      }
    ).trim()
    expect(configuredMerge).toBe(`refs/heads/${branch}`)
  }
)
