import { browser, $, expect } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'

// Without this, `savedFilters` (and `snoozed`) keep accumulating across separate test runs on the
// same machine — zustand's persist middleware writes real localStorage, which this suite doesn't
// otherwise wipe between invocations. Same pattern as rewards.steps.ts's "the game progress is
// reset".
Given(/^the launchpad state is reset$/, async () => {
  await browser.execute(() => {
    localStorage.removeItem('git-manager-launchpad')
  })
})

When(/^I follow the pull request at "([^"]*)"$/, async (url: string) => {
  await $('[data-testid="launchpad-follow-pr-button"]').click()
  await $('[data-testid="follow-pr-url-input"]').setValue(url)
  await $('[data-testid="follow-pr-confirm-button"]').click()
})

Then(
  /^the "([^"]*)" launchpad tab shows the followed pull request "([^"]*)"$/,
  async (tabId: string, url: string) => {
    await expect($(`[data-testid="launchpad-tab-${tabId}"]`)).toHaveElementClass('border-primary')
    await $(`[data-testid="pr-row-followed-${url}"]`).waitForDisplayed({ timeout: 10000 })
  }
)

When(
  /^I snooze the pull request "([^"]*)" for "([^"]*)"$/,
  async (prId: string, duration: string) => {
    await $(`[data-testid="snooze-trigger-${prId}"]`).click()
    await $(`[data-testid="snooze-preset-${duration}-${prId}"]`).click()
  }
)

When(
  /^I create a saved filter named "([^"]*)" that matches PRs needing my review$/,
  async (name: string) => {
    await $('[data-testid="launchpad-new-filter-button"]').click()
    await $('[data-testid="filter-editor-name-input"]').setValue(name)
    await $('[data-testid="filter-editor-needs-review-yes"]').click()
    await $('[data-testid="filter-editor-save-button"]').click()
  }
)

Then(/^the "([^"]*)" saved filter is shown$/, async (name: string) => {
  await $(`[data-testid="saved-filter-${name}"]`).waitForDisplayed({ timeout: 10000 })
})

// Same stamped-navigation reload as launchpad-prs.steps.ts's "I open the launchpad" (the launchpad
// has nothing else to trigger a reload for) — needed here specifically to prove `savedFilters`
// survived a real reload rather than just living in React state that a re-render wouldn't catch.
When(/^I reload the launchpad$/, async () => {
  const stamp = `launchpad-reload-${Date.now()}`
  const origin = await browser.execute(() => window.location.origin)
  await browser.url(`${origin}/?${stamp}=1`)
  await browser.waitUntil(
    async () => await browser.execute((s: string) => window.location.search.includes(s), stamp),
    { timeout: 10000, timeoutMsg: `The reload stamped "${stamp}" never committed` }
  )
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
