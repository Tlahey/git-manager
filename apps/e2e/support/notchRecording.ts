import { browser } from '@wdio/globals'

/**
 * Reading the cards a scenario's notifications produced, without touching the window they render
 * in.
 *
 * Two things make the obvious approach wrong. A card renders in a second `WebviewWindow`, and this
 * provider handles a real second window badly enough — a click inside it throws, and the command
 * issued after one self-closes fails with "no such window" — that asserting there would test the
 * harness more than the app. And `queue.current` is *transient*: `useNotchQueue` retires the card
 * as soon as the notch window closes, and immediately if that window never opened at all, so a
 * poll can legitimately arrive after the only card the scenario cares about has already gone.
 *
 * So the queue is recorded instead — a subscription installed from the test side by the
 * "the notch queue is being recorded" step (`git-hooks.steps.ts`), appending every card the store
 * makes current. Nothing about the app changes for it; the window boundary is the one part this
 * stops short of.
 *
 * Shared rather than restated per feature: the hook scenarios read error and progress cards, the
 * rewards scenarios read a reward card, and the window-switch recovery below is exactly the kind
 * of thing that would be fixed in one copy and not the other.
 */
export interface RecordedCard {
  id: string
  kind?: string
  tone?: string
  eyebrow?: string
  title?: string
  tier?: string
  badge?: string
  outputLines?: string[]
}

export async function recordedNotchCards(): Promise<RecordedCard[]> {
  const read = () =>
    browser.execute(
      () => (window as unknown as { __e2eNotchLog?: unknown[] }).__e2eNotchLog ?? []
    ) as Promise<RecordedCard[]>
  try {
    return await read()
  } catch {
    // A scenario that records cards runs with notifications re-enabled, so a real notch window can
    // open and close on its own timer mid-scenario. The service's per-command window switch can
    // leave the session parked on that window at the moment it self-closes — the next command then
    // throws "no such window" even though the recording lives in the main window all along.
    // Re-anchor on `main` and read again rather than letting one dying window fail the assertion.
    const handles = await browser.getWindowHandles()
    if (handles.includes('main')) await browser.switchToWindow('main')
    return await read()
  }
}

/** Waits for a card matching `match` to have been recorded, and returns it. */
export async function waitForRecordedCard(
  match: (card: RecordedCard) => boolean,
  describe: string,
  timeout = 15000
): Promise<RecordedCard> {
  let found: RecordedCard | undefined
  await browser.waitUntil(
    async () => {
      found = (await recordedNotchCards()).find(match)
      return found !== undefined
    },
    {
      timeout,
      timeoutMsg: `${describe} — recorded: ${JSON.stringify(await recordedNotchCards())}`,
    }
  )
  return found!
}
