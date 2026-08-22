import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { browser, expect, $ } from '@wdio/globals'
import { After, Given, When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'
import { clickViaJs } from '../support/interactions.js'
import { navigateAndSettle } from '../support/navigation.js'
import { seedSettings } from '../support/settings.js'

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
  await browser
    .waitUntil(
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
    )
    .catch(async (e) => {
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

When(/^I set the auto-fetch interval to "([^"]*)" minutes$/, async (minutes: string) => {
  await fillControlledInput('settings-auto-fetch-interval', minutes)
})

Then(/^the auto-fetch interval is "([^"]*)" minutes$/, async (minutes: string) => {
  await expect($('[data-testid="settings-auto-fetch-interval"]')).toHaveValue(minutes)
})

When(/^I turn off automatic pruning on auto-fetch$/, async () => {
  await clickViaJs('settings-auto-prune')
})

Then(/^automatic pruning on auto-fetch is off$/, async () => {
  const checkbox = $('[data-testid="settings-auto-prune"]')
  await expect(checkbox).not.toBeChecked()
})

const LANGUAGE_CODES: Record<string, string> = { English: 'en', French: 'fr', Spanish: 'es' }

// WDIO's own `selectByAttribute` picks the right <option> in the WebView but, on this WKWebView
// driver, doesn't reliably raise a 'change' event React's synthetic listener picks up — same fix
// as ai-pr-description.steps.ts's/activity-log.steps.ts's own `setNativeSelectValue`.
async function setNativeSelectValue(testid: string, value: string) {
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

// The dropdown calls `i18next.changeLanguage` directly (GeneralSection.tsx) rather than going
// through a store subscription, so this is the ONE thing in the running app that a settings-store
// reset (the suite's per-scenario baseline) does not undo — a scenario that switches language must
// switch back to English itself before it ends, or every scenario after it in this shared window
// inherits the wrong copy.
When(/^I select "(English|French|Spanish)" as the interface language$/, async (label: string) => {
  await setNativeSelectValue('language-select', LANGUAGE_CODES[label])
})

Then(/^the interface language label reads "([^"]*)"$/, async (text: string) => {
  await expect($('[data-testid="setting-language"]')).toHaveText(text, { containing: true })
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

When(/^I click the AI context window check button$/, async () => {
  const button = $('[data-testid="ai-context-check-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// The suite-wide fake AI server (`fakeAiServer.ts`) answers `/v1/models` with a
// `max_model_len` for `fake-model` — the one signal a non-Ollama provider can give
// (`ai_model_info.rs`'s `served_max_model_len`); `/api/show`/`/api/ps` 404 against it, which
// `ai_model_info.rs` treats as "nothing to report" rather than a failure.
Then(
  /^the context window check reports that the model serves (\d+) tokens$/,
  async (served: string) => {
    const result = $('[data-testid="ai-context-check-result"]')
    await result.waitForDisplayed({ timeout: 15000 })
    await expect(result).toHaveText(served, { containing: true })
  }
)

When(/^I apply the suggested context window$/, async () => {
  await $('[data-testid="ai-context-apply-button"]').click()
})

Then(/^the context window setting is "([^"]*)"$/, async (value: string) => {
  await expect($('[data-testid="ai-context-tokens-input"]')).toHaveValue(value)
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
    {
      timeout: 10000,
      timeoutMsg: `document.documentElement's data-theme never became "${themeId}"`,
    }
  )
})

// A native `<input type="color">` takes neither `setValue` nor a plain assignment reliably on
// this driver — same workaround as every other controlled input this suite writes through the
// prototype's setter (the board card's due-date input, the summary panel's day input): its value
// is always a lowercase 7-char hex string per the HTML spec, which is what makes the literal in
// the feature file also the value read back below.
async function setColorInput(testid: string, hex: string) {
  await $(`[data-testid="${testid}"]`).waitForExist({ timeout: 10000 })
  await browser.execute(
    (id: string, value: string) => {
      const input = document.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null
      if (!input) throw new Error(`the "${id}" color input is not on screen`)
      // A direct property-setter write triggers no focus event, so — unlike a real click — nothing
      // scrolls the settings panel to it on its own; without this a doc screenshot taken right
      // after would still show whatever was on screen before this step ran.
      input.scrollIntoView({ block: 'center' })
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    testid,
    hex
  )
}

When(/^I set the terminal background color to "([^"]*)"$/, async (hex: string) => {
  await setColorInput('appearance-terminal-bg', hex)
})

When(/^I set the terminal foreground color to "([^"]*)"$/, async (hex: string) => {
  await setColorInput('appearance-terminal-fg', hex)
})

