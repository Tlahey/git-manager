import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'
import { seedSettings } from '../support/settings.js'

// Marketing captures land in the repo docs, not in __visual__: they are meant
// to be committed and embedded (README, landing page), not pixel-compared.
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots')

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
