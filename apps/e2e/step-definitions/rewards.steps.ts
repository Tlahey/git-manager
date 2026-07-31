import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'

// Achievements persist in `git-manager-game-store` (zustand persist) across the whole session,
// like a real user profile — this suite's many prior commits (across every feature/run) may have
// already unlocked "commit_1" long before this scenario runs. Clearing the key falls back to
// game.store.ts's INITIAL_ACHIEVEMENTS (all unlocked: false) on the next mount, same pattern as
// repo.steps.ts seeding `git-manager-repos-ui` — this doesn't reload by itself; the very next
// Background step ("fixture repository is opened") does its own reload, which is what actually
// picks the cleared state up.
Given(/^the game progress is reset$/, async () => {
  await browser.execute(() => {
    localStorage.removeItem('git-manager-game-store')
  })
})

Then(/^the trophy toast shows the achievement "([^"]*)"$/, async (title: string) => {
  const toast = $('[data-testid="trophy-toast"]')
  await toast.waitForDisplayed({ timeout: 10000 })
  const text = await toast.getText()
  expect(text).toContain(title)
})

// The Rewards tab (TabBar.tsx's `PinnedTab`) carries no testid to click, so this switches through
// the same real store bridge the dashboard tab already relies on (daily-summary.steps.ts) rather
// than adding one just for a single e2e click.
When(/^I open the rewards tab$/, async () => {
  await browser.waitUntil(
    async () =>
      await browser.execute(() => {
        const store = (
          window as unknown as {
            __e2eRepoUIStore?: { getState: () => { setActiveTab: (id: string) => void } }
          }
        ).__e2eRepoUIStore
        if (!store) return false
        store.getState().setActiveTab('rewards')
        return true
      }),
    { timeout: 10000, timeoutMsg: '__e2eRepoUIStore never became available to switch to the rewards tab' }
  )
  await $('[data-testid="rewards-tab-container"]').waitForDisplayed({ timeout: 10000 })
})

// "Earned on" only renders when `item.unlockedAt` is set (RewardsTab.tsx) — a real unlocked-state
// signal already in the DOM, rather than inferring it from styling.
Then(/^the "([^"]*)" achievement is shown as unlocked$/, async (id: string) => {
  const card = $(`[data-testid="achievement-card-${id}"]`)
  await card.waitForDisplayed({ timeout: 10000 })
  await expect(card).toHaveText('Earned on', { containing: true })
})
