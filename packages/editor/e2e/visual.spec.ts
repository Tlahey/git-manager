import { test, expect, type Page } from '@playwright/test'

/** Visual regression suite: every assertion compares against a committed baseline image
 * (see `*.spec.ts-snapshots/`) — a diff beyond the configured tolerance fails the test.
 * Two kinds of checks:
 *  1. one baseline per story (catches unintended restyling between two versions),
 *  2. one baseline per user action (catches an action no longer producing the right visual
 *     outcome: resolved ribbons turning dotted, center text shifting, buttons disappearing).
 *
 * Monaco's non-deterministic chrome (cursor blink, current-line highlight, scrollbars) is
 * neutralized during capture by e2e/screenshot.css. `toHaveScreenshot` itself waits until two
 * consecutive captures are identical, which absorbs the resolver's deferred connector
 * recomputes (rAF + 50/250ms settle timers). */

async function openStory(page: Page, storyId: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`)
  await expect(page.getByTestId('story-root')).toBeVisible()
}

/** The component under test, excluding any Storybook chrome around the iframe body. */
function subject(page: Page) {
  return page.getByTestId('story-root')
}

test.describe('story baselines', () => {
  test('ThreeWayMerge', async ({ page }) => {
    await openStory(page, 'codeview-conflictresolver--three-way-merge')
    // Pending conflict ribbon present on the left gap = connectors fully computed.
    await expect(page.getByTestId('merge-connector-ribbon-left-2')).toBeVisible()
    await expect(subject(page)).toHaveScreenshot('three-way-initial.png')
  })

  test('TwoPanelDiff', async ({ page }) => {
    await openStory(page, 'codeview-conflictresolver--two-panel-diff')
    // 2-way blocks are computed asynchronously by Monaco's diff engine. blockId 0 is a
    // synthesized leading unchanged gap (the fixture's first change isn't on line 1) — wait on
    // the stats line instead of a specific ribbon id so this doesn't re-break every time the
    // gap-synthesis shifts blockIds around.
    await expect(page.getByTestId('merge-stats')).toContainText('changes')
    await expect(subject(page)).toHaveScreenshot('two-panel-diff.png')
  })

  test('MinimalHeader', async ({ page }) => {
    await openStory(page, 'codeview-conflictresolver--minimal-header')
    await expect(page.getByTestId('merge-connector-ribbon-left-2')).toBeVisible()
    await expect(subject(page)).toHaveScreenshot('minimal-header.png')
  })

  test('NoHeader', async ({ page }) => {
    await openStory(page, 'codeview-conflictresolver--no-header')
    await expect(page.getByTestId('merge-connector-ribbon-left-2')).toBeVisible()
    await expect(subject(page)).toHaveScreenshot('no-header.png')
  })

  test('CollapsedMultipleRegions', async ({ page }) => {
    await openStory(page, 'codeview-conflictresolver--collapsed-multiple-regions')
    // All three unchanged blocks collapse into wavy connectors in both gaps. Waiting for the
    // last one (block 5) in both gaps guarantees the collapse geometry has fully settled.
    await expect(page.getByTestId('merge-connector-collapsed-left-5')).toBeVisible()
    await expect(page.getByTestId('merge-connector-collapsed-right-5')).toBeVisible()
    // Regression guard: the 2nd/3rd collapsed wave must stay glued to its banner strips. A
    // one-line drift of any later wave (the bug this story was written for) shifts hundreds of
    // pixels and fails this baseline.
    await expect(subject(page)).toHaveScreenshot('collapsed-multiple-regions.png')
  })

  test('TwoWayMixedChanges', async ({ page }) => {
    await openStory(page, 'codeview-conflictresolver--two-way-mixed-changes')
    // Regression guard for the two-way addition/deletion boundary-marker off-by-one: the
    // deletion ribbon must land *inside* the `logging: {}` block (not above it), and the
    // insertion ribbon right after `ttl: 60,` (not above it) — see twoWayView.ts's
    // `buildDynamicMergeView` comment on Monaco's insert-after vs. insert-before convention.
    await expect(page.getByTestId('merge-stats')).toContainText('3 changes')
    await expect(subject(page)).toHaveScreenshot('two-way-mixed-changes.png')
  })

  test('TwoWayCollapseUnchanged', async ({ page }) => {
    await openStory(page, 'codeview-conflictresolver--two-way-collapse-unchanged')
    // Regression guard: two-way mode only synthesizes `unchanged` blocks (and therefore has
    // anything to collapse at all) since buildDynamicMergeView's gap-synthesis fix — without it
    // this banner never renders, no matter how long the untouched stretch is.
    await expect(page.locator('.monaco-collapsed-zone-banner').first()).toBeVisible()
    await expect(subject(page)).toHaveScreenshot('two-way-collapsed-unchanged.png')
  })

  test('TwoWayHighlightModeToggle — words mode only highlights the changed word', async ({
    page,
  }) => {
    await openStory(page, 'codeview-conflictresolver--two-way-highlight-mode-toggle')
    await expect(page.getByTestId('merge-stats')).toContainText('1 change')
    // Regression guard: 'words' pairs a subtle whole-line fill with a precise intra-line overlay
    // on just the changed span ("Submit" → "Save") — computeTwoWayIntraLineHighlights's job.
    await expect(page.locator('[class*="merge-inline-"]').first()).toBeVisible()
    await expect(subject(page)).toHaveScreenshot('two-way-highlight-words-mode.png')
  })

  test('TwoWayHighlightModeToggle — lines mode highlights the whole line', async ({ page }) => {
    await openStory(page, 'codeview-conflictresolver--two-way-highlight-mode-toggle')
    await expect(page.getByTestId('merge-stats')).toContainText('1 change')

    await page.getByTestId('merge-highlight-dropdown-btn').click()
    await page.locator('button:text-is("Highlight lines")').click()

    // Regression guard: 'lines' switches the fill to the louder merge-vivid-* class across the
    // whole line and drops the word-level overlay entirely — computeTwoWayVisuals's
    // useVividText param.
    await expect(page.locator('[class*="merge-vivid-modification"]').first()).toBeVisible()
    await expect(page.locator('[class*="merge-inline-"]')).toHaveCount(0)
    await expect(subject(page)).toHaveScreenshot('two-way-highlight-lines-mode.png')
  })
})

test.describe('action outcomes', () => {
  const STORY = 'codeview-conflictresolver--three-way-merge'

  test('accepting the incoming conflict side', async ({ page }) => {
    await openStory(page, STORY)
    await expect(page.getByTestId('merge-connector-ribbon-left-2')).toBeVisible()

    await page.getByTestId('merge-connector-accept-left-2').click()

    // Resolved segments render as a dotted top/bottom edge pair — its presence is the signal
    // that the post-action repaint happened before we capture.
    await expect(page.getByTestId('merge-connector-ribbon-left-2-top')).toBeAttached()
    await expect(page.getByTestId('merge-pane-center-wrapper')).toContainText(/retries\s*=\s*5/)
    // Expected visual state: theirs' conflict line added to the result pane (both sides kept),
    // left ribbon dotted, its accept/ignore buttons gone, stats at 0 conflicts.
    await expect(subject(page)).toHaveScreenshot('three-way-conflict-accepted.png')
  })

  test('accepting the incoming addition', async ({ page }) => {
    await openStory(page, STORY)
    await expect(page.getByTestId('merge-connector-ribbon-left-4')).toBeVisible()

    await page.getByTestId('merge-connector-accept-left-4').click()

    await expect(page.getByTestId('merge-connector-ribbon-left-4-top')).toBeAttached()
    await expect(page.getByTestId('merge-pane-center-wrapper')).toContainText(/VERSION/)
    // Expected visual state: the two added lines appear in the result pane (shifting the lines
    // below them down), the hatched filler zone on the current pane grows to keep alignment.
    await expect(subject(page)).toHaveScreenshot('three-way-addition-accepted.png')
  })

  test('wand auto-merge', async ({ page }) => {
    await openStory(page, STORY)
    await expect(page.getByTestId('merge-connector-ribbon-left-2')).toBeVisible()

    await page.getByTestId('merge-wand-btn').click()

    await expect(page.getByTestId('merge-pane-center-wrapper')).toContainText(/VERSION/)
    // Expected visual state: every non-conflicting block applied and grayed out/dotted, the
    // conflict back on its base text.
    await expect(subject(page)).toHaveScreenshot('three-way-auto-merged.png')
  })

  test('reset restores the initial visual state', async ({ page }) => {
    await openStory(page, STORY)
    await expect(page.getByTestId('merge-connector-ribbon-left-2')).toBeVisible()

    await page.getByTestId('merge-wand-btn').click()
    await expect(page.getByTestId('merge-pane-center-wrapper')).toContainText(/VERSION/)

    await page.getByTestId('merge-reset-btn').click()
    await expect(page.getByTestId('merge-pane-center-wrapper')).not.toContainText(/VERSION/)

    // Reuses the ThreeWayMerge baseline on purpose: after a reset the component must be
    // visually indistinguishable from its pristine state.
    await expect(subject(page)).toHaveScreenshot('three-way-initial.png')
  })
})
