import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'
import { clickViaJs } from '../support/interactions.js'
import { navigateAndSettle } from '../support/navigation.js'

// W3C WebDriver key value for Meta (Command on macOS) — the value webdriverio exposes as
// `Key.Command`. Inlined to avoid depending on the `webdriverio` package (only `@wdio/globals`
// is a direct dependency here).
const META = '\uE03D'

// "Given the git-manager application is running" lives in common.steps.ts.

When(/^I open the settings$/, async () => {
  // Settings is bound to Mod+, (useKeyboardShortcuts) and opens from any view as a full-screen
  // overlay — more robust than the dashboard-only gear button, which wouldn't be reachable if a
  // prior worker left a repo tab open. On macOS the modifier is Cmd (Meta).
  //
  // Retry the chord instead of firing it once: this step also runs straight after
  // "I reload the application" (window.location.reload) in the "persists across a reload"
  // scenarios, and a single Mod+, can land in the gap between the reload and useKeyboardShortcuts'
  // `window.addEventListener('keydown', ...)` re-attaching on remount — the keypress is then lost
  // for good and settings-page never appears, burning the full waitForDisplayed timeout (this was
  // the dominant, run-to-run-flaky cost of the whole suite). onOpenSettings only does
  // setShowSettings(true) (open-only, never a toggle), so repeating the chord is idempotent and
  // safe. The happy path (listener already attached) satisfies the condition on the first pass, so
  // scenarios that open settings without a preceding reload are not slowed down.
  const page = $('[data-testid="settings-page"]')
  let attempts = 0
  await browser.waitUntil(
    async () => {
      if (await page.isDisplayed().catch(() => false)) return true
      attempts += 1
      await browser.keys([META, ','])
      if (await page.isDisplayed().catch(() => false)) return true
      // Native chords occasionally get lost for the whole wait — not just the reload gap above:
      // when the OS takes focus off the window, `browser.keys` delivers nothing at all, and one
      // random settings scenario per full run used to burn this whole timeout. After a few real
      // attempts, also dispatch the same keydown synthetically on `window`: it drives the exact
      // `useKeyboardShortcuts` handler a real Cmd+, reaches (the listener never checks
      // `isTrusted`), minus the native key delivery that focus loss breaks. Real chords keep
      // getting sent first on every pass, so a healthy run still exercises the true shortcut path.
      if (attempts >= 4) {
        console.warn('[e2e] Mod+, chord seems lost — falling back to a synthetic keydown')
        await browser.execute(() => {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true })
          )
        })
      }
      return page.isDisplayed().catch(() => false)
    },
    { timeout: 10000, interval: 500, timeoutMsg: 'settings-page never appeared after Mod+,' }
  ).catch(async (e) => {
    // The chord and the synthetic fallback both failing means the app itself did not respond —
    // capture what page it was actually on, so the next flaky run is data instead of a mystery.
    const diag = await browser
      .execute(() => ({
        url: window.location.href,
        rootChildren: document.getElementById('root')?.childElementCount ?? -1,
        bodyMarkers: [...document.querySelectorAll('[data-testid]')]
          .slice(0, 10)
          .map((el) => el.getAttribute('data-testid')),
      }))
      .catch(() => 'diagnostics unavailable (execute failed)')
    throw new Error(
      `settings-page never appeared after Mod+, — app state: ${JSON.stringify(diag)}`,
      { cause: e }
    )
  })
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

// A full remount — this scenario isn't switching repos/fixtures, just proving a settings value
// survives a fresh mount by reading back from the same `git-manager-settings` localStorage key
// the persisted store writes to. Navigated with a stamp rather than `location.reload()`: a title
// poll cannot tell the old document from the new one (the title never changes), and returning
// while the swap is mid-flight lets the service's window probe race the dying document and burn
// its silent 30s timeout on the next element command (support/navigation.ts).
When(/^I reload the application$/, async () => {
  const origin = await browser.execute(() => window.location.origin)
  const stamp = `reload-${Date.now()}`
  await navigateAndSettle(`${origin}/?e2e=${stamp}`, stamp)
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
    className.includes('text-tone-danger') || className.includes('text-tone-success')
  expect(reportsAKnownState).toBe(true)
})

// `Switch` renders its real <input> as a full-size transparent overlay (`opacity-0`), which this
// WebKit provider's isDisplayed() reports as not displayed — so wait on existence and click in the
// page. See support/interactions.ts.
When(/^I toggle the AI setting (on|off)$/, async (state: string) => {
  const toggle = $('[data-testid="ai-enabled-toggle"]')
  await toggle.waitForExist({ timeout: 10000 })
  // `isSelected()` reads the input's `checked` property, which transparency doesn't affect.
  const isOn = await toggle.isSelected()
  if (isOn !== (state === 'on')) {
    await clickViaJs('ai-enabled-toggle')
  }
})

