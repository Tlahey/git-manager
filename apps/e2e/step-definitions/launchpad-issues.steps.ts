import { $, expect } from '@wdio/globals'
import { Then } from '@wdio/cucumber-framework'

Then(
  /^the "([^"]*)" launchpad tab shows the issue "([^"]*)"$/,
  async (tabId: string, issueId: string) => {
    await expect($(`[data-testid="launchpad-tab-${tabId}"]`)).toHaveElementClass('border-primary')
    await $(`[data-testid="issue-row-${issueId}"]`).waitForDisplayed({ timeout: 10000 })
  }
)

Then(
  /^the "([^"]*)" launchpad tab does not show the issue "([^"]*)"$/,
  async (tabId: string, issueId: string) => {
    await expect($(`[data-testid="launchpad-tab-${tabId}"]`)).toHaveElementClass('border-primary')
    await expect($(`[data-testid="issue-row-${issueId}"]`)).not.toBeExisting()
  }
)
