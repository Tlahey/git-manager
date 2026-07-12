import { expect, $ } from '@wdio/globals'
import { Then } from '@wdio/cucumber-framework'

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
