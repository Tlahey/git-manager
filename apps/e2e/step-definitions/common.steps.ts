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

/**
 * Asserts the action a scenario just performed raised no error toast.
 *
 * A scenario's positive assertion (HEAD moved, a dialog closed, a row appeared) can pass while
 * the operation still surfaced an error the user would see — a follow-up refresh failing, a
 * second IPC call rejected. Checking absence once, immediately, proves little: the toast may
 * still be rendering. So the assertion is held for a stretch that outlasts the toast's entrance
 * animation and any trailing IPC round trip, failing the moment one appears — same shape as
 * git-hooks.steps.ts's "HEAD commit subject remains" step, and cheap enough (≤1.5s) to append
 * after any mutating action. `[data-testid="toast"][data-variant="error"]` is a contract with
 * `packages/ui`'s ToastCard, pinned by its own unit test.
 */
Then(/^no error notification is displayed$/, async () => {
  const deadline = Date.now() + 1500
  while (Date.now() < deadline) {
    const message = await browser.execute(() => {
      const el = document.querySelector('[data-testid="toast"][data-variant="error"]')
      return el ? (el.textContent ?? '') : null
    })
    if (message !== null) {
      throw new Error(`an error notification is displayed: "${message}"`)
    }
    await browser.pause(200)
  }
})
