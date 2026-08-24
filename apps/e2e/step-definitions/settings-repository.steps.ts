import { $, browser, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// WDIO's own `selectByAttribute` picks the right <option> in the WebView but, on this WKWebView
// driver, doesn't reliably raise a 'change' event React's synthetic listener picks up — same
// issue and same fix as ai-pr-description.steps.ts's `setNativeSelectValue`.
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

When(/^I open the "([^"]*)" repository settings tab$/, async (section: string) => {
  const tab = $(`[data-testid="settings-local-tab-${section}"]`)
  await tab.waitForDisplayed({ timeout: 10000 })
  await tab.click()
})

When(/^I add "([^"]*)" to the repository's protected branches$/, async (branch: string) => {
  const input = $('[data-testid="repo-protected-branches-tags-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(branch)
  await browser.keys('Enter')
})

Then(/^the repository's protected branches include "([^"]*)"$/, async (branch: string) => {
  const wrapper = $('[data-testid="repo-protected-branches-tags"]')
  await wrapper.waitForDisplayed({ timeout: 10000 })
  await expect(wrapper).toHaveText(branch, { containing: true })
})

When(/^I override the repository's theme$/, async () => {
  const button = $('[data-testid="repo-override-theme-override"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
})

When(/^I select the repository theme "([^"]*)"$/, async (themeId: string) => {
  await $('[data-testid="repo-theme-select"]').waitForDisplayed({ timeout: 10000 })
  await setNativeSelectValue('repo-theme-select', themeId)
})

Then(/^the repository theme override is "([^"]*)"$/, async (themeId: string) => {
  await expect($('[data-testid="repo-theme-select"]')).toHaveValue(themeId)
})

Then(/^the global theme setting shows as overridden$/, async () => {
  await $('[data-testid="overridden-badge-theme"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I override the repository's commit instructions$/, async () => {
  const button = $('[data-testid="repo-override-commitInstructions-override"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await button.click()
})

// A <textarea>, not the <input> `repo-theme-select`/protected-branches steps above deal with —
// same native-setter-plus-event fix as settings.steps.ts's `fillControlledTextarea`.
When(/^I set the repository commit instructions to "([^"]*)"$/, async (text: string) => {
  const input = $('[data-testid="repo-commit-instructions"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await browser.execute((value: string) => {
    const el = document.querySelector(
      '[data-testid="repo-commit-instructions"]'
    ) as HTMLTextAreaElement | null
    if (!el) throw new Error('repo-commit-instructions textarea disappeared')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, text)
})

Then(/^the repository commit instructions override is "([^"]*)"$/, async (text: string) => {
  await expect($('[data-testid="repo-commit-instructions"]')).toHaveValue(text)
})

Then(/^the global commit instructions setting shows as overridden$/, async () => {
  await $('[data-testid="overridden-badge-commitInstructions"]').waitForDisplayed({
    timeout: 10000,
  })
})

When(/^I start adding a worktree default file$/, async () => {
  const add = $('[data-testid="worktree-df-add"]')
  await add.waitForClickable({ timeout: 15000 })
  await add.click()
})

// A controlled input (WorktreeDefaultFilesSetting) — set through the native value setter and fire
// an `input` event so React's onChange sees it, same as settings.steps.ts's `fillControlledInput`.
// The save (check) icon only renders once `useDefaultFileMatchCounts`' debounced backend lookup
// reports at least one match, so the caller must wait for it rather than clicking immediately.
When(/^I set the default file pattern to "([^"]*)"$/, async (pattern: string) => {
  const input = $('[data-testid="worktree-df-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await browser.execute((v: string) => {
    const el = document.querySelector('[data-testid="worktree-df-input"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, pattern)
})

When(/^I save the worktree default file$/, async () => {
  const save = $('[data-testid="worktree-df-save"]')
  await save.waitForClickable({ timeout: 15000 })
  await save.click()
})

// Only one line exists at the point this scenario edits it, so a plain `$(...)` lookup is enough —
// unlike the delete step below, which has to tell rows apart once more than one exists.
When(/^I edit the worktree default file$/, async () => {
  const edit = $('[data-testid="worktree-df-edit"]')
  await edit.waitForClickable({ timeout: 10000 })
  await edit.click()
})

Then(/^the worktree default files list includes "([^"]*)"$/, async (pattern: string) => {
  const wrapper = $('[data-testid="worktree-df-list"]')
  await wrapper.waitForDisplayed({ timeout: 10000 })
  await expect(wrapper).toHaveText(pattern, { containing: true })
})

// Rows are matched by their committed pattern rather than position, the same reasoning as
// settings.steps.ts's run-task rows: `worktree-df-delete`/`worktree-df-value` testids repeat once
// more than one line exists.
When(/^I delete the worktree default file "([^"]*)"$/, async (pattern: string) => {
  await browser.execute((value: string) => {
    const row = Array.from(document.querySelectorAll('[data-testid="worktree-df-row"]')).find(
      (r) => r.querySelector('[data-testid="worktree-df-value"]')?.textContent === value
    )
    if (!row) throw new Error(`no worktree default-file row with pattern "${value}"`)
    const del = row.querySelector('[data-testid="worktree-df-delete"]') as HTMLElement | null
    if (!del) throw new Error(`row "${value}" has no delete button`)
    del.click()
  }, pattern)
})

Then(/^the worktree default files list is empty$/, async () => {
  await $('[data-testid="worktree-df-empty"]').waitForDisplayed({ timeout: 10000 })
})
