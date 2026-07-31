import { browser, $ } from '@wdio/globals'
import { When } from '@wdio/cucumber-framework'

// Same real store bridge as ai-explanation.steps.ts / ai-commit-recompose.steps.ts — "Review
// changes (LLM)" and "Review branch changes (LLM)" both live only on a real native context menu
// (the WIP row's, and a branch's), which WebDriver cannot open or click into. Both ultimately just
// call `setAiPanelTarget({ kind: 'reviewWorking' | 'reviewBranch', ... })` on the repoUI store,
// which `GitGraph.tsx` renders reactively regardless of who set it — so these steps dispatch
// through the same `window.__e2eRepoUIStore` bridge instead of a menu click. Duplicated locally
// rather than shared, matching this suite's existing per-file convention.
function setAiPanelTarget(target: Record<string, unknown>) {
  return browser.execute((targetJson: string) => {
    const store = (
      window as unknown as {
        __e2eRepoUIStore?: { getState: () => { setAiPanelTarget: (t: unknown) => void } }
      }
    ).__e2eRepoUIStore
    if (!store) throw new Error('__e2eRepoUIStore is not exposed on window')
    store.getState().setAiPanelTarget(JSON.parse(targetJson))
  }, JSON.stringify(target))
}

When(/^I choose "Review changes \(LLM\)" from the working-tree row menu$/, async () => {
  await setAiPanelTarget({ kind: 'reviewWorking' })
  await $('[data-testid="code-review-panel"]').waitForDisplayed({ timeout: 10000 })
})

When(
  /^I choose "Review branch changes \(LLM\)" for the "([^"]*)" branch \(base "([^"]*)"\)$/,
  async (branch: string, baseRef: string) => {
    await setAiPanelTarget({ kind: 'reviewBranch', branch, baseRef })
    await $('[data-testid="code-review-panel"]').waitForDisplayed({ timeout: 10000 })
  }
)

// "Then the explanation panel shows a finished explanation" is shared — see
// ai-explanation.steps.ts. CodeReviewPanel reuses the same ExplanationPanelShell, so its copy
// button (`explanation-copy`) is the same fixture-agnostic "the streamed review finished" signal.
