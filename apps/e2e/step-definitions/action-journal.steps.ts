import { browser, $ } from '@wdio/globals'
import { When, Then, After } from '@wdio/cucumber-framework'
import { navigateAndSettle } from '../support/navigation'

// This feature navigates the one shared app window to the journal route in place — same choice
// merge.steps.ts makes for its read-only "open and view" scenarios, and for the same reason: the
// journal renders straight off `?window=actions` (main.tsx), independent of the repoUI store, and
// nothing here closes the window the way resolving a conflict does. So there is no need to drive
// the real second-WebviewWindow flow the footer button triggers in production; every feature after
// this one just needs the shared window handed back on the main route, which this hook does.
After({ tags: '@action-journal' }, async () => {
  const origin = await browser.execute(() => window.location.origin)
  // Settled + stamped (support/navigation.ts): the next feature's first element command must not
  // race the swap, or the service's window probe burns its silent 30s direct-eval timeout.
  const stamp = `journal-home-${Date.now()}`
  await navigateAndSettle(`${origin}/?e2e=${stamp}`, stamp)
})

When(/^I open the action journal$/, async () => {
  // The frontend batches activity-log entries and flushes them to disk on a 2s timer
  // (activityLogPersistence.ts's FLUSH_DELAY_MS) rather than writing on every action. A real
  // second WebviewWindow (the footer button's actual flow) leaves the main window's JS context —
  // and that pending timer — alive in the background while the journal is read. Navigating this
  // *shared* window away in place, the way this feature does for simplicity, tears that context
  // down instead and would silently drop whatever hadn't flushed yet, so the just-performed
  // action would never reach the on-disk log the journal reads. Waiting out the flush delay first
  // is what a real second-window flow gets for free.
  await browser.pause(2500)
  const origin = await browser.execute(() => window.location.origin)
  await navigateAndSettle(`${origin}/?window=actions`, 'window=actions')
  await $('[data-testid="action-journal-window"]').waitForDisplayed({ timeout: 15000 })
})

When(/^I filter the action journal for "([^"]*)"$/, async (text: string) => {
  const input = $('[data-testid="action-journal-filter"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(text)
})

// The filter is expected to narrow to exactly one row — the action just performed, found by a
// distinctive marker in its own commit message rather than by list position, since the on-disk
// activity log this window reads is process-wide and accumulates across every scenario/run that
// has ever exercised this same e2e app bundle.
When(/^I open the filtered action$/, async () => {
  const count = await browser.execute(
    () => document.querySelectorAll('[data-testid^="action-row-"]').length
  )
  if (count !== 1) {
    throw new Error(`Expected exactly one filtered action row, found ${count}`)
  }
  await $('[data-testid^="action-row-"]').click()
  await $('[data-testid="action-detail-panel"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I click the copy-commands button$/, async () => {
  await $('[data-testid="action-copy-commands"]').click()
})

// `handleCopy` only calls `setCopied(true)` after `navigator.clipboard.writeText` itself resolves
// (`ActionDetailPanel.tsx`), so this proves the write actually succeeded rather than just that the
// button was clicked — reading the OS clipboard back isn't attempted here, the same boundary
// terminal.steps.ts's own note draws around this WebKit build's clipboard support.
Then(/^the copy-commands button confirms the copy$/, async () => {
  await browser.waitUntil(
    async () =>
      browser.execute(() => {
        const button = document.querySelector('[data-testid="action-copy-commands"]')
        return button?.querySelector('.text-tone-success') !== null
      }),
    { timeout: 5000, timeoutMsg: 'the copy button never showed its confirmation state' }
  )
})

When(/^I click the explain-action button$/, async () => {
  const button = $('[data-testid="action-explain"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the action explanation shows a finished explanation$/, async () => {
  await $('[data-testid="action-explain-forget"]').waitForDisplayed({ timeout: 20000 })
})
