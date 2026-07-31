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

When(/^I open the "([^"]*)" repository settings tab$/, async (section: string) => {
  const tab = $(`[data-testid="settings-local-tab-${section}"]`)
  await tab.waitForDisplayed({ timeout: 10000 })
  await tab.click()
})

When(/^I add "([^"]*)" to the repository's protected branches$/, async (branch: string) => {
  const input = $('[data-testid="repo-protected-branches-tags-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(branch)
  await browser.keys('Enter')
})

Then(/^the repository's protected branches include "([^"]*)"$/, async (branch: string) => {
  const wrapper = $('[data-testid="repo-protected-branches-tags"]')
  await wrapper.waitForDisplayed({ timeout: 10000 })
  await expect(wrapper).toHaveText(branch, { containing: true })
})

When(/^I override the repository's theme$/, async () => {
  const button = $('[data-testid="repo-override-theme-override"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
})

When(/^I select the repository theme "([^"]*)"$/, async (themeId: string) => {
  await $('[data-testid="repo-theme-select"]').waitForDisplayed({ timeout: 10000 })
  await setNativeSelectValue('repo-theme-select', themeId)
})

Then(/^the repository theme override is "([^"]*)"$/, async (themeId: string) => {
  await expect($('[data-testid="repo-theme-select"]')).toHaveValue(themeId)
})

Then(/^the global theme setting shows as overridden$/, async () => {
  await $('[data-testid="overridden-badge-theme"]').waitForDisplayed({ timeout: 10000 })
})
