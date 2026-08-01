import { $, browser } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// "Compare <branch> with…" is a real native macOS context-menu entry (graph branch pill / sidebar
// branch row) — not drivable by WebdriverIO (see tag-menu.steps.ts's comment on why native menus
// are off-limits here). This jumps straight past that trigger to the resulting UI state via the
// e2e-only `__e2eRepoUIStore` hook (main.tsx, VITE_E2E-gated), the same pattern
// blame-history.steps.ts uses for `setActiveDiffFile`. From here on everything is real: RepoView
// mounts CompareBranchesDialog off this same store field, which fires the real `compare_refs`
// backend call through `useRefComparison`/`apiCompareRefs`.
When(/^I compare "([^"]*)" with "([^"]*)"$/, async (baseRef: string, headRef: string) => {
  await browser.execute(
    (base: string, head: string) => {
      const store = (
        window as unknown as {
          __e2eRepoUIStore?: {
            getState: () => {
              setCompareRefsTarget: (target: { baseRef: string; headRef: string }) => void
            }
          }
        }
      ).__e2eRepoUIStore
      store?.getState().setCompareRefsTarget({ baseRef: base, headRef: head })
    },
    baseRef,
    headRef
  )

  await $('[data-testid="compare-branches-dialog"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the compare branches dialog is shown$/, async () => {
  await $('[data-testid="compare-branches-dialog"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the compare branches summary reads "([^"]*)"$/, async (expected: string) => {
  const summary = $('[data-testid="compare-branches-summary"]')
  await summary.waitForDisplayed({ timeout: 10000 })
  await browser.waitUntil(async () => (await summary.getText()).includes(expected), {
    timeout: 10000,
    timeoutMsg: `expected the compare branches summary to include "${expected}"`,
  })
})

Then(/^the compare branches dialog reports the two sides are identical$/, async () => {
  const dialog = $('[data-testid="compare-branches-dialog"]')
  await dialog.waitForDisplayed({ timeout: 10000 })
  await browser.waitUntil(
    async () => (await dialog.getText()).includes('Pick two different references to compare.'),
    {
      timeout: 10000,
      timeoutMsg: 'expected the compare branches dialog to report the two sides as identical',
    }
  )
})

// `diff-viewer-file-<path>` is DiffViewer's own per-file testid (real source change,
// DiffViewer.tsx), keyed by the exact path the backend returned — a specific filename appearing
// here is a concrete signal the real `compare_refs`/`diff_refs` computation ran, not just that
// the dialog opened.
Then(/^the compare branches diff includes the file "([^"]*)"$/, async (path: string) => {
  await $(`[data-testid="diff-viewer-file-${path}"]`).waitForDisplayed({ timeout: 10000 })
})

// Scoped to the file's own header count spans (`.text-green-400`/`.text-red-400`, the first match
// in DOM order since the header renders before any hunk lines reuse the same classes for their
// origin marker) — numeric, so it holds regardless of the app's language setting.
Then(
  /^the file "([^"]*)" in the compare view shows (\d+) additions? and (\d+) deletions?$/,
  async (path: string, additions: string, deletions: string) => {
    const block = $(`[data-testid="diff-viewer-file-${path}"]`)
    await block.waitForDisplayed({ timeout: 10000 })
    await browser.waitUntil(
      async () => {
        const added = await block.$('.text-green-400').getText()
        const removed = await block.$('.text-red-400').getText()
        return added === `+${additions}` && removed === `-${deletions}`
      },
      {
        timeout: 10000,
        timeoutMsg: `expected "${path}" to show +${additions}/-${deletions}`,
      }
    )
  }
)

When(/^I swap the compared sides$/, async () => {
  const button = $('[data-testid="compare-branches-swap"]')
  await button.waitForClickable({ timeout: 10000 })
  await button.click()
})

// WDIO's own `selectByAttribute` picks the right <option> in the WebView but, on this WKWebView
// driver, doesn't reliably raise a 'change' event React's synthetic listener picks up — same issue
// and same fix as activity-log.steps.ts/ai-pr-description.steps.ts's `setNativeSelectValue`.
async function setNativeSelectValue(testid: string, value: string) {
  await browser.execute(
    (id: string, val: string) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLSelectElement | null
      if (!el) throw new Error(`setNativeSelectValue: no element with data-testid="${id}"`)
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      )!.set!
      setter.call(el, val)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },
    testid,
    value
  )
}

When(/^I pick "([^"]*)" as the compare head$/, async (ref: string) => {
  await setNativeSelectValue('compare-branches-head', ref)
})

When(/^I pick "([^"]*)" as the compare base$/, async (ref: string) => {
  await setNativeSelectValue('compare-branches-base', ref)
})
