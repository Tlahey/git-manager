import { execFileSync } from 'node:child_process'
import { $, browser, expect } from '@wdio/globals'
import { After, Given, Then, When } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'
import { recordedNotchCards, type RecordedCard } from '../support/notchRecording'

/**
 * Asserting on a hook's card, without touching the window it renders in.
 *
 * The reading side — and why it is a recording rather than a poll — lives in
 * `support/notchRecording.ts`, shared with the rewards scenarios. What is specific here is what a
 * recorded card proves: by the time one shows up, a real hook has run, refused, produced a real
 * `AppError::HookFailed`, crossed IPC and been parsed by `hookFailureFrom`. The window boundary is
 * the one part this stops short of.
 *
 * The step that installs the recording is defined below and used by other features too, so it is
 * deliberately worded about the queue rather than about hooks.
 */

/**
 * Must run *after* the fixture-open step, which reloads the page and would wipe the subscription.
 */
Given(/^the notch queue is being recorded$/, async () => {
  const installed = await browser.execute(() => {
    // The suite-wide baseline (hooks.steps.ts) disables notifications so no scenario opens the
    // notch window by accident — but some producers check that setting before enqueuing at all
    // (useNotchOperation's `enabled`), and these scenarios exist to see real hook cards reach the
    // queue. Re-enable delivery for this scenario only; the next scenario's Before re-disables it.
    const settingsStore = (
      window as unknown as {
        __e2eSettingsStore?: {
          getState: () => {
            settings: { notifications?: Record<string, unknown> }
            updateSettings: (partial: Record<string, unknown>) => void
          }
        }
      }
    ).__e2eSettingsStore
    if (settingsStore) {
      const current = settingsStore.getState().settings.notifications ?? {}
      settingsStore.getState().updateSettings({ notifications: { ...current, enabled: true } })
    }
    // …but force the display surface to nothing (an e2e-only seam in useNotchQueue.ts,
    // VITE_E2E-gated): these scenarios assert cards reaching the QUEUE, and actually painting
    // them costs a real second WebviewWindow the driver mishandles ("no such window" mid-poll)
    // — or, when that window can't open, a REAL macOS banner via the native fallback. The whole
    // production chain (hook run, AppError, IPC, parse, enqueue) stays real; only the final
    // paint is skipped. The suite baseline clears this flag between scenarios.
    ;(window as unknown as { __e2eNotificationSurface?: string }).__e2eNotificationSurface = 'none'

    const store = (
      window as unknown as {
        __e2eNotchQueueStore?: {
          getState: () => { clear: () => void }
          subscribe: (
            listener: (state: { queue: { current: { model: unknown } | null } }) => void
          ) => void
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

async function firstErrorCard(): Promise<RecordedCard | undefined> {
  return (await recordedNotchCards()).find((card) => card.tone === 'error')
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
      await recordedNotchCards()
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

Then(/^the notch reported the "([^"]*)" hook running$/, async (hookName: string) => {
  // The whole chain, end to end: the Rust side noticing a real hook process start, the event
  // crossing IPC, the store, and a live card reaching the queue. Asserted from the recording
  // rather than by polling, because this card is deliberately short-lived — it exists for exactly
  // as long as the hook does, and a fast fixture hook is gone in milliseconds.
  const cards = await recordedNotchCards()
  const running = cards.find((card) => card.tone === 'running')
  if (!running) {
    throw new Error(`no running-hook card was recorded (got: ${JSON.stringify(cards)})`)
  }
  expect(running.eyebrow).toContain(hookName)
})

/**
 * Opens the caret beside Commit, where the "without hooks" escape hatch lives.
 *
 * Through a dispatched `pointerdown` rather than `click()`: Radix's dropdown trigger opens on
 * pointerdown, and this provider's `click()` does not produce one — measured, the trigger stayed
 * at `aria-expanded="false"` and the menu never appeared, which showed up as a screenshot of a
 * closed menu rather than as a failure.
 */
When(/^I open the commit options$/, async () => {
  const caret = $('[data-testid="commit-menu-btn"]')
  await caret.waitForEnabled({ timeout: 10000 })
  await browser.execute(() => {
    const trigger = document.querySelector('[data-testid="commit-menu-btn"]')
    trigger?.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerType: 'mouse',
      })
    )
  })
})

/**
 * Waits for the menu's *contents*, which is also what makes the screenshot deterministic — an
 * earlier version waited for the caret it had just clicked, so the capture raced the menu open and
 * usually won.
 */
/**
 * Waits for the menu's *contents*, which is also what makes the screenshot deterministic — an
 * earlier version waited for the caret it had just clicked, so the capture raced the menu open and
 * usually won.
 */
Then(/^the commit options offer to skip the hooks$/, async () => {
  await browser.waitUntil(
    async () => browser.execute(() => document.body.innerText.includes('without running hooks')),
    { timeout: 5000, timeoutMsg: 'the commit options menu never offered to skip the hooks' }
  )
})

/**
 * Retires whatever card a scenario left up, and puts the driver back on the main window.
 *
 * These are the only scenarios in the suite that raise a notch card, and the card is a second OS
 * window that closes on its own timer. Left to do that, it closes *during the next scenario* —
 * invalidating the driver's window mid-command, which surfaces at that scenario's fixture-open
 * step as "no such window" and reads as a broken fixture. Clearing the queue here closes it now,
 * deterministically, while nothing else is in flight.
 */
After({ tags: '@hooks' }, async () => {
  try {
    const handles = await browser.getWindowHandles()
    if (handles.includes('main')) await browser.switchToWindow('main')

    await browser.execute(() => {
      const store = (
        window as unknown as { __e2eNotchQueueStore?: { getState: () => { clear: () => void } } }
      ).__e2eNotchQueueStore
      store?.getState().clear()
    })

    await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 1, {
      timeout: 5000,
      timeoutMsg: 'the notch window was still open when the scenario ended',
    })
  } catch {
    // A cleanup that cannot run is not worth failing a scenario that otherwise passed.
  }
})
