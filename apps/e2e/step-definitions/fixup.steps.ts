import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import '@wdio/native-types'
import { stabiliseForSnapshot } from '../support/visual.js'

// The "Given the … fixture repository is opened" step is shared — see repo.steps.ts.

Then(/^the pending fixups banner reports (\d+) fixups$/, async (count: string | number) => {
  const banner = $('[data-testid="pending-fixups-banner"]')
  await banner.waitForDisplayed({ timeout: 10000 })
  // Cucumber can hand a numeric capture back as a number; toContain on a string needs a string.
  expect(await banner.getText()).toContain(String(count))
})

When(/^I open the autosquash preview$/, async () => {
  await $('[data-testid="autosquash-button"]').click()
  await $('[data-testid="autosquash-preview-dialog"]').waitForDisplayed()
  const groups = $('[data-testid="autosquash-preview-groups"]')
  await browser.waitUntil(async () => (await groups.getText()).length > 0, {
    timeout: 10000,
    timeoutMsg: 'The autosquash preview stayed empty',
  })
})

Then(/^the preview groups the commit "([^"]*)"$/, async (subject: string) => {
  const groups = $('[data-testid="autosquash-preview-groups"]')
  expect(await groups.getText()).toContain(subject)
})

Then(/^the preview does not show the commit "([^"]*)"$/, async (subject: string) => {
  const groups = $('[data-testid="autosquash-preview-groups"]')
  expect(await groups.getText()).not.toContain(subject)
})

Then(/^the preview matches the visual snapshot "([^"]*)"$/, async (tag: string) => {
  await stabiliseForSnapshot()
  const groups = $('[data-testid="autosquash-preview-groups"]')
  await expect(groups).toMatchElementSnapshot(tag, 1)
})

// The ⌘K "commit-fixup" command opens a REAL second WebviewWindow (unlike the merge/rebase
// editors' navigate-in-place trick — see main.tsx/GitGraph.tsx's `pendingGraphAction` bridge)
// because both of FixupCommitWindow's action buttons (Commit and Cancel) call
// `getCurrentWindow().close()`; if this were the same shared window, clicking either would kill
// the whole embedded-provider session for the rest of the test run. So this switches to the new
// window handle rather than just waiting on a testid in the current one.
let mainWindowHandle = ''
let fixupWindowHandle = ''

// WebdriverIO's native `element.click()` (the WebDriver classic `POST .../click` endpoint) throws
// "A JavaScript exception occurred" against elements in these real secondary windows — reads
// (waitForEnabled/waitForDisplayed) work fine there, only the click command itself fails, which
// points at a WebKit-driver click-atom quirk specific to a real second native window rather than
// the always-shared main one every other feature interacts with. Dispatching the click via plain
// injected JS instead sidesteps whatever that atom does.
async function clickViaJs(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`clickViaJs: no element with data-testid="${id}"`)
    el.click()
  }, testid)
}

Then(/^the fixup commit window is shown$/, async () => {
  const before = await browser.getWindowHandles()
  mainWindowHandle = before[0]
  await browser.waitUntil(
    async () => {
      const handles = await browser.getWindowHandles()
      return handles.length > before.length
    },
    { timeout: 10000, timeoutMsg: 'The fixup commit window never opened (window count unchanged)' }
  )
  const after = await browser.getWindowHandles()
  fixupWindowHandle = after.find((h) => !before.includes(h))!
  await browser.switchToWindow(fixupWindowHandle)
  await $('[data-testid="fixup-commit-message"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the fixup commit message is prefilled with "([^"]*)"$/, async (expected: string) => {
  const input = $('[data-testid="fixup-commit-message"]')
  await expect(input).toHaveValue(expected)
})

// Clicking Commit (fixup-commit-btn) creates the fixup! commit, then FixupCommitWindow opens a
// THIRD window (the interactive-rebase editor, to squash the fixup into place) before closing
// itself (`getCurrentWindow().close()`). The moment that close happens, the fixup window's
// WebDriver browsing context goes away while it's still the "current" one for the session —
// issuing any further command (even just `getWindowHandles`) against that now-defunct context is
// what was actually failing, not the click itself. Switching straight back to the always-alive
// main window right after the click, before ever polling handles again, avoids depending on the
// closing window's context at all. Driving the interactive-rebase squash flow in the third window
// is a separate concern (still 🚫 elsewhere in COVERAGE.md) — this cancels it instead, which only
// closes the window with no git side effect (`RebasingCommitWindow`'s handleCancel is a bare
// `getCurrentWindow().close()`), then returns focus to the main window so subsequent scenarios see
// a single, familiar window again.
When(/^I confirm the fixup commit$/, async () => {
  // Disabled until useGitStatus resolves (stagedCount === 0 || !message.trim()) — waiting only on
  // displayed (as the previous step does for the message textarea, which has no such async gate)
  // isn't enough here.
  const commitButton = $('[data-testid="fixup-commit-btn"]')
  await commitButton.waitForEnabled({ timeout: 10000 })
  await clickViaJs('fixup-commit-btn')

  // Give the fixup window's close() a moment to actually happen before touching the session from
  // a different context — switching away from a context that's mid-close is the risky part.
  await browser.pause(500)
  await browser.switchToWindow(mainWindowHandle)

  await browser.waitUntil(
    async () => {
      const handles = await browser.getWindowHandles()
      return handles.some((h) => h !== mainWindowHandle && h !== fixupWindowHandle)
    },
    {
      timeout: 15000,
      timeoutMsg: 'The rebasing window never opened after confirming the fixup commit',
    }
  )
  const handles = await browser.getWindowHandles()
  const rebasingHandle = handles.find((h) => h !== mainWindowHandle && h !== fixupWindowHandle)!
  await browser.switchToWindow(rebasingHandle)
  // Closing this window directly (rather than clicking its in-app Cancel button, which also just
  // calls `getCurrentWindow().close()`) isn't testing anything different — the assertion that
  // matters is the fixup commit landing on disk, not this cleanup step — and it sidesteps
  // interacting with this window's DOM at all, which is where the "no such window" / JS-exception
  // errors kept surfacing (closing this real secondary window via the native WebDriver command
  // proved more reliable than an in-app click + manual context switch here).
  await browser.closeWindow()
  await browser.switchToWindow(mainWindowHandle)
  await browser.waitUntil(
    async () => {
      const currentHandles = await browser.getWindowHandles()
      return currentHandles.length === 1 && currentHandles[0] === mainWindowHandle
    },
    {
      timeout: 10000,
      timeoutMsg: 'Did not return to a single window after closing the rebasing window',
    }
  )
})
