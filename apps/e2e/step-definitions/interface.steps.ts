import { join } from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { Then, When } from '@wdio/cucumber-framework'

const FIXTURE_ROOT = '/tmp/git-manager-fixtures'

// Assertions for interface-overview.feature — each documents one fixed chrome zone, so each
// asserts something real about that zone before its area screenshot is taken (a page whose only
// "test" is the capture would go stale the day the zone breaks without anyone noticing).

Then(/^the tab bar shows a tab for the "([^"]*)" repository$/, async (fixtureName: string) => {
  // Repo tabs carry their full path in the testid (TabBar.tsx).
  const tab = $(`[data-testid="tab-repo-${join(FIXTURE_ROOT, fixtureName)}"]`)
  await tab.waitForDisplayed({ timeout: 10000 })
})

Then(/^the toolbar offers the fetch, pull and push actions$/, async () => {
  for (const action of ['fetch', 'pull', 'push']) {
    await $(`[data-testid="toolbar-${action}-button"]`).waitForDisplayed({ timeout: 10000 })
  }
})

Then(/^the footer reports the AI provider status$/, async () => {
  const pill = $('[data-testid="footer-ai-status"]')
  await pill.waitForDisplayed({ timeout: 10000 })
  // Not just "the pill exists": by the time a screenshot is worth taking, the liveness check must
  // have concluded (the suite's baseline points at the always-up fake server, so 'connected' is
  // the only stable answer here — 'checking' in a capture would be a race, not a state).
  await browser.waitUntil(async () => (await pill.getAttribute('data-state')) === 'connected', {
    timeout: 10000,
    timeoutMsg: 'the footer AI pill never reported the provider as connected',
  })
})

// The Run split button only mounts once the active repo has at least one task configured (see
// RunButton.tsx) — its appearance IS the assertion that a saved task reached the toolbar.
Then(/^the toolbar shows the Launch button$/, async () => {
  await $('[data-testid="toolbar-run-button"]').waitForDisplayed({ timeout: 10000 })
})

// Radix dropdown triggers open on pointerdown, not click (see the rebase editor's squash menu and
// COVERAGE.md's worktree gotcha) — dispatch the full pointer sequence, re-dispatching until a menu
// item actually exists.
When(/^I open the toolbar Launch menu$/, async () => {
  await $('[data-testid="toolbar-run-button-menu"]').waitForDisplayed({ timeout: 10000 })
  await browser.waitUntil(
    async () => {
      const open = () => browser.execute(() => !!document.querySelector('[role="menuitem"]'))
      if (await open()) return true
      await browser.execute(() => {
        const el = document.querySelector('[data-testid="toolbar-run-button-menu"]')
        if (!el) throw new Error('no toolbar-run-button-menu trigger')
        for (const type of ['pointerdown', 'pointerup', 'click']) {
          el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0 }))
        }
      })
      return open()
    },
    { timeout: 15000, interval: 1000, timeoutMsg: 'the toolbar Launch menu never opened' }
  )
})

// Task ids are generated, so the menu item is matched by its visible label rather than testid.
Then(/^the toolbar Launch menu lists the task "([^"]*)"$/, async (name: string) => {
  const item = $(`//div[@role="menuitem"][contains(., "${name}")]`)
  await item.waitForDisplayed({ timeout: 10000 })
})

When(/^I open the keyboard shortcuts panel$/, async () => {
  await $('[data-testid="footer-shortcuts-button"]').click()
  await $('[data-testid="shortcuts-search-input"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I search the shortcuts panel for "([^"]*)"$/, async (query: string) => {
  await $('[data-testid="shortcuts-search-input"]').setValue(query)
})

// Individual shortcut rows carry no testid of their own — the dialog's own text is asserted
// against instead, the same way `Footer.tsx`'s `filteredShortcuts` narrows the whole list.
Then(/^the shortcuts panel shows the shortcut "([^"]*)"$/, async (description: string) => {
  await expect($('[role="dialog"]')).toHaveText(description, { containing: true })
})

Then(/^the shortcuts panel does not show the shortcut "([^"]*)"$/, async (description: string) => {
  const text = await $('[role="dialog"]').getText()
  expect(text).not.toContain(description)
})
