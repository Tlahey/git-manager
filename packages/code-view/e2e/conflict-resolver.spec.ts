import { test, expect, type Page } from '@playwright/test'

/** Loads a story's bare iframe (no Storybook manager chrome around it). */
async function openStory(page: Page, storyId: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`)
  await expect(page.getByTestId('story-root')).toBeVisible()
}

// Monaco renders some spaces as U+00A0 — \s in JS regexes matches it, so all text assertions
// on editor content go through whitespace-tolerant regexes rather than exact strings.

test.describe('ThreeWayMerge story', () => {
  const STORY = 'codeview-conflictresolver--three-way-merge'

  test('renders three panes with their content and the toolbar', async ({ page }) => {
    await openStory(page, STORY)

    await expect(page.getByTestId('merge-pane-theirs-wrapper')).toBeVisible()
    await expect(page.getByTestId('merge-pane-center-wrapper')).toBeVisible()
    await expect(page.getByTestId('merge-pane-ours-wrapper')).toBeVisible()

    // Incoming (left) pane shows theirs' side of the conflict, the result pane defaults to
    // ours' side, and the current (right) pane shows ours.
    await expect(page.getByTestId('merge-pane-theirs-wrapper')).toContainText(/retries\s*=\s*5/)
    await expect(page.getByTestId('merge-pane-center-wrapper')).toContainText(/retries\s*=\s*2/)
    await expect(page.getByTestId('merge-pane-ours-wrapper')).toContainText(/debug\s*=\s*true/)

    // Fixture: b2 conflict + b4 theirs-only + b6 ours-only = 3 changes, 1 genuine conflict.
    await expect(page.getByTestId('merge-stats')).toHaveText('3 changes. 1 conflict.')

    // Host-provided status nodes render above the panes.
    await expect(page.getByTestId('merge-header-left-status')).toContainText('Incoming')
    await expect(page.getByTestId('merge-header-center-status')).toContainText('Result')
    await expect(page.getByTestId('merge-header-right-status')).toContainText('Current')
  })

  test('accepting the incoming conflict side resolves the conflict', async ({ page }) => {
    await openStory(page, STORY)

    // The genuine conflict (blockId 2) is actionable from the left (incoming) gap.
    await expect(page.getByTestId('merge-pane-center-wrapper')).toContainText(/retries\s*=\s*2/)
    await page.getByTestId('merge-connector-accept-left-2').click()

    // Conflict toggles are independent: accepting theirs adds it alongside ours.
    await expect(page.getByTestId('merge-pane-center-wrapper')).toContainText(/retries\s*=\s*5/)
    await expect(page.getByTestId('merge-stats')).toHaveText('3 changes. 0 conflicts.')
  })

  test('the wand applies the host-provided auto-merge text', async ({ page }) => {
    await openStory(page, STORY)

    await expect(page.getByTestId('merge-pane-center-wrapper')).not.toContainText(/VERSION/)
    await page.getByTestId('merge-wand-btn').click()

    // The story's onAutoMerge resolves to a text that pulls in the theirs-only addition and
    // settles the conflict back on its base value.
    await expect(page.getByTestId('merge-pane-center-wrapper')).toContainText(/VERSION/)
    await expect(page.getByTestId('merge-pane-center-wrapper')).toContainText(/retries\s*=\s*3/)
  })
})

test.describe('TwoPanelDiff story', () => {
  const STORY = 'codeview-conflictresolver--two-panel-diff'

  test('renders two read-only panes with the header toolbar', async ({ page }) => {
    await openStory(page, STORY)

    await expect(page.getByTestId('merge-pane-theirs-wrapper')).toBeVisible()
    await expect(page.getByTestId('merge-pane-center-wrapper')).toBeVisible()
    await expect(page.getByTestId('merge-pane-ours-wrapper')).toHaveCount(0)

    // The story doesn't pass a `header` prop, so ConflictResolver defaults to `header = true` —
    // the toolbar (nav + stats) renders the same as in 3-panel mode. Only the merge-only actions
    // (apply/auto-merge/reset/recalculate) are suppressed in 2-panel mode.
    await expect(page.getByTestId('merge-nav-prev')).toBeVisible()
    // Read-only diff panes have nothing to "touch"/resolve, so changes/conflicts stay at 0.
    await expect(page.getByTestId('merge-stats')).toHaveText('0 changes. 0 conflicts.')

    await expect(page.getByTestId('merge-pane-theirs-wrapper')).toContainText(/retries\s*=\s*5/)
    await expect(page.getByTestId('merge-pane-center-wrapper')).toContainText(/retries\s*=\s*2/)
  })
})

test.describe('header actions config', () => {
  test('MinimalHeader keeps navigation/reset and hides the rest', async ({ page }) => {
    await openStory(page, 'codeview-conflictresolver--minimal-header')

    await expect(page.getByTestId('merge-nav-prev')).toBeVisible()
    await expect(page.getByTestId('merge-nav-next')).toBeVisible()
    await expect(page.getByTestId('merge-reset-btn')).toBeVisible()

    await expect(page.getByTestId('merge-apply-left-btn')).toHaveCount(0)
    await expect(page.getByTestId('merge-wand-btn')).toHaveCount(0)
    await expect(page.getByTestId('merge-whitespace-dropdown-btn')).toHaveCount(0)
    await expect(page.getByTestId('merge-highlight-dropdown-btn')).toHaveCount(0)
    await expect(page.getByTestId('merge-stats')).toHaveCount(0)
    await expect(page.getByTestId('merge-recalc-btn')).toHaveCount(0)
  })

  test('NoHeader renders panes only', async ({ page }) => {
    await openStory(page, 'codeview-conflictresolver--no-header')

    await expect(page.getByTestId('merge-pane-center-wrapper')).toBeVisible()
    await expect(page.getByTestId('merge-nav-prev')).toHaveCount(0)
    await expect(page.getByTestId('merge-header-center-status')).toHaveCount(0)
  })
})
