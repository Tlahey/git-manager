import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'
import { seedSettings } from '../support/settings.js'

// W3C WebDriver key value for Meta (Command on macOS), U+E03D — same pattern as
// command-palette.steps.ts / undo-redo.steps.ts.
const META = String.fromCharCode(0xe03d)

// Marketing captures land in the repo docs, not in __visual__: they are meant
// to be committed and embedded (README, landing page), not pixel-compared.
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots')

// Captures ship in the (English) README and documentation site, but the app
// defaults to 'fr'.
Given(/^the app language is English$/, async () => {
  await seedSettings({ language: 'en' })
})

// The suite-wide Before hook (hooks.steps.ts) already points the default AI settings at a fake
// server that answers, so a capture doesn't need this step just to silence the
// "AI provider is unreachable" banner — this is for captures that specifically want the AI
// menu/buttons absent, showing the app as a user with the feature genuinely turned off would see
// it.
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

// ⌘F over the plain graph — the floating panel that steps through matches (`CommitSearchPanel`),
// not the sidebar's tree filter (⌥⌘F) or the AI-powered search panel (⇧⌘F).
When(/^I open the commit search panel$/, async () => {
  await browser.keys([META, 'f'])
  await $('[data-testid="commit-search-panel"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I search the commit graph for "([^"]*)"$/, async (query: string) => {
  const input = $('[data-testid="commit-search-panel-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(query)
})

// `commit-search-count` renders `<active>/<total>` once the query is non-empty (CommitSearchPanel).
Then(/^the commit search shows "([^"]*)"$/, async (label: string) => {
  await expect($('[data-testid="commit-search-count"]')).toHaveText(label)
})

When(/^I go to the next commit search match$/, async () => {
  await $('[data-testid="commit-search-next"]').click()
})

Then(/^a full-window screenshot is saved as "([^"]*)"$/, async (name: string) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  await browser.saveScreenshot(join(SHOT_DIR, `${name}.png`))
})

// The zone variant: crops the capture to one element, for pages documenting a single piece of
// the chrome (the tab bar, the toolbar, the footer) where a full window would bury the subject.
// The docs generator recognises this step too (apps/docs/scripts/lib/parseDocFeatures.ts) — the
// captured name becomes the page's illustration exactly like the full-window step's.
//
// The crop is done here, with `sips` (macOS-native, and this suite is macOS-only like the
// embedded provider itself): this WebKit driver has no element-screenshot endpoint —
// `element.saveScreenshot()` silently answers with the full window, and even the visual
// service's `saveElement` stores the full window on this provider (its element handling happens
// at compare time, not capture time). Measured: both produced 3200×2000 for a 36px-tall tab bar.
Then(
  /^a screenshot of the "([^"]*)" area is saved as "([^"]*)"$/,
  async (testid: string, name: string) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const el = $(`[data-testid="${testid}"]`)
    await el.waitForDisplayed({ timeout: 10000 })
    const rect = await browser.execute((id: string) => {
      const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect()
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        dpr: window.devicePixelRatio,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      }
    }, testid)
    const target = join(SHOT_DIR, `${name}.png`)
    await browser.saveScreenshot(target)
    // Clamp to the viewport in device pixels, keeping one spare pixel on each axis: sips
    // *silently* refuses a crop whose offset + size reaches the image edge exactly (measured —
    // 1936+64 on a 2000px image is a no-op with exit code 0, 1935+64 crops fine), which is
    // precisely where an edge-flush element like the footer lands.
    const imgW = Math.floor(rect.viewportW * rect.dpr)
    const imgH = Math.floor(rect.viewportH * rect.dpr)
    const w = Math.min(Math.round(rect.w * rect.dpr), imgW)
    const h = Math.min(Math.round(rect.h * rect.dpr), imgH)
    let x = Math.max(0, Math.floor(rect.x * rect.dpr))
    let y = Math.max(0, Math.floor(rect.y * rect.dpr))
    // Only a NON-ZERO offset triggers the quirk (offset 0 + full size crops fine), so shift the
    // window up/left by the pixel rather than shrinking the capture.
    if (x > 0 && x + w >= imgW) x = Math.max(0, imgW - w - 1)
    if (y > 0 && y + h >= imgH) y = Math.max(0, imgH - h - 1)
    execFileSync('sips', [
      '--cropToHeightWidth',
      String(h),
      String(w),
      '--cropOffset',
      String(y),
      String(x),
      target,
    ])
  }
)
