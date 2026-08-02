import { browser, $ } from '@wdio/globals'

/**
 * Clicks an element by dispatching the click inside the page instead of through the driver.
 *
 * Needed for two shapes this app uses on purpose, both of which the driver refuses to click
 * because its `isDisplayed()` follows the classic Selenium algorithm — where `opacity: 0` counts
 * as not displayed, unlike `display`/`visibility`:
 *
 * - **Hover-revealed affordances** (`opacity-0 group-hover:opacity-100`): sidebar row actions, the
 *   add-worktree button.
 * - **The real `<input>` behind `Checkbox` / `Switch`**, which is deliberately a full-size
 *   transparent overlay. Both components' own comments forbid going back to `sr-only`, which would
 *   clip the input to 1px and shrink its hit area — so this is not going to change.
 *
 * In both cases the element is genuinely present and genuinely clickable; only the driver's
 * visibility test disagrees. `waitForExist` is therefore the right wait, never `waitForDisplayed`.
 *
 * Several step files still carry their own copy of this (with small divergences); they should
 * collapse onto this one rather than a ninth being written.
 */
export async function clickViaJs(testid: string): Promise<void> {
  await $(`[data-testid="${testid}"]`).waitForExist({ timeout: 10000 })
  await browser.execute((id: string) => {
    const target = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!target) throw new Error(`clickViaJs: no element with data-testid="${id}"`)
    target.click()
  }, testid)
}
