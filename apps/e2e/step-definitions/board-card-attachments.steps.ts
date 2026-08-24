import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { browser, $, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo.js'
import { switchToRawMarkdown, storedCardTitledOrThrow } from '../support/board.js'
import { clickViaJs } from '../support/interactions.js'

const TIMEOUT = 15000

// A minimal valid 1x1 red PNG, base64-encoded — small enough to inline, real enough for
// `save_board_attachment`'s content-addressing (`git2::Oid::hash_object`) to accept as bytes.
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/**
 * Builds a real `File` from the inlined PNG bytes inside the page, wraps it in a `DataTransfer`,
 * and dispatches a `drop` `DragEvent` carrying it — the same technique `commit-reorder.steps.ts`
 * proved for the commit-row drag (a constructed `DataTransfer` shared with a real `DragEvent`),
 * applied here to a file drop instead of an internal drag. `AttachmentTextarea.tsx`'s `onDrop`
 * reads `e.dataTransfer.files` directly, so this is enough to trigger the real `attach()` → real
 * `save_board_attachment` round trip end to end — no IPC mock involved. Enters edit mode and saves
 * the same way `I give the card the description "…"` does (`board-cards.steps.ts`), since the
 * description starts as rendered markdown, not an editable field.
 */
When(/^I drop an image onto the card description$/, async () => {
  await clickViaJs('card-description-display')
  await switchToRawMarkdown('card-description-input')
  const field = $('[data-testid="card-description-input"]')
  await field.waitForDisplayed({ timeout: TIMEOUT })
  await browser.execute(
    (testId: string, base64: string, fileName: string) => {
      const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null
      if (!el) throw new Error(`no element with data-testid="${testId}"`)
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const file = new File([bytes], fileName, { type: 'image/png' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      const fire = (type: string) =>
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }))
      fire('dragover')
      fire('drop')
    },
    'card-description-input',
    ONE_PIXEL_PNG_BASE64,
    'screenshot.png'
  )
  await browser.waitUntil(
    async () => {
      const value = await field.getValue()
      return /!\[[^\]]*\]\(.*\.git-manager\/attachments\/.*\.png\)/.test(value)
    },
    {
      timeout: TIMEOUT,
      timeoutMsg: 'the description field never gained an attachment markdown link',
    }
  )
  await $('[data-testid="card-description-save"]').click()
  await $('[data-testid="card-description-display"]').waitForDisplayed({ timeout: TIMEOUT })
})

Then(/^the card "([^"]*)" description references an attached image$/, async (title: string) => {
  await browser.waitUntil(
    () => {
      const card = storedCardTitledOrThrow(title)
      return /!\[[^\]]*\]\(.*\.git-manager\/attachments\/.*\.png\)/.test(card.description)
    },
    { timeout: TIMEOUT, timeoutMsg: `the stored card "${title}" never gained an attachment link` }
  )
})

Then(/^the attached image for "([^"]*)" exists in the repository$/, async (title: string) => {
  const repoPath = getActiveRepoPath()
  const card = storedCardTitledOrThrow(title)
  const match = card.description.match(/\((\.git-manager\/attachments\/[^)]+\.png)\)/)
  expect(match).not.toBeNull()
  const relativePath = match![1]
  expect(existsSync(join(repoPath, relativePath))).toBe(true)
})
