import { $, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { clickViaJs } from '../support/interactions'

// The file explorer is one of the repo tab's three views rather than a window, so everything below
// runs against the one main window — no handle juggling like merge.steps.ts.

// The toolbar's view switcher, clicked in-page: its segments are `<label>`s wrapping an `sr-only`
// radio, which the driver's visibility test refuses (see `clickViaJs`). A label's own `click()`
// forwards to the control it labels, so this selects the view exactly as a user would.
When(/^I open the file explorer$/, async () => {
  await clickViaJs('repo-view-files')
  await $('[data-testid="project-files-view"]').waitForDisplayed({ timeout: 10000 })
})

// Leaving the view is picking another one: there is no "close" button, because the view is not a
// panel laid over the graph any more — the graph is a sibling segment of the same switcher.
When(/^I close the file explorer$/, async () => {
  await clickViaJs('repo-view-graph')
})

// The filter is the panel's own field, at the top of the tree it filters — no toolbar button and no
// floating panel to open first.
When(/^I filter the file tree by "([^"]*)"$/, async (query: string) => {
  const input = $('[data-testid="file-tree-search-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(query)
})

When(/^I hide the file tree sidebar$/, async () => {
  const button = $('[data-testid="file-tree-hide-sidebar"]')
  await button.waitForClickable({ timeout: 10000 })
  await button.click()
})

Then(/^the file explorer is shown$/, async () => {
  await expect($('[data-testid="project-files-view"]')).toBeDisplayed()
})

Then(/^the file explorer is no longer shown$/, async () => {
  await $('[data-testid="project-files-view"]').waitForDisplayed({
    timeout: 10000,
    reverse: true,
  })
})

Then(/^the file explorer lists the file "([^"]*)"$/, async (path: string) => {
  await $(`[data-testid="file-row-${path}"]`).waitForDisplayed({ timeout: 10000 })
})

Then(/^the file tree sidebar lists "([^"]*)"$/, async (path: string) => {
  await $(`[data-testid="file-tree-node-${path}"]`).waitForDisplayed({ timeout: 10000 })
})

Then(/^the file tree sidebar does not list "([^"]*)"$/, async (path: string) => {
  await expect($(`[data-testid="file-tree-node-${path}"]`)).not.toBeExisting()
})

Then(/^the file tree sidebar is shown$/, async () => {
  await expect($('[data-testid="file-tree-sidebar"]')).toBeDisplayed()
})

Then(/^the file tree sidebar is hidden$/, async () => {
  await $('[data-testid="file-tree-sidebar"]').waitForDisplayed({ timeout: 10000, reverse: true })
  // Hiding it must leave a way back, otherwise the tree is unreachable for the rest of the session.
  // That affordance is the toolbar shell's panel toggle now — it belongs to the slot rather than to
  // this view, and it stays on the bar with the panel gone.
  await expect($('[data-testid="toolbar-toggle-panel"]')).toBeDisplayed()
})
