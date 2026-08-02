import { $, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// The file explorer replaces the graph in the centre area rather than opening a window, so
// everything below runs against the one main window — no handle juggling like merge.steps.ts.

When(/^I open the file explorer$/, async () => {
  const button = $('[data-testid="toolbar-files-button"]')
  await button.waitForClickable({ timeout: 10000 })
  await button.click()
  await $('[data-testid="project-files-view"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I close the file explorer$/, async () => {
  const button = $('[data-testid="file-explorer-close"]')
  await button.waitForClickable({ timeout: 10000 })
  await button.click()
})

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
  // Hiding it must leave a way back, otherwise the sidebar is unreachable for the rest of the
  // session — the button that restores it is the only affordance.
  await expect($('[data-testid="file-explorer-show-sidebar"]')).toBeDisplayed()
})