Then(/^the terminal background color is "([^"]*)"$/, async (hex: string) => {
  await expect($('[data-testid="appearance-terminal-bg"]')).toHaveValue(hex)
})

Then(/^the terminal foreground color is "([^"]*)"$/, async (hex: string) => {
  await expect($('[data-testid="appearance-terminal-fg"]')).toHaveValue(hex)
})

When(/^I reset the terminal colors$/, async () => {
  await $('[data-testid="appearance-terminal-reset"]').click()
})

/**
 * Picks an application icon.
 *
 * `app-icon-card-<id>` is the `<label>`; the radio it labels is `sr-only`, so the label is the
 * clickable surface — same shape as the row-height radios above, and the same reason the click goes
 * through the page: this provider refuses a click on a control it reads as not displayed, and a
 * label's own `click()` forwards to its input exactly as a user's would.
 */
When(/^I select the "([^"]*)" application icon$/, async (iconId: string) => {
  await clickViaJs(`app-icon-card-${iconId}`)
})

// The radio's checked state, not the card's ring: the ring is a class, and a class can be applied by
// a render that the store never agreed to.
Then(/^the "([^"]*)" application icon is selected$/, async (iconId: string) => {
  await browser.waitUntil(
    async () =>
      browser.execute((id: string) => {
        const radio = document.querySelector(
          `[data-testid="app-icon-radio-${id}"]`
        ) as HTMLInputElement | null
        return Boolean(radio?.checked)
      }, iconId),
    { timeout: 10000, timeoutMsg: `the "${iconId}" application icon never became the selected one` }
  )
})

// A single theme card's own swatch — not the whole grid (COVERAGE.md's "Skipped on purpose" note
// on why a full appearance snapshot isn't reproducible: which OTHER cards show up depends on
// unlocked achievements + custom themes dropped in ~/.git-manager/themes/ on the test machine).
// "dark" is never achievement-gated, so this specific card is always present and stable.
Then(
  /^the "([^"]*)" theme card matches the visual snapshot "([^"]*)"$/,
  async (themeId: string, tag: string) => {
    const card = $(`[data-testid="theme-card-${themeId}"]`)
    await card.waitForDisplayed({ timeout: 10000 })
    await stabiliseForSnapshot()
    await expect(card).toMatchElementSnapshot(tag, 1)
  }
)

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

When(/^I click the login-with-PAT button$/, async () => {
  const button = $('[data-testid="github-login-pat-button"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
})

When(/^I enter the PAT "([^"]*)"$/, async (token: string) => {
  await $('[data-testid="github-pat-input"]').setValue(token)
})

When(/^I submit the PAT$/, async () => {
  await $('[data-testid="github-pat-submit-button"]').click()
})

// This hits the REAL github_connect_token command against api.github.com — same precedent as the
// device-code request above: an invalid token deterministically fails GitHub's own auth check, so
// no local mock or real account is needed to observe the rejection.
Then(/^a GitHub connection error is shown$/, async () => {
  const alert = $('[data-testid="github-error-message"]')
  await alert.waitForDisplayed({ timeout: 15000 })
  expect((await alert.getText()).trim().length).toBeGreaterThan(0)
})

When(/^I go back to the GitHub login options$/, async () => {
  await $('[data-testid="github-back-to-choice-button"]').click()
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

// ─── User themes ──────────────────────────────────────────────────────────────

/** Themes written by a scenario, removed afterwards so the machine keeps only its own. */
const createdUserThemes: string[] = []

/**
 * Any `.css` file under `~/.git-manager/themes` is a theme, named after the file (`themes.rs`
 * derives both id and label from the stem). Written straight to disk rather than through the app,
 * because dropping a file in a folder *is* the feature — there is no in-app editor to drive.
 *
 * The file is removed after the scenario (see the `@settings` After hook below) so a developer's
 * own themes folder is left as it was found.
 */
Given(/^a user theme file named "([^"]*)" exists$/, async (id: string) => {
  const dir = join(homedir(), '.git-manager', 'themes')
  mkdirSync(dir, { recursive: true })
  // Plain variables: the backend wraps them in the `[data-theme="<id>"]` selector itself.
  writeFileSync(join(dir, `${id}.css`), '--background: #0b1020;\n--foreground: #e6edf3;\n', 'utf8')
  createdUserThemes.push(join(dir, `${id}.css`))
})

Then(/^the theme "([^"]*)" is offered$/, async (id: string) => {
  await $(`[data-testid="theme-card-${id}"]`).waitForDisplayed({ timeout: 15000 })
})

