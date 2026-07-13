import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

// Whether this actually resolves connected or disconnected depends on whether the machine running
// the suite happens to have a real Ollama server on localhost:11434 — a developer box very
// plausibly does (it's what the app's own AI commit-message feature talks to), unlike an isolated
// CI runner. Mocking the IPC command wouldn't help either: it doesn't reach a real UI click (see
// command-mocking.feature's own note on that limitation). So this only asserts that clicking
// "Test Connection" produces *some* definitive status — one of the two classes the component ever
// applies — not which one; asserting a specific outcome here would be genuinely flaky across
// machines, not just theoretically so (this exact assertion failed against a real live Ollama).
When(/^I click the AI provider test connection button$/, async () => {
  const button = $('[data-testid="ai-test-connection-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the AI provider connection status is reported$/, async () => {
  const status = $('[data-testid="ai-connection-status"]')
  await status.waitForDisplayed({ timeout: 15000 })
  const className = (await status.getAttribute('class')) ?? ''
  const reportsAKnownState =
    className.includes('text-destructive') || className.includes('text-green-500')
  expect(reportsAKnownState).toBe(true)
})

Then(
  /^the "([^"]*)" AI provider option is (enabled|disabled)$/,
  async (presetId: string, state: string) => {
    const select = $('[data-testid="ai-provider-select"]')
    await select.waitForDisplayed({ timeout: 10000 })
    const option = select.$(`option[value="${presetId}"]`)
    const disabledAttr = await option.getAttribute('disabled')
    if (state === 'enabled') {
      expect(disabledAttr).toBeNull()
    } else {
      expect(disabledAttr).not.toBeNull()
    }
  }
)

When(/^I toggle the rewards setting (on|off)$/, async (state: string) => {
  const checkbox = $('[data-testid="rewards-toggle"]')
  await checkbox.waitForDisplayed({ timeout: 10000 })
  const isChecked = await checkbox.isSelected()
  if (isChecked !== (state === 'on')) {
    await checkbox.click()
  }
})

Then(/^the rewards setting is "(on|off)"$/, async (state: string) => {
  const checkbox = $('[data-testid="rewards-toggle"]')
  await checkbox.waitForExist({ timeout: 10000 })
  if (state === 'on') {
    await expect(checkbox).toBeSelected()
  } else {
    await expect(checkbox).not.toBeSelected()
  }
})

When(/^I open the SSH key generator$/, async () => {
  const toggle = $('[data-testid="ssh-generator-toggle"]')
  await toggle.waitForDisplayed({ timeout: 10000 })
  await toggle.click()
  await $('[data-testid="ssh-generate-path-input"]').waitForDisplayed({ timeout: 10000 })
})

// A fresh mkdtemp dir guarantees ssh-keygen never finds a pre-existing file at the destination —
// it prompts interactively to overwrite one, which would hang the test — and keeps this well away
// from the user's real ~/.ssh (generate_ssh_key, apps/desktop/src-tauri/src/commands/ssh.rs, shells
// out to the real `ssh-keygen` and creates parent dirs itself).
let generatedSshKeyPath = ''

When(/^I set the SSH key generation path to a temporary location$/, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-manager-e2e-ssh-'))
  generatedSshKeyPath = join(dir, 'id_e2e_test')
  const input = $('[data-testid="ssh-generate-path-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(generatedSshKeyPath)
})

When(/^I click the generate SSH key button$/, async () => {
  const button = $('[data-testid="ssh-generate-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the generated SSH public key is shown$/, async () => {
  const textarea = $('[data-testid="ssh-generated-pubkey"]')
  await textarea.waitForDisplayed({ timeout: 15000 })
  const value = await textarea.getValue()
  expect(value).toContain('ssh-ed25519')
})

Then(/^a real SSH key pair exists at the generated path$/, () => {
  expect(existsSync(generatedSshKeyPath)).toBe(true)
  expect(existsSync(`${generatedSshKeyPath}.pub`)).toBe(true)
})

// `theme-card-<id>` is keyed on the theme's raw id (AppearanceSection.tsx), not its translated
// label — this app defaults to French, so the label-derived testid this used to carry
// (`theme-card-sombre` for "dark") would have made the step fragile across locales/translation
// changes. Only always-unlocked built-in themes (dark/light/system/…) are safe picks here —
// achievement-gated ones (forest/amethyst/cyberpunk/platinum) aren't shown until unlocked.
When(/^I select the "([^"]*)" theme$/, async (themeId: string) => {
  const card = $(`[data-testid="theme-card-${themeId}"]`)
  await card.waitForDisplayed({ timeout: 10000 })
  await card.click()
})

// useTheme.ts applies the resolved theme to `<html data-theme="...">` — reading that attribute
// directly proves the theme actually took effect, not just that the setting persisted.
Then(/^the active theme is "([^"]*)"$/, async (themeId: string) => {
  await browser.waitUntil(
    async () => (await browser.execute(() => document.documentElement.dataset.theme)) === themeId,
    { timeout: 10000, timeoutMsg: `document.documentElement's data-theme never became "${themeId}"` }
  )
})

// A single theme card's own swatch — not the whole grid (COVERAGE.md's "Skipped on purpose" note
// on why a full appearance snapshot isn't reproducible: which OTHER cards show up depends on
// unlocked achievements + custom themes dropped in ~/.git-manager/themes/ on the test machine).
// "dark" is never achievement-gated, so this specific card is always present and stable.
Then(/^the "([^"]*)" theme card matches the visual snapshot "([^"]*)"$/, async (
  themeId: string,
  tag: string
) => {
  const card = $(`[data-testid="theme-card-${themeId}"]`)
  await card.waitForDisplayed({ timeout: 10000 })
  await stabiliseForSnapshot()
  await expect(card).toMatchElementSnapshot(tag, 1)
})
