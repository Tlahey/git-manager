import { $, browser, expect } from '@wdio/globals'
import { Then } from '@wdio/cucumber-framework'

/** `commit-pr-label` (`CommitHeaderInfo.tsx`) — the commit details panel's linked-PR badge. */
Then(/^the commit's pull request badge shows "#(\d+)" titled "([^"]*)"$/, async (number, title) => {
  const badge = $('[data-testid="commit-pr-label"]')
  await badge.waitForDisplayed({ timeout: 15000 })
  await expect(badge).toHaveText(`#${number}`, { containing: true })
  await expect(badge).toHaveText(title, { containing: true })
})

/** The badge swaps its icon (and colour) between an open and a merged pull request — checked by
 * class rather than a dedicated testid, since the component has none for this distinction. */
async function badgeIsMerged(): Promise<boolean> {
  return browser.execute(() => {
    const badge = document.querySelector('[data-testid="commit-pr-label"]')
    return badge ? badge.querySelector('.text-violet-400') !== null : false
  })
}

Then(/^the commit's pull request badge shows it as open$/, async () => {
  await browser.waitUntil(async () => !(await badgeIsMerged()), { timeout: 15000 })
})

Then(/^the commit's pull request badge shows it as merged$/, async () => {
  await browser.waitUntil(badgeIsMerged, { timeout: 15000 })
})
