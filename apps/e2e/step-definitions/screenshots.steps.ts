import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'

// Marketing captures land in the repo docs, not in __visual__: they are meant
// to be committed and embedded (README, landing page), not pixel-compared.
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots')

// Marketing captures ship in the (English) README, but the app defaults to
// 'fr'. A partial settings seed is safe: the store's rehydration merge
// (mergeSettingsWithDefaults in settings.store.ts) fills every missing group
// with defaults. The repo-open step reloads right after, applying it.
Given(/^the app language is English$/, async () => {
  await browser.execute(() => {
    const key = 'git-manager-settings'
    const raw = window.localStorage.getItem(key)
    const data = raw ? JSON.parse(raw) : { state: {}, version: 0 }
    data.state = data.state ?? {}
    data.state.settings = { ...(data.state.settings ?? {}), language: 'en' }
    window.localStorage.setItem(key, JSON.stringify(data))
  })
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
