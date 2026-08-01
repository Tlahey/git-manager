import { $, browser } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

// "When I reload the application" is shared — see settings.steps.ts.
// "Given the app language is English" / "AI features are turned off" / "the interface has
// settled" / "a full-window screenshot is saved as ..." are shared — see screenshots.steps.ts.

type RepoView = 'graph' | 'terminal' | 'settings'

// RepoView.tsx renders exactly one of these as a ternary — RepoGraphWorkspace / RepoTerminalView
// / RepoSettingsView — so at most one of these testids ever exists in the document at once. See
// each component's own root div for the testid.
const VIEW_PANEL_TESTID: Record<RepoView, string> = {
  graph: 'repo-graph-view',
  terminal: 'repo-terminal-view',
  settings: 'repo-settings-view',
}

// InnerTab is a plain <button>, not a Radix trigger — no pointerdown workaround needed here,
// unlike the worktree row's "⋮" menu (see worktree.steps.ts).
When(/^I click the "(graph|terminal|settings)" view tab$/, async (view: RepoView) => {
  const tab = $(`[data-testid="repo-view-tab-${view}"]`)
  await tab.waitForDisplayed({ timeout: 10000 })
  await tab.click()
})

Then(/^the "(graph|terminal|settings)" view tab is selected$/, async (view: RepoView) => {
  const tab = $(`[data-testid="repo-view-tab-${view}"]`)
  // Polled rather than a one-shot read: this step also runs straight after "I reload the
  // application", and the store/DOM need a moment to settle back to the default after the remount.
  await browser.waitUntil(
    async () => {
      if (!(await tab.isExisting())) return false
      return (await tab.getAttribute('aria-selected')) === 'true'
    },
    { timeout: 10000, timeoutMsg: `Expected the "${view}" view tab to be selected` }
  )
})

Then(/^the (graph|terminal|settings) view is shown$/, async (view: RepoView) => {
  await $(`[data-testid="${VIEW_PANEL_TESTID[view]}"]`).waitForDisplayed({ timeout: 10000 })
})

Then(/^the (graph|terminal|settings) view is no longer shown$/, async (view: RepoView) => {
  await $(`[data-testid="${VIEW_PANEL_TESTID[view]}"]`).waitForExist({
    reverse: true,
    timeout: 10000,
  })
})
