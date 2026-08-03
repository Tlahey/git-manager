import { join } from 'node:path'
import { $, browser } from '@wdio/globals'
import { Then } from '@wdio/cucumber-framework'

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
  await browser.waitUntil(
    async () => (await pill.getAttribute('data-state')) === 'connected',
    { timeout: 10000, timeoutMsg: 'the footer AI pill never reported the provider as connected' }
  )
})
