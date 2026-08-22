import { execFileSync } from 'node:child_process'
import { browser, $, expect } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo.js'

/** The oid of the commit with this exact subject, read straight from git — same helper shape as
 *  screenshots.steps.ts's `commitOidBySubject`, duplicated per this suite's own convention. */
function commitOidBySubject(subject: string): string {
  const repoPath = getActiveRepoPath()
  const log = execFileSync('git', ['-C', repoPath, 'log', '--all', '--format=%H%x09%s'], {
    encoding: 'utf8',
  })
  const line = log.split('\n').find((l) => l.slice(41) === subject && l.includes('\t'))
  if (!line) throw new Error(`no commit with subject "${subject}" in ${repoPath}`)
  return line.slice(0, 40)
}

/**
 * Simulates the real HTML5 drag-and-drop `useCommitRowDrag.ts` wires onto each graph row's slot
 * (`graph-row-<oid>`) — not a native OS-level drag WebDriver can perform, but the same
 * `dragstart`/`dragover`/`drop` sequence a real one dispatches, sharing one `DataTransfer` across
 * all three so the app's own `setData`/`getData`/`types` calls see a consistent object exactly as
 * they would mid-drag. Dropping on the target row's vertical centre lands in the "combine" third of
 * `resolveDropTarget`'s three bands (top/bottom edges are the "insert into the gap" bands instead).
 */
When(
  /^I drag the commit "([^"]*)" onto the commit "([^"]*)"$/,
  async (sourceSubject: string, targetSubject: string) => {
    const sourceOid = commitOidBySubject(sourceSubject)
    const targetOid = commitOidBySubject(targetSubject)
    const sourceTestId = `graph-row-${sourceOid}`
    const targetTestId = `graph-row-${targetOid}`
    await $(`[data-testid="${sourceTestId}"]`).waitForDisplayed({ timeout: 10000 })
    await $(`[data-testid="${targetTestId}"]`).waitForDisplayed({ timeout: 10000 })
    await browser.execute(
      (srcId: string, dstId: string) => {
        const source = document.querySelector(`[data-testid="${srcId}"]`) as HTMLElement | null
        const target = document.querySelector(`[data-testid="${dstId}"]`) as HTMLElement | null
        if (!source || !target) throw new Error('drag row not found')
        const dataTransfer = new DataTransfer()
        const rect = target.getBoundingClientRect()
        const clientX = rect.left + rect.width / 2
        const clientY = rect.top + rect.height / 2
        const fire = (el: Element, type: string) =>
          el.dispatchEvent(
            new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX, clientY })
          )
        fire(source, 'dragstart')
        fire(target, 'dragover')
        fire(target, 'drop')
        fire(source, 'dragend')
      },
      sourceTestId,
      targetTestId
    )
  }
)

Then(/^the commit reorder dialog is shown$/, async () => {
  await $('[data-testid="commit-reorder-dialog"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the commit reorder preview marks "([^"]*)" as moved$/, async (subject: string) => {
  const oid = commitOidBySubject(subject)
  const shortOid = oid.slice(0, 7)
  const row = $(`[data-testid="commit-reorder-preview-${shortOid}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  await expect(row).toHaveAttribute('data-moved', 'true')
})

When(/^I confirm the commit reorder$/, async () => {
  const button = $('[data-testid="commit-reorder-confirm"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
  await $('[data-testid="commit-reorder-dialog"]').waitForExist({ reverse: true, timeout: 15000 })
})
