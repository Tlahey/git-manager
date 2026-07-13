import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'

// W3C WebDriver key value for Meta (Command on macOS) — the value webdriverio exposes as
// `Key.Command`. Inlined to avoid depending on the `webdriverio` package (only `@wdio/globals`
// is a direct dependency here).
const META = '\uE03D'

// "Given the git-manager application is running" lives in common.steps.ts.

When(/^I open the settings$/, async () => {
  // Settings is bound to Mod+, (useKeyboardShortcuts) and opens from any view as a full-screen
  // overlay — more robust than the dashboard-only gear button, which wouldn't be reachable if a
  // prior worker left a repo tab open. On macOS the modifier is Cmd (Meta).
  await browser.keys([META, ','])
  await $('[data-testid="settings-page"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the settings screen is shown$/, async () => {
  await expect($('[data-testid="settings-page"]')).toBeDisplayed()
})

Then(/^the general settings tab is available$/, async () => {
  await expect($('[data-testid="settings-tab-general"]')).toBeDisplayed()
})

// The general section is driven purely by the persisted settings store (no version/date/network),
// so the whole settings screen — header, nav, general content — is a deterministic snapshot target.
Then(/^the settings screen matches the visual snapshot "([^"]*)"$/, async (tag: string) => {
  await $('[data-testid="settings-page"]').waitForDisplayed({ timeout: 10000 })
  await stabiliseForSnapshot()
  await expect($('[data-testid="settings-page"]')).toMatchElementSnapshot(tag, 1)
})

When(/^I open the "([^"]*)" settings tab$/, async (section: string) => {
  const tab = $(`[data-testid="settings-tab-${section}"]`)
  await tab.waitForDisplayed({ timeout: 10000 })
  await tab.click()
})

// Appearance's theme grid depends on unlocked achievements + any custom themes dropped in
// ~/.git-manager/themes/ on the machine running the test — neither is controlled by the fixture
// system, so a full-screen snapshot of that section wouldn't be reproducible across machines.
// Drive the row-height radio directly instead (a plain persisted-store value, no such drift risk).
// The `<input type="radio">` itself is visually `sr-only` (hidden) — its enclosing `<label>` (which
// carries the testid) is the real clickable surface; a nested label click still toggles the input
// per standard HTML semantics.
When(/^I select the "([^"]*)" row height$/, async (value: string) => {
  const label = $(`[data-testid="row-height-radio-${value}"]`)
  await label.waitForDisplayed({ timeout: 10000 })
  await label.click()
})

Then(/^the row height setting is "([^"]*)"$/, async (value: string) => {
  const radio = $(`[data-testid="row-height-radio-${value}"] input[type="radio"]`)
  await radio.waitForExist({ timeout: 10000 })
  await expect(radio).toBeChecked()
})

// Plain reload (not the fixture-opening step's cache-busting navigation) — this scenario isn't
// switching repos/fixtures, just proving a settings value survives a fresh mount by reading back
// from the same `git-manager-settings` localStorage key the persisted store writes to. Waiting for
// the title to re-report (same check as the shared "application is running" step) is a
// fixture-agnostic "the app finished remounting" signal, regardless of which tab ends up active.
When(/^I reload the application$/, async () => {
  await browser.execute(() => window.location.reload())
  await browser.waitUntil(async () => (await browser.getTitle()).length > 0, {
    timeout: 10000,
    timeoutMsg: 'The native window reports no title after reload',
  })
})