After({ tags: '@settings' }, () => {
  for (const file of createdUserThemes.splice(0)) {
    rmSync(file, { force: true })
  }
})

When(/^I start adding a repository task$/, async () => {
  const add = $('[data-testid="run-tasks-add"]')
  await add.waitForClickable({ timeout: 15000 })
  await add.click()
})

/**
 * The command field suggests what `get_project_commands` read from the repository's own
 * `package.json` — so this asserts the fixture's real file reached the UI, not merely that an
 * autocomplete rendered. Each option carries its script name in its testid
 * (`CommandAutocomplete`), which keeps the assertion independent of how the row is labelled.
 */
Then(/^the task command suggestions include "([^"]*)"$/, async (name: string) => {
  const input = $('[data-testid="run-tasks-command"]')
  await input.waitForDisplayed({ timeout: 15000 })
  await input.click()
  await $(`[data-testid="run-tasks-command-option-${name}"]`).waitForDisplayed({ timeout: 10000 })
})

/** The two editing inputs' current values, for failure messages — the save button only renders
 *  once both are non-empty (RunTasksSetting's `canSave`), so "save never appeared" always means
 *  one of these stayed blank. */
async function taskRowProbe(): Promise<string> {
  return browser.execute(() => {
    const read = (id: string) =>
      (document.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null)?.value ?? null
    return JSON.stringify({
      name: read('run-tasks-name'),
      command: read('run-tasks-command'),
      saveRendered: !!document.querySelector('[data-testid="run-tasks-save"]'),
    })
  })
}

// Both fields are controlled React inputs: set them through the native value setter and fire an
// `input` event so React's onChange sees the value (same shape as the rebase reword textarea —
// WebDriver's setValue proved unreliable against this WebKit build here).
async function fillControlledInput(testid: string, value: string) {
  await $(`[data-testid="${testid}"]`).waitForDisplayed({ timeout: 10000 })
  await browser.execute(
    (id: string, v: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLInputElement | null
      if (!el) throw new Error(`no input with data-testid="${id}"`)
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    testid,
    value
  )
}

// The editor command lives in the `git` group, the terminal one in `externalTools` (see
// ExternalToolsSection) — both are replaced whole so the capture shows the pristine "Select…"
// state whatever the machine running the suite has configured. Neither group is in the suite
// baseline, so without this a locally-picked editor would leak into the screenshot.
Given(/^no external tools are configured$/, async () => {
  await seedSettings({ externalTools: {}, git: {} })
})

When(/^I name the repository task "([^"]*)"$/, async (name: string) => {
  await fillControlledInput('run-tasks-name', name)
})

// Clicks a suggestion in the command autocomplete. The option commits on mousedown — before the
// input's blur can close the list (see CommandAutocomplete) — and the outcome (the command field
// carrying the suggestion's command) is verified rather than trusting one click.
When(/^I pick the task command suggestion "([^"]*)"$/, async (name: string) => {
  const input = $('[data-testid="run-tasks-command"]')
  await input.waitForDisplayed({ timeout: 10000 })
  try {
    await browser.waitUntil(
      async () => {
        const filled = async () =>
          browser.execute(
            () =>
              ((document.querySelector('[data-testid="run-tasks-command"]') as HTMLInputElement)
                ?.value ?? '') !== ''
          )
        if (await filled()) return true
        await input.click()
        const option = $(`[data-testid="run-tasks-command-option-${name}"]`)
        await option.waitForDisplayed({ timeout: 5000 })
        // A native click on the option lands without effect on this WebKit build (verified via the
        // probe: the field stays empty). The handler commits on mousedown, so dispatch that
        // directly — same remedy as the rebase editor's clickViaJs.
        await browser.execute((n: string) => {
          const el = document.querySelector(`[data-testid="run-tasks-command-option-${n}"]`)
          if (!el) throw new Error(`suggestion option "${n}" vanished before the dispatch`)
          el.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
          )
        }, name)
        return filled()
      },
      {
        timeout: 15000,
        interval: 1000,
        timeoutMsg: 'the suggestion never filled the command field',
      }
    )
  } catch (err) {
    throw new Error(`${(err as Error).message}\n[probe] ${await taskRowProbe()}`)
  }
})

When(/^I save the repository task$/, async () => {
  const save = $('[data-testid="run-tasks-save"]')
  try {
    await save.waitForClickable({ timeout: 10000 })
  } catch (err) {
    throw new Error(`${(err as Error).message}\n[probe] ${await taskRowProbe()}`)
  }
  await save.click()
})

