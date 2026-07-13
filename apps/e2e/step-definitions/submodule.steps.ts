import { $ } from '@wdio/globals'
import { Then } from '@wdio/cucumber-framework'

// "When I expand the ... sidebar section" is shared — see stash.steps.ts.

Then(/^the sidebar lists the submodule "([^"]*)"$/, async (path: string) => {
  const row = $(`[data-testid="submodule-item-${path}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
})
