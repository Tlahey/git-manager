import { browser, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// Same Radix dropdown quirk every other toolbar menu in this suite works around (see
// patch-workspace.steps.ts / bisect.steps.ts): this WKWebView provider only reacts to a real
// pointerdown+pointerup sequence to open a `DropdownMenu.Trigger`, not a plain WDIO `.click()`.
// Duplicated locally rather than shared, matching this suite's existing per-file convention.
async function openDropdown(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`openDropdown: no element with data-testid="${id}"`)
    const opts = {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerType: 'mouse',
      isPrimary: true,
    }
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

When(/^I open the AI commit search panel$/, async () => {
  await $('[data-testid="toolbar-ai-button"]').waitForDisplayed({ timeout: 10000 })
  await openDropdown('toolbar-ai-button')
  const item = $('[data-testid="ai-menu-commit-search"]')
  await item.waitForDisplayed({ timeout: 10000 })
  await clickViaJs('ai-menu-commit-search')
  await $('[data-testid="ai-commit-search-panel"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I ask the commit search "([^"]*)"$/, async (question: string) => {
  const input = $('[data-testid="commit-search-question"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(question)
  const submit = $('[data-testid="commit-search-submit"]')
  await submit.waitForEnabled({ timeout: 10000 })
  await submit.click()
})

Then(/^the commit search cites the commit "([^"]*)"$/, async (subject: string) => {
  const matches = $('[data-testid="commit-search-matches"]')
  await matches.waitForDisplayed({ timeout: 20000 })
  await browser.waitUntil(async () => (await matches.getText()).includes(subject), {
    timeout: 20000,
    timeoutMsg: `commit search matches never cited "${subject}"`,
  })
})
