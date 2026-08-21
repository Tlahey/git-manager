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
    try {
      await browser.waitUntil(() => configuredRemote() === remote, { timeout: 10000 })
    } catch {
      // "It never tracked" cannot tell "the push failed" apart from "the push went to another
      // branch", and those have opposite causes — so the failure reports what git actually holds:
      // which branch HEAD is on, what each local branch tracks, and what the remote received.
      const probe = (args: string[]) => {
        try {
          return execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8' }).trim()
        } catch (err) {
          return `<failed: ${String(err).slice(0, 120)}>`
        }
      }
      throw new Error(
        `expected branch "${branch}" to track remote "${remote}"\n[probe] HEAD: ${probe([
          'rev-parse',
          '--abbrev-ref',
          'HEAD',
        ])}\n[probe] branches: ${probe(['branch', '-vv'])}\n[probe] remote refs: ${probe([
          'ls-remote',
          remote,
        ])}`
      )
    }
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

// ─── Tags and branches on the remote ─────────────────────────────────────────
//
// Every assertion below reads the bare origin on disk, for the same reason as the commit checks
// above: the local clone's remote-tracking refs are a cache, and a delete that only updated the
// cache would pass while the remote still carried the ref.

/** Absolute path of the fixture clone's `<remote>` URL — a local bare repo. */
function remotePath(remote: string): string {
  return execFileSync('git', ['-C', getActiveRepoPath(), 'remote', 'get-url', remote], {
    encoding: 'utf8',
  }).trim()
}

/** Ref names present on the remote for a `refs/…` prefix, read live with `ls-remote`. */
function remoteRefs(remote: string, prefix: string): string[] {
  const out = execFileSync(
    'git',
    ['-C', getActiveRepoPath(), 'ls-remote', '--refs', remote, prefix],
    {
      encoding: 'utf8',
    }
  )
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')[1] as string)
}

Then(/^the remote "([^"]*)" has the tag "([^"]*)"$/, async (remote: string, tag: string) => {
  await browser.waitUntil(() => remoteRefs(remote, 'refs/tags/*').includes(`refs/tags/${tag}`), {
    timeout: 15000,
    timeoutMsg: `expected "${remote}" (${remotePath(remote)}) to carry the tag "${tag}"`,
  })
})

Then(
  /^the remote "([^"]*)" no longer has the tag "([^"]*)"$/,
  async (remote: string, tag: string) => {
    await browser.waitUntil(() => !remoteRefs(remote, 'refs/tags/*').includes(`refs/tags/${tag}`), {
      timeout: 15000,
      timeoutMsg: `expected "${remote}" (${remotePath(remote)}) to have dropped the tag "${tag}"`,
    })
  }
)

Then(
  /^the remote "([^"]*)" no longer has the branch "([^"]*)"$/,
  async (remote: string, branch: string) => {
    await browser.waitUntil(
      () => !remoteRefs(remote, 'refs/heads/*').includes(`refs/heads/${branch}`),
      {
        timeout: 15000,
        timeoutMsg: `expected "${remote}" (${remotePath(remote)}) to have dropped the branch "${branch}"`,
      }
    )
  }
)

/** Local tags, straight from the fixture clone — the counterpart to the remote checks above. */
function localTags(): string[] {
  return execFileSync('git', ['-C', getActiveRepoPath(), 'tag'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

Then(/^the local tag "([^"]*)" still exists$/, async (tag: string) => {
  await expect(localTags()).toContain(tag)
})

Then(/^the local tag "([^"]*)" no longer exists$/, async (tag: string) => {
  await browser.waitUntil(() => !localTags().includes(tag), {
    timeout: 15000,
    timeoutMsg: `expected the local tag "${tag}" to be gone (still present: ${localTags().join(', ')})`,
  })
})

When(/^I confirm the remote (tag|branch) deletion$/, async (kind: string) => {
  const button = $(`[data-testid="delete-remote-${kind}-confirm"]`)
  await button.waitForClickable({ timeout: 10000 })
  await button.click()
  await $(`[data-testid="delete-remote-${kind}-dialog"]`).waitForExist({
    reverse: true,
    timeout: 15000,
  })
})

Then(/^the remote (tag|branch) deletion dialog is shown$/, async (kind: string) => {
  await expect($(`[data-testid="delete-remote-${kind}-dialog"]`)).toBeDisplayed()
})

// ─── Branch relationships, read from git itself ──────────────────────────────

Then(
  /^the branch "([^"]*)" contains the commit "([^"]*)"$/,
  async (branch: string, subject: string) => {
    const repoPath = getActiveRepoPath()
    const contains = () =>
      execFileSync('git', ['-C', repoPath, 'log', branch, '--format=%s'], {
        encoding: 'utf8',
      })
        .split('\n')
        .includes(subject)
    await browser.waitUntil(contains, {
      timeout: 15000,
      timeoutMsg: `expected branch "${branch}" to contain a commit "${subject}"`,
    })
  }
)

/** Same tip = the fast-forward actually moved the branch, rather than merely not failing. */
Then(
  /^the branches "([^"]*)" and "([^"]*)" point at the same commit$/,
  async (a: string, b: string) => {
    const repoPath = getActiveRepoPath()
    const tip = (ref: string) =>
      execFileSync('git', ['-C', repoPath, 'rev-parse', ref], { encoding: 'utf8' }).trim()
    await browser.waitUntil(() => tip(a) === tip(b), {
      timeout: 15000,
      timeoutMsg: `expected "${a}" (${tip(a)}) and "${b}" (${tip(b)}) to point at the same commit`,
    })
  }
)