// The master switch gates every AI setting: with it off, the provider block and the per-feature
// toggles are unmounted, leaving only the switch itself and an explanatory line.
Then(/^the AI provider configuration is hidden$/, async () => {
  await $('[data-testid="ai-disabled-hint"]').waitForDisplayed({ timeout: 10000 })
  expect(await $('[data-testid="ai-provider-select"]').isExisting()).toBe(false)
  expect(await $('[data-testid="ai-url-input"]').isExisting()).toBe(false)
  expect(await $('[data-testid="daily-summary-enabled-toggle"]').isExisting()).toBe(false)
})

// The provider picker is a searchable popover (Popover + cmdk), not a native <select> — its options
// only exist in the DOM while open, so open it first unless a prior step in the same scenario
// already left it open (re-clicking the trigger would just close it again). Every shipped preset is
// selectable today; the `disabled` half of this step is kept for a future "coming soon" entry.
Then(
  /^the "([^"]*)" AI provider option is (enabled|disabled)$/,
  async (presetId: string, state: string) => {
    const trigger = $('[data-testid="ai-provider-select"]')
    await trigger.waitForDisplayed({ timeout: 10000 })
    const option = $(`[data-testid="ai-provider-option-${presetId}"]`)
    if (!(await option.isExisting())) {
      await trigger.click()
    }
    await option.waitForDisplayed({ timeout: 10000 })
    const disabledAttr = await option.getAttribute('data-disabled')
    if (state === 'enabled') {
      expect(disabledAttr).toBe('false')
    } else {
      expect(disabledAttr).toBe('true')
    }
  }
)

// The checkbox's real `<input>` is deliberately kept `opacity-0` rather than `sr-only` (see
// checkbox.tsx's doc comment) so it stays the actual hit area under the painted box sibling —
// but that same opacity is why WebKit's WebDriver reports it as not displayed even though it has
// a real, clickable bounding box: `waitForDisplayed`/`isDisplayed` return false for it, while
// `waitForExist` + `.click()` work exactly as they do for a sighted user.
When(/^I toggle the rewards setting (on|off)$/, async (state: string) => {
  const checkbox = $('[data-testid="rewards-toggle"]')
  await checkbox.waitForExist({ timeout: 10000 })
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
  // Same transparent-input shape as the AI switch above.
  await clickViaJs('ssh-generator-toggle')
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

// The "integrations" tab defaults to the GitHub sub-provider (IntegrationSection.tsx's
// `activeProvider` initial state), so no extra sub-tab click is needed to reach this button.
When(/^I click the GitHub OAuth login button$/, async () => {
  const button = $('[data-testid="github-login-oauth-button"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
})

// This hits the REAL github_device_code command — a genuine network call to
// github.com/login/device/code — rather than a mock. Unlike the Ollama test-connection button
// (whose outcome depends on whether *this* machine happens to run a local server), requesting a
// device code needs no auth and always succeeds against GitHub's public endpoint, so asserting the
// real response shape here is safe and deterministic, not machine-dependent.
Then(/^the GitHub device code and activation link are shown$/, async () => {
  await $('[data-testid="github-device-flow-card"]').waitForDisplayed({ timeout: 15000 })
  const userCode = await $('[data-testid="github-device-user-code"]').getText()
  expect(userCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  const href = await $('[data-testid="github-device-verification-link"]').getAttribute('href')
  expect(href).toMatch(/^https:\/\/github\.com\/login\/device/)
})

When(/^I cancel the GitHub OAuth login$/, async () => {
  const button = $('[data-testid="github-device-cancel-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the GitHub login options are shown again$/, async () => {
  await expect($('[data-testid="github-login-oauth-button"]')).toBeDisplayed()
  await expect($('[data-testid="github-login-pat-button"]')).toBeDisplayed()
  await expect($('[data-testid="github-device-flow-card"]')).not.toBeDisplayed()
})

When(/^I search settings for "([^"]*)"$/, async (query: string) => {
  const input = $('[data-testid="settings-search"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(query)
})

Then(/^the "([^"]*)" settings tab is shown$/, async (section: string) => {
  await $(`[data-testid="settings-tab-${section}"]`).waitForDisplayed({ timeout: 10000 })
})

// The search filter removes non-matching tabs from the DOM entirely rather than hiding them
// (SettingsPage.tsx's nav is built from the filtered list), so "not shown" means "not there".
Then(/^the "([^"]*)" settings tab is not shown$/, async (section: string) => {
  await expect($(`[data-testid="settings-tab-${section}"]`)).not.toBeExisting()
})

Then(/^the sponsor button is shown$/, async () => {
  await $('[data-testid="support-sponsor-button"]').waitForDisplayed({ timeout: 10000 })
})

// "Unreleased" is always present (CHANGELOG.md's own convention, see ChangelogSection.tsx) —
// asserting its testid rather than a specific version number keeps this stable across releases.
Then(/^the changelog shows at least one release entry$/, async () => {
  await $('[data-testid="changelog-entry-Unreleased"]').waitForDisplayed({ timeout: 10000 })
})
