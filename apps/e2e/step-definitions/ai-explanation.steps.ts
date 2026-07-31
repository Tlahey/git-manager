import { execFileSync } from 'node:child_process'
import { browser, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath as activeRepoPath } from '../support/activeRepo'

// Every AI panel below (commit/branch/working explanation, plus the code-review panels not covered
// in this file) opens *only* from a real native macOS context menu — see
// ai-commit-recompose.steps.ts's own note on why, and `tag-context-menu.feature`'s original
// discovery of the same limitation. All three route through `setAiPanelTarget` on the repoUI store
// (`GitGraph.tsx` renders whichever panel `aiPanelTarget.kind` names), which is the same real store
// bridge `window.__e2eRepoUIStore` already exposes for e2e — so these steps dispatch through it
// directly instead of a menu click. Everything downstream (the panel, the real map-phase file
// summaries, the real streamed compose call against the fake AI server) is exactly what a real
// click would have produced.
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

When(/^I choose "Explain this commit \(LLM\)" from the commit's row menu$/, async () => {
  const repoPath = activeRepoPath()
  const format = (fmt: string) =>
    execFileSync('git', ['-C', repoPath, 'log', '-1', `--format=${fmt}`, 'HEAD'], {
      encoding: 'utf8',
    }).trim()
  const oid = format('%H')
  const parentCount = format('%P').split(/\s+/).filter(Boolean).length

  await setAiPanelTarget({
    kind: 'commit',
    oid,
    shortOid: format('%h'),
    subject: format('%s'),
    body: format('%b'),
    author: format('%an'),
    parentCount,
  })
  await $('[data-testid="commit-explanation-panel"]').waitForDisplayed({ timeout: 10000 })
})

When(
  /^I choose "Explain branch changes \(LLM\)" for the "([^"]*)" branch \(base "([^"]*)"\)$/,
  async (branch: string, baseRef: string) => {
    await setAiPanelTarget({ kind: 'branch', branch, baseRef })
    await $('[data-testid="branch-explanation-panel"]').waitForDisplayed({ timeout: 10000 })
  }
)

When(/^I choose "Explain working changes \(LLM\)" from the working-tree row menu$/, async () => {
  await setAiPanelTarget({ kind: 'working' })
  await $('[data-testid="working-explanation-panel"]').waitForDisplayed({ timeout: 10000 })
})

// Shared by the commit/branch/working panels: all three render through the same
// `ExplanationPanelShell`, whose copy button only appears once `text && !isGenerating` — a
// fixture-agnostic "the streamed explanation actually finished" signal.
Then(/^the explanation panel shows a finished explanation$/, async () => {
  await $('[data-testid="explanation-copy"]').waitForDisplayed({ timeout: 20000 })
})

When(/^I click the explain-changes button$/, async () => {
  const button = $('[data-testid="change-explanation-run"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the change explanation shows a finished explanation$/, async () => {
  await $('[data-testid="change-explanation-copy"]').waitForDisplayed({ timeout: 20000 })
})
