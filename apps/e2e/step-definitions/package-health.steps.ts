import { browser, $ } from '@wdio/globals'
import { When } from '@wdio/cucumber-framework'

// Same Radix dropdown quirk patch-workspace.steps.ts and bisect.steps.ts already work around for
// this ToolsMenu: this WKWebView provider only reacts to a real pointerdown+pointerup sequence,
// not a plain WDIO `.click()`, to open the menu. Duplicated locally rather than shared, matching
// this suite's existing per-file convention.
async function openDropdown(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`openDropdown: no element with data-testid="${id}"`)
    const opts = { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true }
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    el.dispatchEvent(new PointerEvent('pointerup', opts))
  }, testid)
}

async function clickViaJs(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`clickViaJs: no element with data-testid="${id}"`)
    el.click()
  }, testid)
}

When(/^I run a health check from the tools menu$/, async () => {
  await $('[data-testid="toolbar-tools-button"]').waitForDisplayed({ timeout: 10000 })
  await openDropdown('toolbar-tools-button')
  const item = $('[data-testid="tools-menu-health"]')
  await item.waitForDisplayed({ timeout: 10000 })
  await clickViaJs('tools-menu-health')
  // The report is a filesystem-only read (no network), but wait for it to actually
  // paint rather than the loading spinner before anything downstream (a screenshot,
  // an assertion) looks at the panel.
  await $('[data-testid="health-report-overview"]').waitForDisplayed({ timeout: 10000 })
})
