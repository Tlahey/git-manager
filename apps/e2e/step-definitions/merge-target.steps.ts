import { $, browser, expect } from '@wdio/globals'
import { Then, When } from '@wdio/cucumber-framework'
import { openMenuViaJs } from '../support/interactions'

/**
 * Steps for the toolbar's merge-target indicator (`features/merge-target.feature`) —
 * `components/action-toolbar/MergeTargetIndicator.tsx`. The trigger is a Radix `PopoverTrigger`,
 * which opens on `pointerdown`; a driver `.click()` leaves it shut (same reason as the board's
 * field popovers — see board-cards.steps.ts), so it goes through `openMenuViaJs` here too.
 */

Then(/^the merge-target indicator warns of a conflict$/, async () => {
  const indicator = $('[data-testid="merge-target-indicator"]')
  await indicator.waitForDisplayed({ timeout: 15000 })
  await expect(indicator).toHaveAttribute('data-state-tone', 'conflict')
})

When(/^I open the merge-target popover$/, async () => {
  await openMenuViaJs('merge-target-indicator')
  await $('[data-testid="merge-target-popover"]').waitForDisplayed({ timeout: 10000 })
})

Then(
  /^the merge-target popover reports merging "([^"]*)" into "([^"]*)"$/,
  async (branch: string, target: string) => {
    await expect($('[data-testid="merge-target-branch"]')).toHaveText(branch)
    await expect($('[data-testid="merge-target-target"]')).toHaveText(target)
  }
)

Then(
  /^the merge-target popover reports (\d+) commit(?:s)? ahead and (\d+) behind$/,
  async (ahead: string, behind: string) => {
    await expect($('[data-testid="merge-target-divergence"]')).toHaveText(
      `${ahead} commit(s) ahead, ${behind} behind the target.`
    )
  }
)

Then(/^the merge-target popover lists "([^"]*)" as a conflicting file$/, async (file: string) => {
  const list = $('[data-testid="merge-target-conflicted-files"]')
  await expect(list).toBeDisplayed()
  await browser.waitUntil(async () => (await list.getText()).includes(file), {
    timeout: 10000,
    timeoutMsg: `expected the conflicted-files list to include "${file}"`,
  })
})
