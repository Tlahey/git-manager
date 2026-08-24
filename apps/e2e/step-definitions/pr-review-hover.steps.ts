import { browser, $, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

const TIMEOUT = 15000

/** Matches `PrHoverCard.tsx`'s `REVIEWER_STATE_STYLES` label copy. */
const REVIEW_STATE_LABEL: Record<string, string> = {
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
  COMMENTED: 'Commented',
  PENDING: 'Pending',
}

/**
 * `PullRequestItem`'s row is a real focusable element (`tabIndex={0}`) whose `Tooltip` wrapper opens
 * on focus exactly as it does on hover (`packages/ui`'s `Tooltip` chains `onFocus`/`handleEnter`
 * onto the same 400ms-delayed `setShow(true)` a mouse hover uses) — a real `element.focus()` fires a
 * genuine native `focus` event React's root listener picks up natively, unlike a synthetic
 * `mouseenter`/`mouseover` dispatch, which WebKit's automation driver does not reliably land on
 * React's delegated hover handlers. Driving the row through focus is not a workaround standing in
 * for a real hover — it is the same code path `Tooltip` documents as its keyboard-accessible route.
 */
When(/^I focus the sidebar pull request "(\d+)"$/, async (number: string) => {
  const row = $(`[data-testid="pr-item-${number}"]`)
  await row.waitForDisplayed({ timeout: TIMEOUT })
  await browser.execute((testId: string) => {
    const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null
    el?.focus()
  }, `pr-item-${number}`)
})

Then(/^the pull request hover card "(\d+)" is shown$/, async (number: string) => {
  await $(`[data-testid="pr-hover-card-${number}"]`).waitForDisplayed({ timeout: TIMEOUT })
})

Then(
  /^the pull request hover card "(\d+)" lists reviewer "([^"]*)" as "([^"]*)"$/,
  async (number: string, login: string, state: string) => {
    const card = $(`[data-testid="pr-hover-card-${number}"]`)
    await browser.waitUntil(
      async () => {
        const text = await card.getText()
        return text.includes(login)
      },
      { timeout: TIMEOUT, timeoutMsg: `reviewer "${login}" never appeared in the hover card` }
    )
    await expect(card).toHaveText(REVIEW_STATE_LABEL[state] ?? state, { containing: true })
  }
)
