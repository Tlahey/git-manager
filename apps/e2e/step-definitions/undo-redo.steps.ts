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

  // Wait for the checkout to have *landed*, not merely to have been asked for. It is a real IPC
  // round trip, and returning as soon as the click is dispatched leaves the next step acting on the
  // branch this one was supposed to leave — which is precisely what happened in
  // `remote-push.feature`: the push that followed ran while HEAD was still `main`, so it published
  // `main` and the brand-new branch got no upstream, reported as "the app doesn't configure
  // tracking" rather than as a race. The indicator is the same signal
  // `Then the branch indicator reads "…"` reads; scenarios that assert it explicitly still can.
  const label = $('[data-testid="branch-context-label"]')
  let last = ''
  try {
    await browser.waitUntil(
      async () => {
        last = (await label.getText()).trim()
        return last === branch
      },
      { timeout: 15000 }
    )
  } catch {
    throw new Error(
      `the checkout of "${branch}" never landed — the branch indicator reads "${last}"`
    )
  }
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
