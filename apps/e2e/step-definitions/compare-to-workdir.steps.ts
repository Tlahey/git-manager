import { $, browser } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// "Compare to working directory" is a real native macOS context-menu entry
// (`useGitGraphActions.ts`'s `onCompareToWorkdir`) — not drivable by WebdriverIO (see
// tag-menu.steps.ts's comment on why native menus are off-limits here, and
// branch-rename.steps.ts for the identical workaround). This dispatches straight into the
// `pendingGraphAction` store bridge the ⌘K palette's own dialog-based commands also use:
// `GitGraph.tsx`'s effect picks it up and forwards it to `GitGraphOverlayManager`, which renders
// the exact same `CompareToWorkdirDialog` the native menu would, resolved against whichever
// commit is already selected (`I select the "<ref>" commit in the graph`, shared from
// command-palette.steps.ts).
When(/^I open the compare-to-workdir dialog$/, async () => {
  await browser.execute(() => {
    const store = (
      window as unknown as {
        __e2eRepoUIStore?: { getState: () => { setPendingGraphAction: (action: unknown) => void } }
      }
    ).__e2eRepoUIStore
    store?.getState().setPendingGraphAction({ kind: 'compare' })
  })
  await $('[data-testid="compare-workdir-dialog"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the compare-to-workdir dialog is shown$/, async () => {
  await $('[data-testid="compare-workdir-dialog"]').waitForDisplayed({ timeout: 10000 })
})

// `diff-viewer-file-<path>` is DiffViewer's own per-file testid, shared by every dialog that
// renders a `GitDiff` through `DiffFilesPanel` (compare-branches.steps.ts uses the same one) — a
// specific filename appearing here is a concrete signal the real `compareCommitToWorkdir`
// computation ran, not just that the dialog opened.
Then(/^the compare-to-workdir diff includes the file "([^"]*)"$/, async (path: string) => {
  await $(`[data-testid="diff-viewer-file-${path}"]`).waitForDisplayed({ timeout: 10000 })
})