// This scenario only ever has one saved task, so a plain `$(...)` lookup is enough — unlike the
// default-task scenario below, which needs to tell rows apart by name.
When(/^I edit the repository task$/, async () => {
  const edit = $('[data-testid="run-tasks-edit"]')
  await edit.waitForClickable({ timeout: 10000 })
  await edit.click()
})

Then(/^the repository task "([^"]*)" is saved$/, async (name: string) => {
  await expect($('[data-testid="run-tasks-name-value"]')).toHaveText(name)
})

When(/^I delete the repository task$/, async () => {
  const del = $('[data-testid="run-tasks-delete"]')
  await del.waitForClickable({ timeout: 10000 })
  await del.click()
})

Then(/^the repository has no saved tasks$/, async () => {
  await expect($('[data-testid="run-tasks-empty"]')).toBeDisplayed()
})

// Rows are matched by their committed name rather than position — `run-tasks-default`/
// `run-tasks-name-value` testids repeat once a second task exists, so a plain `$(...)` lookup
// would always hit the first row.
When(/^I set the repository task "([^"]*)" as the default$/, async (name: string) => {
  await browser.execute((taskName: string) => {
    const row = Array.from(document.querySelectorAll('[data-testid="run-tasks-row"]')).find(
      (r) => r.querySelector('[data-testid="run-tasks-name-value"]')?.textContent === taskName
    )
    if (!row) throw new Error(`no run task row named "${taskName}"`)
    const star = row.querySelector('[data-testid="run-tasks-default"]') as HTMLElement | null
    if (!star) throw new Error(`row "${taskName}" has no default star button`)
    star.click()
  }, name)
})

Then(/^the repository task "([^"]*)" is the default$/, async (name: string) => {
  const isDefault = await browser.execute((taskName: string) => {
    const row = Array.from(document.querySelectorAll('[data-testid="run-tasks-row"]')).find(
      (r) => r.querySelector('[data-testid="run-tasks-name-value"]')?.textContent === taskName
    )
    return row?.querySelector('[data-testid="run-tasks-default"]')?.getAttribute('aria-pressed')
  }, name)
  expect(isDefault).toBe('true')
})

// `RunButton`'s primary click's aria-label/tooltip carries the default task's own name
// (`toolbar.runTask`), so reading it back proves which task actually launches, not just which
// row's star is lit.
Then(
  /^the toolbar Launch button's primary action runs the task "([^"]*)"$/,
  async (name: string) => {
    const button = $('[data-testid="toolbar-run-button-primary"]')
    await button.waitForDisplayed({ timeout: 10000 })
    const label = await button.getAttribute('aria-label')
    expect(label).toContain(name)
  }
)

Then(/^the external tools section offers editor and terminal pickers$/, async () => {
  for (const id of ['externalEditor-select', 'externalTerminal-select']) {
    await $(`[data-testid="${id}"]`).waitForDisplayed({ timeout: 10000 })
  }
})

When(/^I go back from the settings$/, async () => {
  const back = $('[data-testid="settings-back"]')
  await back.waitForClickable({ timeout: 10000 })
  await back.click()
  await $('[data-testid="settings-page"]').waitForDisplayed({ timeout: 10000, reverse: true })
})

// The GitLab and Bitbucket steps that used to live here went with their scenarios: both providers
// are built but not listed (see `AVAILABLE_PROVIDERS` in IntegrationSection.tsx), so there is
// nothing on screen to drive. `git log` has them when the panels come back.

/**
 * A patch file written to disk by "Create patch". Read as text and checked for a real diff header,
 * so an empty file (or a path the app never wrote to) fails rather than passing on existence.
 */
Then(/^the patch file "([^"]*)" holds a diff$/, async (fileName: string) => {
  const target = join(tmpdir(), fileName)
  await browser.waitUntil(() => existsSync(target), {
    timeout: 15000,
    timeoutMsg: `expected a patch file at ${target}`,
  })
  const content = readFileSync(target, 'utf8')
  if (!content.includes('diff --git')) {
    throw new Error(`${target} exists but holds no diff (${content.length} bytes)`)
  }
  rmSync(target, { force: true })
})

When(/^I choose "([^"]*)" in the save dialog$/, async (fileName: string) => {
  const dialog = $('[data-testid="e2e-folder-picker-dialog"]')
  await dialog.waitForDisplayed({ timeout: 15000 })
  await $('[data-testid="e2e-folder-picker-input"]').setValue(join(tmpdir(), fileName))
  await $('[data-testid="e2e-folder-picker-confirm"]').click()
})
