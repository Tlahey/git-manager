import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath as activeRepoPath } from '../support/activeRepo'

// `RevertDialog` only renders this picker when the selected commit has more than one parent —
// see RevertDialog.tsx's `isMerge = parents.length > 1`. Its presence is itself proof the dialog
// recognised the commit as a merge, distinct from `revert-dialog` alone (shown for every commit).
Then(/^the revert mainline picker is shown$/, async () => {
  await expect($('[data-testid="revert-mainline-picker"]')).toBeDisplayed()
})

// The mainline radio's `<input type="radio">` is visually `sr-only` (hidden); its enclosing
// `<label>` (which carries the testid) is the real clickable surface — a nested label click still
// toggles the input per standard HTML semantics, same pattern as settings.steps.ts's row-height
// radio.
When(/^I choose mainline parent "(\d+)" for the revert$/, async (parentNumber: string) => {
  const label = $(`[data-testid="revert-mainline-option-${parentNumber}"]`)
  await label.waitForDisplayed({ timeout: 10000 })
  await label.click()
})

Then(/^the file "([^"]*)" does not exist in the working tree$/, async (filePath: string) => {
  const repoPath = activeRepoPath()
  await browser.waitUntil(() => !existsSync(join(repoPath, filePath)), {
    timeout: 10000,
    timeoutMsg: `expected "${filePath}" to no longer exist in the working tree at ${repoPath}`,
  })
})

Then(
  /^the file "([^"]*)" in the working tree contains "([^"]*)"$/,
  async (filePath: string, expected: string) => {
    const repoPath = activeRepoPath()
    const fullPath = join(repoPath, filePath)
    const contains = () => existsSync(fullPath) && readFileSync(fullPath, 'utf8').includes(expected)
    await browser.waitUntil(contains, {
      timeout: 10000,
      timeoutMsg: `expected "${filePath}" to contain "${expected}" at ${repoPath}`,
    })
  }
)

Then(
  /^the file "([^"]*)" in the working tree does not contain "([^"]*)"$/,
  async (filePath: string, unexpected: string) => {
    const repoPath = activeRepoPath()
    const fullPath = join(repoPath, filePath)
    const doesNotContain = () =>
      existsSync(fullPath) && !readFileSync(fullPath, 'utf8').includes(unexpected)
    await browser.waitUntil(doesNotContain, {
      timeout: 10000,
      timeoutMsg: `expected "${filePath}" to no longer contain "${unexpected}" at ${repoPath}`,
    })
  }
)

// "Compare against parent 1/2" has no ⌘K command yet (only the native commit menu's
// `onCompareToParent` reaches it, via `useGitGraphActions.ts`'s local `pendingAction` state) — but
// that handler is fed by the exact same `pendingGraphAction` store bridge the command palette uses
// for reset/revert/branch/tag (see GitGraph.tsx's bridging effect). Writing the store field
// directly through the e2e-exposed `__e2eRepoUIStore` (main.tsx, VITE_E2E-gated) exercises that
// same bridge and the real `GitGraphOverlayManager` routing/`CompareToParentDialog` rendering,
// without needing a native right-click menu WebDriver cannot open — same pattern as
// blame-history.steps.ts's `setActiveDiffFile` call.
//
// The step's name says what the *reader* does — "compare the selected commit against parent 2" —
// not how it gets there. It used to start "I dispatch comparing…", and the `@doc` scenario
// rendered that verbatim as an instruction on the published page.
When(
  /^I compare the selected commit against parent "(\d+)"$/,
  async (parentNumber: string) => {
    await browser.execute((parent: number) => {
      const store = (
        window as unknown as {
          __e2eRepoUIStore?: {
            getState: () => {
              setPendingGraphAction: (action: {
                kind: 'compareParent'
                parentNumber: number
              }) => void
            }
          }
        }
      ).__e2eRepoUIStore
      store?.getState().setPendingGraphAction({ kind: 'compareParent', parentNumber: parent })
    }, Number(parentNumber))
  }
)

Then(/^the compare-parent dialog is shown$/, async () => {
  await expect($('[data-testid="compare-parent-dialog"]')).toBeDisplayed()
})

// `DiffFilesPanel` renders one file header (its `newPath`, or `oldPath → newPath` when renamed) per
// changed file once `apiGetCommitDiff`'s query resolves — poll its text rather than a one-shot read
// since the diff is fetched asynchronously after the dialog mounts.
Then(/^the compare-parent diff lists the file "([^"]*)"$/, async (filePath: string) => {
  const panel = $('[data-testid="diff-files-panel"]')
  await browser.waitUntil(
    async () => {
      if (!(await panel.isExisting())) return false
      const text = await panel.getText()
      return text.includes(filePath)
    },
    {
      timeout: 15000,
      timeoutMsg: `expected the compare-parent diff to list "${filePath}"`,
    }
  )
})
