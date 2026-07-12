import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'

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
