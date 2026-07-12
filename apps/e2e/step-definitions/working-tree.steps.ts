import { expect, $ } from '@wdio/globals'
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
