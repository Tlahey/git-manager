import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser, expect, $, $$ } from '@wdio/globals'
import { Given, When, Then, After } from '@wdio/cucumber-framework'
import { stabiliseForSnapshot } from '../support/visual.js'

// The embedded provider shares ONE app instance across features, run sequentially. This feature
// navigates that shared window to the merge route, so it must hand it back on the main route or
// every feature that runs after it inherits `?window=merge` and can't find the main app.
After({ tags: '@merge' }, async () => {
  await browser.execute(() => {
    window.location.href = '/'
  })
  await browser.pause(500)
})

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCENARIOS_DIR = join(__dirname, '../../../tools/git-fixtures/scenarios')
const FIXTURE_ROOT = '/tmp/git-manager-fixtures'

let currentRepoPath = ''

Given(/^the "([^"]*)" fixture is built$/, (fixtureName: string) => {
  execFileSync('bash', [join(SCENARIOS_DIR, `${fixtureName}.sh`)], { stdio: 'inherit' })
  currentRepoPath = join(FIXTURE_ROOT, fixtureName)
})

When(/^I open the merge editor for "([^"]*)"$/, async (filePath: string) => {
  // The merge editor renders directly from URL params — main.tsx routes `?window=merge` to
  // ConflictMergeWindow, independent of the repoUI store — so navigating the current window is
  // enough; no need to drive the native second-window flow (WebviewWindowBuilder).
  const url = `/?window=merge&repoPath=${encodeURIComponent(currentRepoPath)}&filePath=${encodeURIComponent(filePath)}`
  await browser.execute((u: string) => {
    window.location.href = u
  }, url)
  // merge-auto-merge-button appears once get_merge_view resolves and the view is renderable.
  await $('[data-testid="merge-auto-merge-button"]').waitForDisplayed({ timeout: 20000 })
})

Then(/^the merge editor is shown$/, async () => {
  await expect($('[data-testid="merge-editor-window"]')).toBeDisplayed()
})

Then(/^the merge editor offers to auto-merge the non-conflicting blocks$/, async () => {
  await expect($('[data-testid="merge-auto-merge-button"]')).toBeDisplayed()
})

// The merge editor content (file path, conflict count, the three Monaco panes) is fixture-stable
// — no shas/dates. Give Monaco a beat to finish laying out all panes + syntax highlighting.
Then(/^the merge editor matches the visual snapshot "([^"]*)"$/, async (tag: string) => {
  await $('[data-testid="merge-auto-merge-button"]').waitForDisplayed({ timeout: 20000 })
  await browser.pause(1500)
  await stabiliseForSnapshot()
  await expect($('[data-testid="merge-editor-window"]')).toMatchElementSnapshot(tag, 1)
})

// Everything below drives block resolution — unlike the "opens + snapshot" scenarios above (which
// navigate the shared main window in place, safe because they only ever *read* state), every
// action that actually resolves the conflict (merge-apply, merge-accept-left/-right,
// keep-ours/keep-theirs) calls `getCurrentWindow().close()`. Reusing the shared main window for
// those would kill the rest of the test run, exactly like FixupCommitWindow (see fixup.steps.ts /
// COVERAGE.md's multi-window gotcha) — so this drives a REAL second WebviewWindow instead, opened
// the same way production does: clicking a conflicted file row in ConflictResolutionPanel
// (`onSelectFile` -> repoUI's `conflictFilePath` -> GitGraph's WebviewWindow-open effect).
let mainWindowHandle = ''
let mergeWindowHandle = ''

// WebdriverIO's native `element.click()` throws in real secondary windows (see fixup.steps.ts) —
// dispatch via injected JS instead. Only needed for clicks *inside* the merge window; the file-row
// click below happens in the always-focused main window, where native `.click()` is fine.
async function clickViaJs(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`clickViaJs: no element with data-testid="${id}"`)
    el.click()
  }, testid)
}

