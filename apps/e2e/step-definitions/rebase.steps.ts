import { execFileSync } from 'node:child_process'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'

function activeRepoPath(): Promise<string | null> {
  return browser.execute(() => {
    const raw = localStorage.getItem('git-manager-repos-ui')
    return raw ? (JSON.parse(raw).state.activeRepo as string) : null
  })
}

/**
 * Waits out the whole-app loading scrim (`loading-overlay`, `fixed inset-0 z-[9998]`), which is up
 * whenever the graph loads its history — i.e. right after a fixture is opened or reloaded. It
 * covers every panel, and WebKit's driver either clicks it instead of the intended target or
 * throws a JavaScript click error, so any step that acts on the UI right after an open must let it
 * clear first. Assertions wait for it too: panels only mount once the log has loaded.
 */
async function waitForAppIdle() {
  await $('[data-testid="loading-overlay"]').waitForExist({ reverse: true, timeout: 20000 })
}

// The rebase-conflict fixture leaves a paused rebase; GitGraph detects it via a real
// get_rebase_state IPC call and auto-selects the synthetic conflict row, which surfaces the
// ConflictResolutionPanel (guards the bc754e2 "auto-open the conflict panel" fix).
Then(/^the conflict resolution panel is shown$/, async () => {
  await waitForAppIdle()
  await $('[data-testid="conflict-resolution-panel"]').waitForDisplayed({ timeout: 15000 })
})

// With an unresolved conflict the panel shows Skip (nothing staged yet) + Abort; the Continue
// button only replaces Skip once every conflicted file is resolved (they're mutually exclusive
// in ConflictResolutionPanel). Abort is always available.
Then(/^the conflict panel offers to skip or abort the rebase$/, async () => {
  await expect($('[data-testid="conflict-panel-skip-button"]')).toBeDisplayed()
  await expect($('[data-testid="conflict-panel-abort-button"]')).toBeDisplayed()
})

// The panel renders file names, step progress and stable commit subjects — no shas/timestamps —
// so its layout is a clean snapshot target (see COVERAGE.md "Snapshot strategy").
Then(
  /^the conflict resolution panel matches the visual snapshot "([^"]*)"$/,
  async (tag: string) => {
    const panel = $('[data-testid="conflict-resolution-panel"]')
    await panel.waitForDisplayed({ timeout: 10000 })
    await stabiliseForSnapshot()
    await expect(panel).toMatchElementSnapshot(tag, 1)
  }
)

// The panel unmounts once GitGraph's rebase-state query reports the rebase is no longer paused
// (abort/skip/continue all end the paused state one way or another) — reverse-poll rather than a
// single check, since the state-settling + query invalidation is async.
Then(/^the conflict resolution panel is not shown$/, async () => {
  await $('[data-testid="conflict-resolution-panel"]').waitForExist({
    reverse: true,
    timeout: 15000,
  })
})

When(/^I abort the rebase$/, async () => {
  await waitForAppIdle()
  const button = $('[data-testid="conflict-panel-abort-button"]')
  await button.waitForDisplayed({ timeout: 15000 })
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// Only offered while nothing's staged yet (ConflictResolutionPanel's `noneResolved` gate) — true
// on a freshly-opened fixture. This fixture rebases a single commit, so skipping it drops the
// commit entirely and the rebase completes immediately rather than pausing on a next step.
When(/^I skip the rebase step$/, async () => {
  await waitForAppIdle()
  const button = $('[data-testid="conflict-panel-skip-button"]')
  await button.waitForDisplayed({ timeout: 15000 })
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

When(/^I continue the rebase$/, async () => {
  await waitForAppIdle()
  const button = $('[data-testid="conflict-panel-continue-button"]')
  await button.waitForDisplayed({ timeout: 15000 })
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// Resolves the conflict directly on disk (bypassing the merge editor's block-accept UI, which is
// a separate, not-yet-covered piece of work — see COVERAGE.md) so "Continue" can be tested on its
// own: does clicking it actually call `git rebase --continue` and complete the rebase. Taking
// "ours" is an arbitrary but valid resolution — correctness of the merge isn't what's under test.
// The app's queries don't know about this until the page reloads (see the next step).
async function resolveOnDisk(file: string) {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  execFileSync('git', ['-C', repoPath as string, 'checkout', '--ours', file])
  execFileSync('git', ['-C', repoPath as string, 'add', file])
}

Given(/^the conflicted file is resolved on disk$/, async () => {
  await resolveOnDisk('dependency-manifest.txt')
})

Given(/^the conflicted "([^"]*)" is resolved on disk$/, async (file: string) => {
  await resolveOnDisk(file)
})

// ─── Rebase progress view (the center step rail) ──────────────────────────────────────────────
// Unlike the conflict panel above (which lists the files to fix), this view answers "where am I in
// the plan": it takes the *center* over for as long as a rebase runs, listing every todo command
// with its state. Driven against the rebase-multi-step fixture, whose 6-step plan pauses twice.

Then(/^the rebase progress view is shown$/, async () => {
  await waitForAppIdle()
  await $('[data-testid="rebase-progress-center"]').waitForDisplayed({ timeout: 15000 })
})

Then(/^the rebase progress view is not shown$/, async () => {
  await $('[data-testid="rebase-progress-center"]').waitForExist({
    reverse: true,
    timeout: 15000,
  })
})

// The counter comes from git's own msgnum/end, so it advances as steps are replayed — poll rather
// than read once, since a continue settles the rebase state asynchronously.
Then(/^the rebase progress view reports "([^"]*)"$/, async (expected: string) => {
  const counter = $('[data-testid="rebase-progress-counter"]')
  await counter.waitForDisplayed({ timeout: 15000 })
  await browser.waitUntil(async () => (await counter.getText()).includes(expected), {
    timeout: 20000,
    timeoutMsg: `Step counter never read "${expected}" (last: "${await counter.getText()}")`,
  })
})

