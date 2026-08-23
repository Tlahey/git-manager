import { browser, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// Same Radix dropdown quirk every other toolbar menu in this suite works around (see
// patch-workspace.steps.ts / bisect.steps.ts): this WKWebView provider only reacts to a real
// pointerdown+pointerup sequence to open a `DropdownMenu.Trigger`, not a plain WDIO `.click()`.
// Duplicated locally rather than shared, matching this suite's existing per-file convention.
async function openDropdown(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`openDropdown: no element with data-testid="${id}"`)
    const opts = {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerType: 'mouse',
      isPrimary: true,
    }
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    el.dispatchEvent(new PointerEvent('pointerup', opts))
  }, testid)
}

async function clickViaJs(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`clickViaJs: no element with data-testid="${id}"`)
    el.click()
  }, testid)
}

When(/^I open the AI commit search panel$/, async () => {
  await $('[data-testid="toolbar-ai-button"]').waitForDisplayed({ timeout: 10000 })
  await openDropdown('toolbar-ai-button')
  const item = $('[data-testid="ai-menu-commit-search"]')
  await item.waitForDisplayed({ timeout: 10000 })
  await clickViaJs('ai-menu-commit-search')
  await $('[data-testid="ai-commit-search-panel"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I turn on quick commit search$/, async () => {
  await clickViaJs('commit-search-quick')
})

When(/^I ask the commit search "([^"]*)"$/, async (question: string) => {
  const input = $('[data-testid="commit-search-question"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(question)
  const submit = $('[data-testid="commit-search-submit"]')
  await submit.waitForEnabled({ timeout: 10000 })
  await submit.click()
})

Then(/^the commit search cites the commit "([^"]*)"$/, async (subject: string) => {
  const matches = $('[data-testid="commit-search-matches"]')
  await matches.waitForDisplayed({ timeout: 20000 })
  await browser.waitUntil(async () => (await matches.getText()).includes(subject), {
    timeout: 20000,
    timeoutMsg: `commit search matches never cited "${subject}"`,
  })
})

Then(/^the commit search shows the quick-mode badge$/, async () => {
  await $('[data-testid="commit-search-quick-badge"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the commit search shows the asked question "([^"]*)"$/, async (question: string) => {
  const asked = $('[data-testid="commit-search-asked"]')
  await browser.waitUntil(
    async () => (await asked.isExisting()) && (await asked.getText()).includes(question),
    {
      timeout: 10000,
      timeoutMsg: `the commit search panel never showed the question "${question}"`,
    }
  )
})

/** The history row (CommitSearchHistoryList.tsx) whose text includes `question` — ids are minted
 *  per run, so a row is found by its visible question rather than by a testid known ahead of time.
 *  Every OTHER testid this component renders also starts with "commit-search-history-" (the clear
 *  button, the empty state, each row's own remove button), so those are excluded explicitly. */
async function findHistoryRowId(question: string): Promise<string> {
  const testId = await browser.execute((wanted: string) => {
    const rows = Array.from(
      document.querySelectorAll('[data-testid^="commit-search-history-"]')
    ).filter((el) => {
      const id = el.getAttribute('data-testid') ?? ''
      return (
        id !== 'commit-search-history-clear' &&
        id !== 'commit-search-history-empty' &&
        !id.startsWith('commit-search-history-remove-')
      )
    })
    const hit = rows.find((el) => (el.textContent ?? '').includes(wanted))
    return hit ? hit.getAttribute('data-testid') : null
  }, question)
  if (!testId) throw new Error(`no commit search history entry matches "${question}"`)
  return testId.replace('commit-search-history-', '')
}

When(/^I reopen the commit search history entry "([^"]*)"$/, async (question: string) => {
  const id = await findHistoryRowId(question)
  // The row's own unlabelled "open" button is the first `<button>` inside it, ahead of the
  // labelled remove button (CommitSearchHistoryList.tsx's JSX order).
  await $(`[data-testid="commit-search-history-${id}"] button`).click()
})

When(/^I remove the commit search history entry "([^"]*)"$/, async (question: string) => {
  const id = await findHistoryRowId(question)
  await $(`[data-testid="commit-search-history-remove-${id}"]`).click()
})

Then(/^the commit search history does not list "([^"]*)"$/, async (question: string) => {
  await browser.waitUntil(
    async () => {
      const testId = await browser.execute((wanted: string) => {
        const rows = Array.from(
          document.querySelectorAll('[data-testid^="commit-search-history-"]')
        ).filter((el) => {
          const id = el.getAttribute('data-testid') ?? ''
          return (
            id !== 'commit-search-history-clear' &&
            id !== 'commit-search-history-empty' &&
            !id.startsWith('commit-search-history-remove-')
          )
        })
        return rows.some((el) => (el.textContent ?? '').includes(wanted))
      }, question)
      return !testId
    },
    { timeout: 10000, timeoutMsg: `"${question}" is still listed in the commit search history` }
  )
})

When(/^I clear the commit search history$/, async () => {
  await $('[data-testid="commit-search-history-clear"]').click()
})

Then(/^the commit search history is empty$/, async () => {
  await $('[data-testid="commit-search-history-empty"]').waitForDisplayed({ timeout: 10000 })
})
