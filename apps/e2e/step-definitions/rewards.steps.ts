import { appendFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { waitForRecordedCard } from '../support/notchRecording'

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

/**
 * The unlock reached the notch, carrying the trophy it is about.
 *
 * Read from the queue recording rather than from the card itself: the celebration renders in a
 * second `WebviewWindow` this provider handles badly, and the suite's baseline deliberately never
 * lets one paint (see `support/notchRecording.ts`). What is asserted here is everything up to that
 * boundary — a real commit through the app, a real rule firing in the rewards engine, and a real
 * reward card, with its medal and its XP, reaching the queue every surface reads from.
 */
Then(/^the notch celebrates the achievement "([^"]*)"$/, async (title: string) => {
  const card = await waitForRecordedCard(
    (recorded) => recorded.kind === 'reward',
    'no reward card ever reached the notch queue'
  )
  expect(card.title).toBe(title)
  // The medal and the XP are the two things that make this a celebration rather than a notice; a
  // card that arrived without them would still pass a title-only assertion.
  expect(card.tier).toBeTruthy()
  expect(card.badge).toContain('XP')
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
    {
      timeout: 10000,
      timeoutMsg: '__e2eRepoUIStore never became available to switch to the rewards tab',
    }
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

/**
 * The 14 `terminal_keyword` achievements watch a real shell history file, not the app's own
 * integrated terminal — `checkTerminalHistory()` in game.store.ts polls `get_terminal_commands`,
 * which reads `$HOME/.zsh_history`/`.bash_history` (see `TerminalKeywordRule.ts`,
 * `lib/rewards/terminalHistory.ts`). The suite runs under an isolated `$HOME`
 * (`isolatedAppState.ts`), so writing there cannot touch a developer's real shell history.
 *
 * Crediting a command requires two *separate* reads of the file: the first read of a history file
 * always baselines it silently (see `terminalHistory.ts`'s module doc — otherwise opening the
 * Rewards tab would hand out trophies for commands typed weeks earlier), and only a line appended
 * after that baseline is reported as a `terminal_command` event. So this always writes one
 * unrelated line first, waits for the poll that already runs on tab-mount to observe it, and only
 * then appends the real command line.
 */
const zshHistoryFile = join(homedir(), '.zsh_history')

Given(/^the shell history already holds an unrelated git command$/, async () => {
  writeFileSync(zshHistoryFile, 'git log --e2e-history-baseline\n')
})

// `checkTerminalHistory()` fires once, immediately, on RewardsTab mount — this waits for that
// first read (rather than a fixed sleep) by reading the same persisted snapshot the poll writes to.
Then(/^the shell-history baseline has been read$/, async () => {
  await browser.waitUntil(
    () =>
      browser.execute(() => {
        const raw = window.localStorage.getItem('git-manager-game-store')
        if (!raw) return false
        const snapshot = JSON.parse(raw)?.state?.terminalHistorySnapshot
        return Array.isArray(snapshot?.['.zsh_history'])
      }),
    { timeout: 10000, timeoutMsg: 'the shell-history baseline was never read' }
  )
})

When(/^I run "([^"]*)" in the shell$/, async (command: string) => {
  appendFileSync(zshHistoryFile, `${command}\n`)
})
