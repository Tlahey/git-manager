import { $ } from '@wdio/globals'
import { Then } from '@wdio/cucumber-framework'

Then(/^the commit stats tab shows a year of contribution activity$/, async () => {
  await $('[data-testid="commit-stats-tab"]').waitForDisplayed({ timeout: 10000 })
})
