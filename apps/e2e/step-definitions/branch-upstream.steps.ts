import { browser, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// "Set upstream" lives only on the branch's native context menu (graph and sidebar alike) —
// WebDriver cannot open or click into it. But the native handler and this dialog both ultimately
// just call `setPendingGraphAction({ kind: 'setUpstream', branch })` on the repoUI store;
// GitGraph.tsx forwards that into its own real SetUpstreamDialog regardless of who set it (see the
// store's own doc comment on `pendingGraphAction`, and ai-commit-recompose.steps.ts for the same
// pattern already proven for another native-menu-only entry). This step dispatches through that
// same real bridge instead of a menu click.
//
// The bridge only fires once a commit is selected (`primaryOid` — see GitGraph.tsx's effect), so a
// "I select the ... commit in the graph" step (command-palette.steps.ts) must run first; which
// commit is selected is otherwise irrelevant here, since SetUpstreamDialog only reads `branch`.
When(/^I open the set-upstream dialog for branch "([^"]*)"$/, async (branch: string) => {
  await browser.execute((branchName: string) => {
    const store = (
      window as unknown as {
        __e2eRepoUIStore?: {
          getState: () => {
            setPendingGraphAction: (action: { kind: 'setUpstream'; branch: string }) => void
          }
        }
      }
    ).__e2eRepoUIStore
    if (!store) throw new Error('__e2eRepoUIStore is not exposed on window')
    store.getState().setPendingGraphAction({ kind: 'setUpstream', branch: branchName })
  }, branch)
  await $('[data-testid="set-upstream-dialog"]').waitForDisplayed({ timeout: 10000 })
})

// SetUpstreamDialog preselects `origin/<branch>` once the branch list loads (its own effect in
// SetUpstreamDialog.tsx) — assert on the real `<select>`'s value, not just that the dialog opened.
Then(/^the set-upstream dialog preselects "([^"]*)"$/, async (upstream: string) => {
  const select = $('[data-testid="set-upstream-select"]')
  await select.waitForDisplayed({ timeout: 10000 })
  await browser.waitUntil(async () => (await select.getValue()) === upstream, {
    timeout: 10000,
    timeoutMsg: `set-upstream select never preselected "${upstream}" (last: "${await select.getValue()}")`,
  })
})

When(/^I confirm the set-upstream dialog$/, async () => {
  const button = $('[data-testid="set-upstream-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
  // The dialog closes itself on a successful apply (`onClose()` in SetUpstreamDialog.tsx's
  // handleConfirm) — waiting for that rather than jumping straight to the on-disk assertion avoids
  // racing the still-in-flight `set_branch_upstream` IPC call.
  await $('[data-testid="set-upstream-dialog"]').waitForExist({ reverse: true, timeout: 15000 })
})
