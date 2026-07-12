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
