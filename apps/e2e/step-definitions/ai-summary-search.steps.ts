import { join } from 'node:path'
import { browser, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

const FIXTURE_ROOT = '/tmp/git-manager-fixtures'

// Same Radix dropdown quirk every other toolbar menu in this suite works around — see
// ai-commit-search.steps.ts's own note. Duplicated locally rather than shared, matching this
// suite's existing per-file convention.
async function openDropdown(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`openDropdown: no element with data-testid="${id}"`)
    const opts = {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerType: 'mouse',
      isPrimary: true,
    }
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    el.dispatchEvent(new PointerEvent('pointerup', opts))
  }, testid)
}

async function clickViaJs(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`clickViaJs: no element with data-testid="${id}"`)
    el.click()
  }, testid)
}

// The archive-wide "Ask" panel (SummaryAskPanel) lives only in the graph's own AI-menu Summaries
// panel (DailySummariesPanel.tsx) — the dashboard row's briefing button opens a different,
// single-day component (DailySummaryPanel.tsx) with no ask box at all. So this switches to the
// repo's real tab first, the same way a user would leave the dashboard to look at that repo.
When(/^I open the "([^"]*)" project's tab$/, async (name: string) => {
  const repoPath = join(FIXTURE_ROOT, name)
  const row = $(`[data-testid="dashboard-repo-row"][data-repo-path="${repoPath}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  await row.$('[data-testid="repo-row-name"]').click()
  await $('[data-testid="toolbar-ai-button"]').waitForDisplayed({ timeout: 15000 })
})

When(/^I open the summaries panel from the AI menu$/, async () => {
  await $('[data-testid="toolbar-ai-button"]').waitForDisplayed({ timeout: 15000 })
  await openDropdown('toolbar-ai-button')
  const item = $('[data-testid="ai-menu-summaries"]')
  await item.waitForDisplayed({ timeout: 10000 })
  await clickViaJs('ai-menu-summaries')
  await $('[data-testid="summary-ask-panel"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I ask the archive "([^"]*)"$/, async (question: string) => {
  const input = $('[data-testid="summary-ask-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(question)
  const submit = $('[data-testid="summary-ask-submit"]')
  await submit.waitForEnabled({ timeout: 10000 })
  await submit.click()
})

Then(/^the summary search cites the "([^"]*)" repository$/, async (repo: string) => {
  const match = $('[data-testid="summary-answer-match"]')
  await match.waitForDisplayed({ timeout: 20000 })
  await browser.waitUntil(async () => (await match.getText()).includes(repo), {
    timeout: 20000,
    timeoutMsg: `summary search never cited the "${repo}" repository`,
  })
})

Then(/^the summaries panel shows its empty state$/, async () => {
  await $('[data-testid="summaries-empty"]').waitForDisplayed({ timeout: 15000 })
})

/** Mirrors `dailySummaryWindow.ts`'s `previousWorkingDayKey()` exactly (see the module doc comment
 *  there, and `tools/git-fixtures/scenarios/daily-summary.sh`, which dates its one real commit to
 *  this same day): the panel's own generate button acts on whatever day is picked, and the
 *  "daily-summary" fixture only has commits on this one. */
let pickedDate = ''

When(/^I pick the previous working day in the summaries day picker$/, async () => {
  const now = new Date()
  const dow = now.getDay() // 0 = Sunday, 1 = Monday, … 6 = Saturday
  const daysBack = dow === 1 ? 3 : dow === 0 ? 2 : 1
  const target = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)
  const month = String(target.getMonth() + 1).padStart(2, '0')
  const day = String(target.getDate()).padStart(2, '0')
  pickedDate = `${target.getFullYear()}-${month}-${day}`

  // A native date input takes neither `setValue` nor a plain assignment reliably on this driver —
  // same workaround as the board card's due-date input (board-cards.steps.ts).
  await $('[data-testid="summary-day-input"]').waitForExist({ timeout: 10000 })
  await browser.execute((value: string) => {
    const input = document.querySelector(
      '[data-testid="summary-day-input"]'
    ) as HTMLInputElement | null
    if (!input) throw new Error('the summary day input is not on screen')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, pickedDate)
})

When(/^I generate the briefing from the panel$/, async () => {
  const button = $('[data-testid="summary-generate-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the summaries panel shows a briefing for that day$/, async () => {
  await $(`[data-testid="summary-card-${pickedDate}"]`).waitForDisplayed({ timeout: 20000 })
})

When(/^I delete that briefing$/, async () => {
  await clickViaJs('summary-delete')
})
