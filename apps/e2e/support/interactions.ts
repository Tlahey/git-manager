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

/**
 * Same escape hatch, for a Radix `DropdownMenuTrigger`.
 *
 * Radix opens its menus on `pointerdown`, not on `click`, so {@link clickViaJs}'s synthetic
 * `el.click()` leaves the menu shut and its items never render — the step then times out on an item
 * that was never going to exist. Dispatching a real primary-button pointer sequence is what opens
 * it (Radix ignores anything with `button !== 0` or `ctrlKey`).
 *
 * Needed for a **plainly visible** trigger too, not only a hover-revealed one: the board's card
 * status picker and its card dialog's `⋯` are ordinary buttons the driver clicks happily, and the
 * menu still never opened — this provider's native click doesn't produce the pointer sequence Radix
 * listens for. Reach for this for any `DropdownMenuTrigger`; the items *inside* the menu take an
 * ordinary driver `.click()` once it is up.
 */
export async function openMenuViaJs(testid: string): Promise<void> {
  await $(`[data-testid="${testid}"]`).waitForExist({ timeout: 10000 })
  await browser.execute((id: string) => {
    const target = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!target) throw new Error(`openMenuViaJs: no element with data-testid="${id}"`)
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      target.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, ctrlKey: false })
      )
    }
  }, testid)
}

/**
 * Picks an option in a themed native `<select>` (`packages/ui`'s `NativeSelect`).
 *
 * WDIO's own `selectByAttribute` picks the right `<option>` in the WebView but, on this WKWebView
 * driver, doesn't reliably raise a `change` event React's synthetic listener picks up — so the
 * control shows the new value and the app never hears about it. Writing through the prototype's
 * `value` setter and dispatching the event by hand is what a controlled `<select>` needs, the same
 * shape `board.steps.ts` already uses to empty a controlled `<input>`.
 *
 * Four step files carry their own copy of this (`activity-log`, `ai-pr-description`,
 * `compare-branches`, `settings-repository`); they should collapse onto this one rather than a
 * sixth being written.
 */
export async function setNativeSelectValue(testid: string, value: string): Promise<void> {
  await $(`[data-testid="${testid}"]`).waitForExist({ timeout: 10000 })
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

/**
 * Blurs whatever holds focus, in the page.
 *
 * Several fields in this app commit **on blur** rather than on a button — a card's checklist draft,
 * its blocking reason. A step that types into one and then asserts has to actually take the focus
 * away, and clicking some neutral element is not available inside a modal dialog that covers the
 * screen. React listens for `focusout` (not `blur`) at the root, so an imperative `.blur()` does
 * reach the component's `onBlur`.
 */
export async function blurActiveElement(): Promise<void> {
  await browser.execute(() => {
    const active = document.activeElement as HTMLElement | null
    active?.blur()
  })
}
