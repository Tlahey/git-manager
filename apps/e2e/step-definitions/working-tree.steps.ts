import { execFileSync } from 'node:child_process'
import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'

function activeRepoPath(): Promise<string | null> {
  return browser.execute(() => {
    const raw = localStorage.getItem('git-manager-repos-ui')
    return raw ? (JSON.parse(raw).state.activeRepo as string) : null
  })
}

// A dirty tree (the stash-stack fixture leaves staged + unstaged changes) surfaces a synthetic
// "WIP" node at the top of the commit graph; selecting it opens the staging panel.
When(/^I select the working-tree changes in the graph$/, async () => {
  const wipRow = $('[data-testid="graph-row-WIP"]')
  await wipRow.waitForDisplayed({ timeout: 10000 })
  // The WIP row's centre is its inline "// WIP" commit input, which stops click propagation
  // (GraphRow) — so a plain click never reaches the row's onSelect. Click near the left edge,
  // over the commit-graph node, which is inside the row's clickable element.
  const { width } = await wipRow.getSize()
  await wipRow.click({ x: -Math.floor(width / 2) + 12, y: 0 })
  await $('[data-testid="wip-staging-panel"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the staging panel is shown$/, async () => {
  await expect($('[data-testid="wip-staging-panel"]')).toBeDisplayed()
})

// The staging panel shows file names + staging controls + an (empty) commit box — no shas/dates,
// so it's a deterministic snapshot target.
Then(/^the staging panel matches the visual snapshot "([^"]*)"$/, async (tag: string) => {
  await $('[data-testid="wip-staging-panel"]').waitForDisplayed({ timeout: 10000 })
  await stabiliseForSnapshot()
  await expect($('[data-testid="wip-staging-panel"]')).toMatchElementSnapshot(tag, 1)
})

// Clicking a file row (file-tree-file-<path>) sets activeDiffFile, which renders the diff view
// (DiffViewCenter → diff-content-area) in the centre column.
When(/^I open the diff for "([^"]*)"$/, async (filePath: string) => {
  const fileRow = $(`[data-testid="file-tree-file-${filePath}"]`)
  await fileRow.waitForDisplayed({ timeout: 10000 })
  await fileRow.click()
  await $('[data-testid="diff-content-area"]').waitForDisplayed({ timeout: 10000 })
})

// The diff content is the file's fixture-stable before/after — no shas/dates. Give the Monaco
// diff a beat to lay out before capturing.
Then(/^the file diff matches the visual snapshot "([^"]*)"$/, async (tag: string) => {
  const diff = $('[data-testid="diff-content-area"]')
  await diff.waitForDisplayed({ timeout: 10000 })
  await browser.pause(1000)
  await stabiliseForSnapshot()
  await expect(diff).toMatchElementSnapshot(tag, 1)
})

// Each working-tree file row (file-tree-file-<path>) replaces its persistent stage checkbox with a
// hover +/- button when the zone uses `hoverStage` (both the staged and unstaged zones do) —
// CommitFileList.tsx hardcodes its title as plain "Stage"/"Unstage" (not run through i18n, unlike
// the bulk-stage button), so this selector is locale-independent.
When(/^I stage the file "([^"]*)"$/, async (filePath: string) => {
  const row = $(`[data-testid="file-tree-file-${filePath}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  const stageButton = row.$('button[title="Stage"]')
  await stageButton.waitForExist({ timeout: 10000 })
  await stageButton.click()
})

When(/^I unstage the file "([^"]*)"$/, async (filePath: string) => {
  const row = $(`[data-testid="file-tree-file-${filePath}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  const unstageButton = row.$('button[title="Unstage"]')
  await unstageButton.waitForExist({ timeout: 10000 })
  await unstageButton.click()
})

// The bulk stage/unstage-all button (CommitFileList's `onBulkStage`) sits in each zone's header —
// the unstaged zone's is `file-list-bulk-stage` (stages everything), the staged zone's is
// `file-list-bulk-unstage` (unstages everything); distinct testids since both zones would
// otherwise render the same one (see `bulkStageTestId` on CommitFileList/CommitDetailsPanel).
When(/^I stage all unstaged files$/, async () => {
  const button = $('[data-testid="file-list-bulk-stage"]')
  await button.waitForExist({ timeout: 10000 })
  await button.click()
})

When(/^I unstage all staged files$/, async () => {
  const button = $('[data-testid="file-list-bulk-unstage"]')
  await button.waitForExist({ timeout: 10000 })
  await button.click()
})

Then(/^the file "([^"]*)" is staged$/, async (filePath: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const isStaged = () =>
    execFileSync('git', ['-C', repoPath as string, 'diff', '--cached', '--name-only'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .includes(filePath)
  await browser.waitUntil(isStaged, {
    timeout: 10000,
    timeoutMsg: `expected "${filePath}" to be staged`,
  })
})

Then(/^the file "([^"]*)" is not staged$/, async (filePath: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const isNotStaged = () =>
    !execFileSync('git', ['-C', repoPath as string, 'diff', '--cached', '--name-only'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .includes(filePath)
  await browser.waitUntil(isNotStaged, {
    timeout: 10000,
    timeoutMsg: `expected "${filePath}" to not be staged`,
  })
})
