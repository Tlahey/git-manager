import { $, browser, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// WDIO's own `selectByAttribute` picks the right <option> in the WebView but, on this WKWebView
// driver, doesn't reliably raise a 'change' event React's synthetic listener picks up — same
// issue and same fix as ai-pr-description.steps.ts's `setNativeSelectValue`.
async function setNativeSelectValue(testid: string, value: string) {
  await browser.execute(
    (id: string, val: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLSelectElement | null
      if (!el) throw new Error(`setNativeSelectValue: no element with data-testid="${id}"`)
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      )!.set!
      setter.call(el, val)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    testid,
    value
  )
}

When(/^I open the activity logs$/, async () => {
  await $('[data-testid="footer-activity-logs-button"]').click()
  await $('[data-testid="activity-logs-page"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I filter the activity log to errors only$/, async () => {
  await $('[data-testid="activity-level-filter"]').waitForDisplayed({ timeout: 10000 })
  await setNativeSelectValue('activity-level-filter', 'error')
})

Then(/^the activity log does not show a "([^"]*)" entry$/, async (command: string) => {
  await expect($(`[data-testid="activity-log-row"][data-command="${command}"]`)).not.toBeExisting()
})

Then(/^the activity log shows a "([^"]*)" entry$/, async (command: string) => {
  await expect($(`[data-testid="activity-log-row"][data-command="${command}"]`)).toBeExisting()
})

Then(/^the activity log scope is "(application|repository)"$/, async (scope: string) => {
  await expect($(`[data-testid="activity-scope-${scope}"]`)).toHaveAttribute('aria-pressed', 'true')
})

When(/^I switch the activity log scope to "(application|repository)"$/, async (scope: string) => {
  await $(`[data-testid="activity-scope-${scope}"]`).click()
})

When(/^I open the "([^"]*)" activity log entry$/, async (command: string) => {
  const row = $(`[data-testid="activity-log-row"][data-command="${command}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  await row.click()
})

Then(/^the activity log detail shows the error for "([^"]*)"$/, async (command: string) => {
  const detail = $('[data-testid="activity-log-detail"]')
  await detail.waitForDisplayed({ timeout: 10000 })
  await expect(detail).toHaveText(command, { containing: true })
  await expect(detail).toHaveText('error', { containing: true })
})

// Only rendered when the open entry's action has more than one correlated line
// (`ActivityLogDetail.tsx`'s `traceableId`) — the scenario picks `checkout_branch` from a
// create-and-checkout gesture specifically because that pair is guaranteed to qualify.
When(/^I trace the activity log entry$/, async () => {
  const button = $('[data-testid="activity-detail-trace"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
})

When(/^I clear the activity log trace$/, async () => {
  await $('[data-testid="activity-trace-clear"]').click()
})

Then(/^the activity trace chip is shown$/, async () => {
  await expect($('[data-testid="activity-trace-chip"]')).toBeDisplayed()
})

Then(/^the activity trace chip is not shown$/, async () => {
  await expect($('[data-testid="activity-trace-chip"]')).not.toBeExisting()
})

When(/^I search the activity log for "([^"]*)"$/, async (query: string) => {
  await $('[data-testid="activity-filter-input"]').setValue(query)
})

When(/^I click the activity log open-folder button$/, async () => {
  await $('[data-testid="activity-open-folder"]').click()
})

When(/^I click the activity log open-AI-folder button$/, async () => {
  await $('[data-testid="activity-open-ai-folder"]').click()
})

Then(/^the activity logs page is still shown$/, async () => {
  await expect($('[data-testid="activity-logs-page"]')).toBeDisplayed()
})
