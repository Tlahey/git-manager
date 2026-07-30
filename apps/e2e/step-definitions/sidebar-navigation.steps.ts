import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// Placeholder text is the only stable selector on the search input — it has no data-testid of its
// own, and its aria-label ("Filter branches") collides with the section's own visible label.
const SEARCH_INPUT = 'input[placeholder="Filter branches…"]'

When(/^I search the sidebar for "([^"]*)"$/, async (query: string) => {
  const input = $(SEARCH_INPUT)
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(query)
})

When(/^I clear the sidebar search$/, async () => {
  const input = $(SEARCH_INPUT)
  await input.setValue('')
})

Then(/^the sidebar filter shows "([^"]*)"$/, async (expected: string) => {
  const stats = $('[data-testid="sidebar-filter-stats"]')
  await expect(stats).toHaveText(expected, { containing: true })
})

Then(/^the sidebar filter is hidden$/, async () => {
  const stats = $('[data-testid="sidebar-filter-stats"]')
  await stats.waitForExist({ reverse: true, timeout: 10000 })
})

When(/^I enable solo mode$/, async () => {
  await $('[data-testid="sidebar-solo-toggle"]').click()
})

When(/^I clear solo mode$/, async () => {
  await $('[data-testid="sidebar-solo-clear"]').click()
})

Then(/^the solo strip shows "([^"]*)"$/, async (expected: string) => {
  const strip = $('[data-testid="sidebar-solo-strip"]')
  await expect(strip).toHaveText(expected, { containing: true })
})

Then(/^the solo strip is hidden$/, async () => {
  const strip = $('[data-testid="sidebar-solo-strip"]')
  await strip.waitForExist({ reverse: true, timeout: 10000 })
})

// "When I expand the ... sidebar section" is shared — see stash.steps.ts. Sidebar sections start
// collapsed (`DEFAULT_SECTION_OPEN` in types.ts) and that open/closed state is plain component
// state, not persisted — so it's needed again after a reload too, same as a real user would.

// The pin button is `display:none` until the branch row is hovered or already pinned
// (`hidden group-hover/branch:inline-flex` in BranchItem.tsx) — real for a reason (an unpinned
// row doesn't reserve layout space for it), but that means WebDriver can't see it as "displayed"
// to drive a real pointer click. Dispatching the click straight from the page's own JS bypasses
// that visibility check without touching the CSS a real user sees.
//
// The click is a toggle, and this driver occasionally delivers one dispatched click as two (see
// README.md's "One dispatched click, sometimes delivered twice"), which would silently flip
// pinned -> unpinned -> back off. Re-click until the toggle actually lands on "pinned" rather
// than trusting a single dispatch.
When(/^I pin the "([^"]*)" branch$/, async (branchName: string) => {
  const testId = `branch-pin-${branchName}`
  const pinBtn = $(`[data-testid="${testId}"]`)
  await pinBtn.waitForExist({ timeout: 10000 })
  const wantLabel = `Unpin ${branchName}`

  for (let attempt = 0; attempt < 3; attempt++) {
    if ((await pinBtn.getAttribute('aria-label')) === wantLabel) return
    await browser.execute((id: string) => {
      document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.click()
    }, testId)
  }
})

Then(/^the "([^"]*)" branch is pinned$/, async (branchName: string) => {
  const pinBtn = $(`[data-testid="branch-pin-${branchName}"]`)
  await browser.waitUntil(
    async () => (await pinBtn.getAttribute('aria-label')) === `Unpin ${branchName}`,
    { timeout: 10000, timeoutMsg: `"${branchName}" never showed as pinned` }
  )
})
