import { browser, expect, $ } from '@wdio/globals'
import { Given, Then } from '@wdio/cucumber-framework'

Given(/^the git-manager application is running$/, async () => {
  // The wdio-tauri-service already launched the binary and connected the WebDriver session
  // before any scenario runs — this step just asserts the native window is actually there.
  await browser.waitUntil(async () => (await browser.getTitle()).length > 0, {
    timeout: 10000,
    timeoutMsg: 'The native window reports no title',
  })
})

Then(/^the window title is "([^"]*)"$/, async (expectedTitle: string) => {
  expect(await browser.getTitle()).toBe(expectedTitle)
})

Then(/^the root element is displayed and not empty$/, async () => {
  const root = await $('#root')
  await expect(root).toBeDisplayed()
  const html = await root.getHTML({ includeSelectorTag: false })
  expect(html.trim().length).toBeGreaterThan(0)
})