When(/^I click the conflicted file "([^"]*)" to resolve it$/, async (filePath: string) => {
  const before = await browser.getWindowHandles()
  mainWindowHandle = before[0]
  const row = $(`[data-testid="file-tree-file-${filePath}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  await row.click()
  await browser.waitUntil(
    async () => (await browser.getWindowHandles()).length > before.length,
    { timeout: 10000, timeoutMsg: 'The merge editor window never opened' }
  )
  const after = await browser.getWindowHandles()
  mergeWindowHandle = after.find((h) => !before.includes(h))!
  await browser.switchToWindow(mergeWindowHandle)
  await $('[data-testid="merge-editor-window"]').waitForDisplayed({ timeout: 20000 })
  await $('[data-testid="merge-auto-merge-button"]').waitForDisplayed({ timeout: 20000 })
  // The connector overlay's geometry only settles once all three Monaco panes report ready —
  // ConflictResolver.tsx schedules its own follow-up recomputes up to 250ms after that (belt-
  // and-suspenders for a layout pass that lands before first paint) — so the accept/reject
  // buttons queried below aren't reliably present the instant the wand button itself is.
  await browser.pause(1000)
})

// handleApplyNonConflicting (the button's onClick) is async — it awaits the backend
// apiAutoMergeConflictView IPC round-trip before applying the merged text and recomputing
// placements. clickViaJs's browser.execute resolves as soon as the DOM .click() call returns,
// well before that promise (and the resulting re-render) settles.
When(/^I click the merge editor auto-merge wand$/, async () => {
  await clickViaJs('merge-auto-merge-button')
  await browser.pause(1000)
})

// The fixture's two "both-different" occurrences are the only blocks still actionable from the
// right gap after the wand runs (it only auto-merges one-sided blocks — see
// ConflictResolver.tsx's docstring) — actionable independently from both gaps until a side is
// picked (mergeBlockLayout's isChangeSource/`actionable` semantics), so this always finds exactly
// those 2 remaining buttons regardless of their blockId.
async function countAcceptRightButtons(): Promise<number> {
  const found = await $$('[data-testid^="merge-connector-accept-right-"]')
  return found.length
}

When(/^I accept the right side for every remaining conflicting block$/, async () => {
  await browser.waitUntil(async () => (await countAcceptRightButtons()) > 0, {
    timeout: 10000,
    timeoutMsg: 'No remaining merge-connector-accept-right buttons appeared',
  })
  const buttons = await $$('[data-testid^="merge-connector-accept-right-"]')
  const testids: string[] = []
  for (const btn of buttons) {
    const testid = await btn.getAttribute('data-testid')
    if (testid) testids.push(testid)
  }
  expect(testids.length).toBeGreaterThan(0)
  for (const testid of testids) {
    await clickViaJs(testid)
  }
})

Then(/^the merge apply button is enabled$/, async () => {
  await expect($('[data-testid="merge-apply"]')).toBeEnabled()
})

// Apply writes the center pane's current buffer to disk and stages it (git_conflict.rs's
// resolve_conflict), then closes this real second window — switching back to the main window
// immediately after, before polling handles again, avoids depending on the closing window's own
// context (see fixup.steps.ts's "no such window" gotcha).
When(/^I click the merge editor apply button$/, async () => {
  await clickViaJs('merge-apply')
  await browser.pause(500)
  await browser.switchToWindow(mainWindowHandle)
  await browser.waitUntil(
    async () => {
      const handles = await browser.getWindowHandles()
      return handles.length === 1 && handles[0] === mainWindowHandle
    },
    { timeout: 10000, timeoutMsg: 'Did not return to a single window after applying the merge' }
  )
})

Then(/^the file "([^"]*)" is staged and no longer conflicted$/, (filePath: string) => {
  const status = execFileSync('git', ['-C', currentRepoPath, 'status', '--porcelain']).toString()
  expect(status).not.toContain(`UU ${filePath}`)
  const staged = execFileSync('git', [
    '-C',
    currentRepoPath,
    'diff',
    '--cached',
    '--name-only',
  ]).toString()
  expect(staged).toContain(filePath)
})

Then(/^the file "([^"]*)" contains the line "([^"]*)"$/, (filePath: string, line: string) => {
  const content = readFileSync(join(currentRepoPath, filePath), 'utf8')
  expect(content.split('\n')).toContain(line)
})

Then(/^the file "([^"]*)" does not contain the line "([^"]*)"$/, (filePath: string, line: string) => {
  const content = readFileSync(join(currentRepoPath, filePath), 'utf8')
  expect(content.split('\n')).not.toContain(line)
})
