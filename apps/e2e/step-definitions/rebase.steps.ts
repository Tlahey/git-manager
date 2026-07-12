import { expect, $ } from '@wdio/globals'
import { Then } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'

// The rebase-conflict fixture leaves a paused rebase; GitGraph detects it via a real
// get_rebase_state IPC call and auto-selects the synthetic conflict row, which surfaces the
// ConflictResolutionPanel (guards the bc754e2 "auto-open the conflict panel" fix).
Then(/^the conflict resolution panel is shown$/, async () => {
  await expect($('[data-testid="conflict-resolution-panel"]')).toBeDisplayed()
})

// With an unresolved conflict the panel shows Skip (nothing staged yet) + Abort; the Continue
// button only replaces Skip once every conflicted file is resolved (they're mutually exclusive
// in ConflictResolutionPanel). Abort is always available.
Then(/^the conflict panel offers to skip or abort the rebase$/, async () => {
  await expect($('[data-testid="conflict-panel-skip-button"]')).toBeDisplayed()
  await expect($('[data-testid="conflict-panel-abort-button"]')).toBeDisplayed()
})

// The panel renders file names, step progress and stable commit subjects — no shas/timestamps —
// so its layout is a clean snapshot target (see COVERAGE.md "Snapshot strategy").
Then(/^the conflict resolution panel matches the visual snapshot "([^"]*)"$/, async (tag: string) => {
  const panel = $('[data-testid="conflict-resolution-panel"]')
  await panel.waitForDisplayed({ timeout: 10000 })
  await stabiliseForSnapshot()
  await expect(panel).toMatchElementSnapshot(tag, 1)
})
