import { expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// StateTags (components/action-toolbar/StateTags.tsx) — the checked-out branch's linked open pull
// request, when `useActiveBranchPr` resolves one from a real `GET .../pulls?state=open` call.
Then(/^the pull request status tag "(\d+)" is shown$/, async (number: string) => {
  await $(`[data-testid="pr-status-tag-${number}"]`).waitForDisplayed({ timeout: 15000 })
})

When(/^I open the pull request from its status tag "(\d+)"$/, async (number: string) => {
  await $(`[data-testid="pr-status-tag-${number}"]`).click()
  await $('[data-testid="pr-detail-center"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the pull request detail panel shows the title "([^"]*)"$/, async (title: string) => {
  const heading = $('[data-testid="pr-title"]')
  await heading.waitForDisplayed({ timeout: 15000 })
  await expect(heading).toHaveText(title)
})

Then(/^the pull request merge panel is shown$/, async () => {
  await $('[data-testid="pr-merge-panel"]').waitForDisplayed({ timeout: 15000 })
})

Then(/^the pull request files panel lists "([^"]*)"$/, async (filename: string) => {
  const panel = $('[data-testid="pr-files-panel"]')
  await panel.waitForDisplayed({ timeout: 15000 })
  await expect(panel).toHaveText(filename, { containing: true })
})
