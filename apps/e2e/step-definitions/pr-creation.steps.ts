import { $ } from '@wdio/globals'
import { When } from '@wdio/cucumber-framework'
import { setNativeSelectValue } from '../support/interactions'

/**
 * Interaction steps for `pr-creation.feature` — `usePrCreateFlow`'s standalone form, opened from
 * the sidebar's Pull Requests section header. "The pull request detail panel shows the title …" is
 * reused from `pr-detail-view.steps.ts`: a successful create navigates straight into the same panel.
 */

const TIMEOUT = 15000

When(/^I open the create-pr form$/, async () => {
  await $('[data-testid="pr-create-button"]').click()
  await $('[data-testid="pr-create"]').waitForDisplayed({ timeout: TIMEOUT })
})

When(/^I set the pull request base branch to "([^"]*)"$/, async (branch: string) => {
  await setNativeSelectValue('pr-create-base', branch)
})

When(/^I fill in the pull request title "([^"]*)"$/, async (title: string) => {
  const input = $('[data-testid="pr-create-title"]')
  await input.waitForDisplayed({ timeout: TIMEOUT })
  await input.setValue(title)
})

When(/^I create the pull request$/, async () => {
  await $('[data-testid="pr-create-submit"]').click()
})
