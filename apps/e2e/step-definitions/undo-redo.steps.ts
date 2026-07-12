import { browser, $ } from '@wdio/globals'
import { When } from '@wdio/cucumber-framework'

// W3C WebDriver key values, inlined to avoid depending on the `webdriverio` package (only
// `@wdio/globals` is a direct dependency here). Meta = Command on macOS; Shift for the redo chord.
// Passing them in an array to browser.keys() presses them as a chord (modifiers held while the
// last key is pressed, then all released) — the same pattern settings.steps.ts uses for Mod+,.
const META = '\uE03D'
const SHIFT = '\uE008'

// Switch branches through the toolbar's BranchContext selector: click the current-branch label to
// open the popover, then the target branch. This is a real checkout (apiCheckoutBranch), so it
// pushes a 'checkout' entry onto the undo history keyed by the repo — exactly what Cmd+Z reverts.
When(/^I check out the "([^"]*)" branch$/, async (branch: string) => {
  const trigger = $('[data-testid="branch-context-label"]')
  await trigger.waitForDisplayed({ timeout: 10000 })
  await trigger.click()

  const option = $(`[data-testid="branch-option-${branch}"]`)
  await option.waitForDisplayed({ timeout: 10000 })
  await option.click()

  // The popover closes on checkout; Radix returns focus to the trigger (a button, not an input),
  // so the global Cmd+Z/Cmd+Shift+Z handler in useKeyboardShortcuts isn't suppressed afterwards.
})

// Undo / redo are bound to Cmd+Z / Cmd+Shift+Z globally (useKeyboardShortcuts). Both run async
// (checkout IPC + query invalidation), so the assertion step polls the branch indicator rather
// than reading it once — see the shared "the branch indicator reads" step in detached.steps.ts.
When(/^I undo the last action$/, async () => {
  await browser.keys([META, 'z'])
})

When(/^I redo the last undone action$/, async () => {
  await browser.keys([META, SHIFT, 'z'])
})
