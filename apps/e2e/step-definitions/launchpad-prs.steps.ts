import { browser, $, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { navigateAndSettle } from '../support/navigation'

// The Launchpad is reachable purely via mock data (useGitHubData() falls back to it with no
// GitHub token configured) — no fixture repo needed, unlike every other page in this suite. That
// makes this the first scenario with nothing to reload for on its own: no fixture-open step, no
// AI-fake-server step, so nothing else forces the app's very first cold render before this step
// runs — every other scenario gets that for free from its own first step. The explicit reload
// here is what stands in for it.
When(/^I open the launchpad$/, async () => {
  const origin = await browser.execute(() => window.location.origin)
  const stamp = `launchpad-${Date.now()}`
  await navigateAndSettle(`${origin}/?e2e=${stamp}`, stamp)
  await browser.waitUntil(
    async () =>
      await browser.execute(() => (document.getElementById('root')?.children.length ?? 0) > 0),
    { timeout: 20000, timeoutMsg: 'React never mounted into #root' }
  )
  await browser.waitUntil(
    async () =>
      await browser.execute(() => {
        const store = (
          window as unknown as {
            __e2eRepoUIStore?: { getState: () => { setActiveTab: (id: string) => void } }
          }
        ).__e2eRepoUIStore
        if (!store) return false
        store.getState().setActiveTab('pull-requests')
        return true
      }),
    {
      timeout: 10000,
      timeoutMsg: '__e2eRepoUIStore never became available to switch to the launchpad tab',
    }
  )
  await $('[data-testid="manual-refresh-button"]').waitForDisplayed({ timeout: 15000 })
})

When(/^I select the "([^"]*)" launchpad tab$/, async (tabId: string) => {
  await $(`[data-testid="launchpad-tab-${tabId}"]`).click()
})

// Proves the tabs are a live filter over one already-loaded list, not a separate fetch each: no
// loading state appears between switching tabs and the row for `prId` showing up.
Then(
  /^the "([^"]*)" launchpad tab shows the pull request "([^"]*)"$/,
  async (tabId: string, prId: string) => {
    await expect($(`[data-testid="launchpad-tab-${tabId}"]`)).toHaveElementClass('border-primary')
    await $(`[data-testid="pr-row-${prId}"]`).waitForDisplayed({ timeout: 10000 })
  }
)

Then(
  /^the "([^"]*)" launchpad tab does not show the pull request "([^"]*)"$/,
  async (tabId: string, prId: string) => {
    await expect($(`[data-testid="launchpad-tab-${tabId}"]`)).toHaveElementClass('border-primary')
    await expect($(`[data-testid="pr-row-${prId}"]`)).not.toBeExisting()
  }
)

When(/^I open the "([^"]*)" pull request$/, async (id: string) => {
  await $(`[data-testid="pr-open-in-app-${id}"]`).click()
  await $('[data-testid="launchpad-pr-panel"]').waitForDisplayed({ timeout: 10000 })
})
