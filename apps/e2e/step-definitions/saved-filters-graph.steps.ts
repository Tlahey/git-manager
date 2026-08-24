import { browser, $, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

const TIMEOUT = 15000

/** `issue-filter-actions-<id>` rows, in DOM order — the label is read from its own
 * `.flex-1.truncate` span rather than the whole row's text, which also carries the toggle chevron
 * and the trailing count and would make e.g. "Blocked" match inside "Blocked work". */
async function filterRows(): Promise<{ id: string; label: string }[]> {
  return browser.execute(() => {
    const buttons = Array.from(
      document.querySelectorAll('[data-testid^="issue-filter-actions-"]')
    ) as HTMLElement[]
    return buttons.map((btn) => ({
      id: btn.dataset.testid!.replace('issue-filter-actions-', ''),
      label: (btn.parentElement?.querySelector('span.flex-1.truncate')?.textContent ?? '').trim(),
    }))
  })
}

async function filterIdNamed(name: string): Promise<string> {
  const rows = await filterRows()
  const row = rows.find((r) => r.label === name)
  if (!row) {
    throw new Error(`no saved issue filter labelled "${name}" — rows: ${JSON.stringify(rows)}`)
  }
  return row.id
}

When(
  /^I create a saved issue filter named "([^"]*)" with the query "([^"]*)"$/,
  async (name: string, query: string) => {
    await $('[data-testid="issue-filter-add-button"]').click()
    await $('[data-testid="saved-filter-dialog"]').waitForDisplayed({ timeout: TIMEOUT })
    await $('[data-testid="saved-filter-name-input"]').setValue(name)
    await $('[data-testid="saved-filter-query-input"]').setValue(query)
    const confirm = $('[data-testid="saved-filter-confirm-button"]')
    await confirm.waitForEnabled({ timeout: TIMEOUT })
    await confirm.click()
    await $('[data-testid="saved-filter-dialog"]').waitForExist({ reverse: true, timeout: TIMEOUT })
  }
)

Then(/^the sidebar shows a saved issue filter named "([^"]*)"$/, async (name: string) => {
  await browser.waitUntil(async () => (await filterRows()).some((r) => r.label === name), {
    timeout: TIMEOUT,
    timeoutMsg: `no saved issue filter named "${name}" appeared`,
  })
})

Then(/^the sidebar does not show a saved issue filter named "([^"]*)"$/, async (name: string) => {
  await browser.waitUntil(async () => !(await filterRows()).some((r) => r.label === name), {
    timeout: TIMEOUT,
    timeoutMsg: `a saved issue filter named "${name}" is still shown`,
  })
})

// The menu that would normally reach `updateFilter`/`removeFilter`/`moveFilter` is a real native
// OS menu (`useSavedFilterMenu.ts` → `showNativeMenu`) — undrivable by WebDriver. This calls the
// same store action directly, via the `window.__e2eIssueFiltersStore` bridge `main.tsx` exposes for
// exactly this class of problem, then asserts the sidebar reacts the way a real click would have.
When(
  /^I rename the saved issue filter "([^"]*)" to "([^"]*)"$/,
  async (from: string, to: string) => {
    const id = await filterIdNamed(from)
    await browser.execute(
      (filterId: string, name: string) => {
        const store = (
          window as unknown as {
            __e2eIssueFiltersStore?: {
              getState: () => { updateFilter: (id: string, patch: { name: string }) => void }
            }
          }
        ).__e2eIssueFiltersStore
        if (!store) throw new Error('__e2eIssueFiltersStore is not exposed on window')
        store.getState().updateFilter(filterId, { name })
      },
      id,
      to
    )
  }
)

When(
  /^I move the saved issue filter "([^"]*)" (up|down)$/,
  async (name: string, direction: string) => {
    const id = await filterIdNamed(name)
    await browser.execute(
      (filterId: string, dir: string) => {
        const store = (
          window as unknown as {
            __e2eIssueFiltersStore?: {
              getState: () => { moveFilter: (id: string, direction: 'up' | 'down') => void }
            }
          }
        ).__e2eIssueFiltersStore
        if (!store) throw new Error('__e2eIssueFiltersStore is not exposed on window')
        store.getState().moveFilter(filterId, dir as 'up' | 'down')
      },
      id,
      direction
    )
  }
)

When(/^I delete the saved issue filter "([^"]*)"$/, async (name: string) => {
  const id = await filterIdNamed(name)
  await browser.execute((filterId: string) => {
    const store = (
      window as unknown as {
        __e2eIssueFiltersStore?: { getState: () => { removeFilter: (id: string) => void } }
      }
    ).__e2eIssueFiltersStore
    if (!store) throw new Error('__e2eIssueFiltersStore is not exposed on window')
    store.getState().removeFilter(filterId)
  }, id)
})

Then(
  /^the saved issue filter "([^"]*)" is ordered before "([^"]*)"$/,
  async (first: string, second: string) => {
    const rows = await filterRows()
    const firstIndex = rows.findIndex((r) => r.label === first)
    const secondIndex = rows.findIndex((r) => r.label === second)
    expect(firstIndex).not.toBe(-1)
    expect(secondIndex).not.toBe(-1)
    expect(firstIndex).toBeLessThan(secondIndex)
  }
)
