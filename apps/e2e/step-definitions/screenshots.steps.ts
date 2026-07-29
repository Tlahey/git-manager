import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'

// Marketing captures land in the repo docs, not in __visual__: they are meant
// to be committed and embedded (README, landing page), not pixel-compared.
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots')

/**
 * Merges `patch` into the persisted settings. A partial seed is safe: the
 * store's rehydration merge (mergeSettingsWithDefaults in settings.store.ts)
 * fills every missing group with defaults. Takes effect on the next load — the
 * repo-open step reloads right after, which is why these Givens come first.
 */
async function seedSettings(patch: Record<string, unknown>): Promise<void> {
  await browser.execute((raw: string) => {
    const key = 'git-manager-settings'
    const stored = window.localStorage.getItem(key)
    const data = stored ? JSON.parse(stored) : { state: {}, version: 0 }
    data.state = data.state ?? {}
    data.state.settings = { ...(data.state.settings ?? {}), ...JSON.parse(raw) }
    window.localStorage.setItem(key, JSON.stringify(data))
  }, JSON.stringify(patch))
}

// Captures ship in the (English) README and documentation site, but the app
// defaults to 'fr'.
Given(/^the app language is English$/, async () => {
  await seedSettings({ language: 'en' })
})

// AI is on by default and points at a local Ollama that isn't running here, so
// the app raises a persistent "Ollama is unreachable" banner across the top of
// every screen — a detail of this machine, not of the feature being pictured.
// Turning the feature off removes the banner rather than hiding it, so the
// capture shows a state a user could actually be in.
Given(/^AI features are turned off$/, async () => {
  await seedSettings({ ai: { enabled: false } })
})

When(/^the interface has settled$/, async () => {
  await stabiliseForSnapshot()
  // Let avatars, the graph layout pass and any pending SWR fetches paint.
  await browser.pause(1200)
})

When(/^I select the newest commit in the graph$/, async () => {
  const row = $('[data-testid^="graph-row-"]')
  await row.waitForDisplayed({ timeout: 10000 })
  await row.click()
})

Then(/^a full-window screenshot is saved as "([^"]*)"$/, async (name: string) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  await browser.saveScreenshot(join(SHOT_DIR, `${name}.png`))
})