Then(
  /^the rebase progress view is rebasing "([^"]*)" onto "([^"]*)"$/,
  async (branch: string, onto: string) => {
    await expect($('[data-testid="rebase-progress-branch"]')).toHaveText(branch)
    await expect($('[data-testid="rebase-progress-onto"]')).toHaveText(onto)
  }
)

// `data-progress` is the rail's own done/current/pending marker (see StepRailRow) — asserting the
// attribute rather than pixels keeps this independent of the dot/ring styling.
Then(/^rebase step (\d+) is marked "([^"]*)"$/, async (index: string, expected: string) => {
  const row = $(`[data-testid="rebase-step-${index}"]`)
  await row.waitForDisplayed({ timeout: 15000 })
  await browser.waitUntil(async () => (await row.getAttribute('data-progress')) === expected, {
    timeout: 20000,
    timeoutMsg: `Step ${index} never became "${expected}" (last: "${await row.getAttribute('data-progress')}")`,
  })
})

Then(/^rebase step (\d+) says "([^"]*)"$/, async (index: string, expected: string) => {
  const row = $(`[data-testid="rebase-step-${index}"]`)
  await row.waitForDisplayed({ timeout: 15000 })
  await expect(row).toHaveText(expected, { containing: true })
})

// Commit subjects and step labels are stable; the only volatile text is the short OIDs in the
// trailing column (see the tolerance note in support/visual.ts — they're a tiny pixel fraction, so
// don't rely on this snapshot to catch a wrong sha).
Then(/^the rebase progress view matches the visual snapshot "([^"]*)"$/, async (tag: string) => {
  const view = $('[data-testid="rebase-progress-center"]')
  await view.waitForDisplayed({ timeout: 15000 })
  await stabiliseForSnapshot()
  await expect(view).toMatchElementSnapshot(tag, 1)
})

When(/^I hide the rebase progress view$/, async () => {
  await waitForAppIdle()
  const button = $('[data-testid="rebase-progress-hide"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// Rows carry their plan position as a testid (`rebase-step-<index>`), so a scenario can name the
// step it means without depending on commit subjects.
When(/^I click rebase step (\d+)$/, async (index: string) => {
  await waitForAppIdle()
  const row = $(`[data-testid="rebase-step-${index}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  await row.click()
})

Then(/^the commit details panel is not shown$/, async () => {
  await $('[data-testid="commit-details-panel"]').waitForExist({ reverse: true, timeout: 10000 })
})

When(/^I toggle the conflicted files panel$/, async () => {
  await waitForAppIdle()
  const button = $('[data-testid="rebase-progress-toggle-files"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the commit graph is shown$/, async () => {
  await expect($('[data-testid="commit-graph"]')).toBeDisplayed()
})

Then(/^the commit graph is not shown$/, async () => {
  await $('[data-testid="commit-graph"]').waitForExist({ reverse: true, timeout: 15000 })
})

// The synthetic CONFLICT row is the graph's paused-rebase banner (GraphRow special-cases the
// sentinel oid) — it's what keeps the rebase visible once the progress view is dismissed.
Then(/^the graph banners the paused rebase$/, async () => {
  await expect($('[data-testid="graph-row-CONFLICT"]')).toBeDisplayed()
})

// Two gotchas, both learned the hard way here:
//   1. the whole-app loading scrim (`loading-overlay`, fixed inset-0 z-9998) covers the graph while
//      it (re)loads its history — which is exactly when this step runs, right after the progress
//      view was hidden. WebKit's driver clicks the scrim instead of reporting an intercepted click,
//      so the click silently does nothing. Wait it out, as a real user would have to.
//   2. clicking the row *wrapper* (`graph-row-<oid>`) doesn't reach the row's React onClick in this
//      harness — the inner message cell has to be the click target. Same approach as bisect.steps.ts
//      picking commits in the graph.
When(/^I click the paused-rebase banner in the graph$/, async () => {
  await waitForAppIdle()
  const banner = $('[data-testid="conflict-row-banner"]')
  await banner.waitForDisplayed({ timeout: 10000 })
  await banner.click()
})

When(/^I continue the rebase from the progress view$/, async () => {
  const button = $('[data-testid="rebase-progress-continue"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

When(/^I abort the rebase from the progress view$/, async () => {
  const button = $('[data-testid="rebase-progress-abort"]')
  await button.waitForDisplayed({ timeout: 15000 })
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})
