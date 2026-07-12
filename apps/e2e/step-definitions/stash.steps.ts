import { browser, expect, $, $$ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// The sidebar's stash section is collapsed by default (DEFAULT_SECTION_OPEN.stashes === false),
// so the stash rows aren't rendered until the header is clicked.
When(/^I expand the "([^"]*)" sidebar section$/, async (sectionKey: string) => {
  const header = $(`[data-testid="sidebar-section-${sectionKey}"]`)
  await header.waitForDisplayed({ timeout: 10000 })
  await header.click()
})

Then(/^the sidebar lists (\d+) stashes$/, async (count: string | number) => {
  const expected = Number(count)
  const countStashRows = async (): Promise<number> => {
    const rows = await $$('[data-testid^="stash-item-"]')
    return rows.length
  }
  await browser.waitUntil(async () => (await countStashRows()) === expected, {
    timeout: 10000,
    timeoutMsg: `Expected ${expected} stash rows in the sidebar`,
  })
  expect(await countStashRows()).toBe(expected)
})
