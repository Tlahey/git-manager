import { browser, expect, $ } from '@wdio/globals'
import { Given, Then } from '@wdio/cucumber-framework'

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
