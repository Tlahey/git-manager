import { execFileSync } from 'node:child_process'
import { browser, expect } from '@wdio/globals'
import { Given, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'

/**
 * Asserting on a hook's card, without touching the window it renders in.
 *
 * Two things make the obvious approach wrong. The card renders in a second `WebviewWindow`, and
 * this provider handles a real second window badly enough — a click inside it throws, and the
 * command issued after one self-closes fails with "no such window" — that asserting there would
 * test the harness more than the app. And `queue.current` is *transient*: `useNotchQueue` retires
 * the card as soon as the notch window closes, and immediately if that window never opened at
 * all, so a poll can legitimately arrive after the only card the scenario cares about has already
 * gone.
 *
 * So the queue is recorded instead — a subscription installed from the test side, appending every
 * card the store makes current. Nothing about the app changes for it, and by the time a card is
 * recorded a real hook has already run, refused, produced a real `AppError::HookFailed`, crossed
 * IPC and been parsed by `hookFailureFrom`. The window boundary is the one part this stops short
 * of.
 */
interface RecordedCard {
  id: string
  tone?: string
  eyebrow?: string
  outputLines?: string[]
}

/**
 * Must run *after* the fixture-open step, which reloads the page and would wipe the subscription.
 */
Given(/^the notch queue is being recorded$/, async () => {
  const installed = await browser.execute(() => {
    const store = (
      window as unknown as {
        __e2eNotchQueueStore?: {
          getState: () => { clear: () => void }
          subscribe: (listener: (state: { queue: { current: { model: unknown } | null } }) => void) => void
        }
      }
    ).__e2eNotchQueueStore
    if (!store) return false

    // The app window is shared across every feature in the run, so a card left over from an
    // earlier scenario would otherwise be indistinguishable from this one's.
    store.getState().clear()

    const log: unknown[] = []
    ;(window as unknown as { __e2eNotchLog: unknown[] }).__e2eNotchLog = log
    store.subscribe((state) => {
      const model = state.queue.current?.model as { id: string } | undefined
      if (!model) return
      const last = log[log.length - 1] as { id: string } | undefined
      // A live card re-enqueues its own id on every tick; only its arrival is interesting here.
      if (last?.id !== model.id) log.push(model)
    })
    return true
  })

  if (!installed) {
    throw new Error(
      'the notch queue store is not exposed — the app must be built with VITE_E2E=true (pnpm build:e2e)'
    )
  }
})

function recordedCards(): Promise<RecordedCard[]> {
  return browser.execute(
    () => (window as unknown as { __e2eNotchLog?: unknown[] }).__e2eNotchLog ?? []
  ) as Promise<RecordedCard[]>
}

async function firstErrorCard(): Promise<RecordedCard | undefined> {
  return (await recordedCards()).find((card) => card.tone === 'error')
}

function headSubject(): string {
  return execFileSync('git', ['-C', getActiveRepoPath(), 'log', '-1', '--pretty=%s'], {
    encoding: 'utf8',
  }).trim()
}

/**
 * The commit did NOT happen.
 *
 * A "still the same" assertion has to earn its keep: reading HEAD once, straight away, would pass
 * just as well against a commit that simply had not landed yet. So the subject is held steady for
 * a stretch that comfortably outlasts a real commit round trip, and the step fails the moment it
 * moves.
 */
Then(/^the repository HEAD commit subject remains "([^"]*)"$/, async (expected: string) => {
  const deadline = Date.now() + 4000
  while (Date.now() < deadline) {
    const subject = headSubject()
    if (subject !== expected) {
      throw new Error(
        `HEAD moved to "${subject}" — the commit was expected to be refused by a hook`
      )
    }
    await browser.pause(250)
  }
})

Then(/^the notch shows the "([^"]*)" hook's output$/, async (hookName: string) => {
  await browser.waitUntil(async () => (await firstErrorCard()) !== undefined, {
    timeout: 15000,
    timeoutMsg: `no error card ever reached the notch queue (recorded: ${JSON.stringify(
      await recordedCards()
    )})`,
  })

  const card = await firstErrorCard()
  // The eyebrow carries the hook's name through i18n; asserting it *contains* the name keeps this
  // independent of the surrounding copy and of the active language.
  expect(card?.eyebrow).toContain(hookName)
  // A card with no output is the failure mode this feature exists to prevent: "a hook refused"
  // tells the user nothing they can act on.
  expect(card?.outputLines?.length ?? 0).toBeGreaterThan(0)
})

Then(/^the notch output mentions "([^"]*)"$/, async (needle: string) => {
  const card = await firstErrorCard()
  expect((card?.outputLines ?? []).join('\n')).toContain(needle)
})

Then(/^the notch raises no hook failure$/, async () => {
  // The HEAD assertion precedes this one and only passes once the commit has landed, so anything
  // the hooks were going to raise has already had its chance.
  expect(await firstErrorCard()).toBeUndefined()
})
