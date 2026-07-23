import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, expect, $ } from '@wdio/globals'
import { When, Then } from '@wdio/cucumber-framework'

function activeRepoPath(): Promise<string | null> {
  return browser.execute(() => {
    const raw = localStorage.getItem('git-manager-repos-ui')
    return raw ? (JSON.parse(raw).state.activeRepo as string) : null
  })
}

async function repoPath(): Promise<string> {
  const path = await activeRepoPath()
  expect(path).toBeTruthy()
  return path as string
}

function revParse(repo: string, ref: string): string {
  return execFileSync('git', ['-C', repo, 'rev-parse', ref], { encoding: 'utf8' }).trim()
}

function subjectOf(repo: string, oid: string): string {
  return execFileSync('git', ['-C', repo, 'log', '-1', '--format=%s', oid], {
    encoding: 'utf8',
  }).trim()
}

function bisectLog(repo: string): string {
  const file = join(repo, '.git', 'BISECT_LOG')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

function bisectActive(repo: string): boolean {
  return existsSync(join(repo, '.git', 'BISECT_START'))
}

// Radix `DropdownMenu.Trigger` opens on `pointerdown` (unlike `Popover.Trigger`, which opens on
// `click` and works with a plain WDIO `.click()`). WDIO's click endpoint doesn't deliver a
// pointerdown Radix reacts to in this WKWebView provider, so dispatch a real pointer sequence to
// open the menu. Radix ignores the trigger's own pointerup for closing, so down+up leaves it open.
async function openDropdown(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`openDropdown: no element with data-testid="${id}"`)
    const opts = { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true }
    el.dispatchEvent(new PointerEvent('pointerdown', opts))
    el.dispatchEvent(new PointerEvent('pointerup', opts))
  }, testid)
}

// Radix `DropdownMenu.Item` fires `onSelect` from its composed `onClick`, so a synthetic DOM click
// selects it — unlike opening the menu, this needs no pointer dance.
async function clickViaJs(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`clickViaJs: no element with data-testid="${id}"`)
    el.click()
  }, testid)
}

// The bisect UI store, exposed on window under VITE_E2E (main.tsx). Row clicks are intercepted
// during setup, so a filled slot — not repoUI's `selectedCommitOid` — is the reliable signal.
function pendingSlotOid(kind: 'bad' | 'good'): Promise<string | null> {
  return browser.execute((k: 'bad' | 'good') => {
    const store = (
      window as unknown as {
        __e2eBisectUIStore?: {
          getState: () => { pendingBadOid: string | null; pendingGoodOid: string | null }
        }
      }
    ).__e2eBisectUIStore
    if (!store) return null
    const state = store.getState()
    return k === 'bad' ? state.pendingBadOid : state.pendingGoodOid
  }, kind)
}

When(/^I start a bisect from the tools menu$/, async () => {
  await $('[data-testid="toolbar-tools-button"]').waitForDisplayed({ timeout: 10000 })
  await openDropdown('toolbar-tools-button')
  const item = $('[data-testid="tools-menu-bisect"]')
  await item.waitForDisplayed({ timeout: 10000 })
  await clickViaJs('tools-menu-bisect')
  await $('[data-testid="bisect-setup-banner"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the bisect setup bar is shown$/, async () => {
  await expect($('[data-testid="bisect-setup-banner"]')).toBeDisplayed()
})

When(/^I cancel the bisect setup$/, async () => {
  await $('[data-testid="bisect-setup-cancel"]').click()
})

Then(/^the bisect setup bar is not shown$/, async () => {
  await $('[data-testid="bisect-setup-banner"]').waitForDisplayed({
    reverse: true,
    timeout: 10000,
  })
})

// Focus the target slot, then click the commit's row (its message cell — the reliable target, per
// command-palette.steps.ts) to fill it. The click is intercepted by the setup, so we confirm the
// pick landed by reading the slot's oid from the exposed store rather than the selection bridge.
When(/^I pick the "([^"]*)" commit as the "(bad|good)" commit$/, async (ref: string, kind: string) => {
  const repo = await repoPath()
  const oid = revParse(repo, ref)
  const subject = subjectOf(repo, oid)

  await $(`[data-testid="bisect-slot-${kind}"]`).click()
  const row = $(`[data-testid="graph-row-${oid}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  const messageCell = row.$(`span*=${subject}`)
  await messageCell.waitForDisplayed({ timeout: 10000 })
  await messageCell.click()

  await browser.waitUntil(async () => (await pendingSlotOid(kind as 'bad' | 'good')) === oid, {
    timeout: 10000,
    timeoutMsg: `the ${kind} slot never took commit ${oid} (${ref}) after clicking its row`,
  })
})

Then(/^the bisect setup reports an invalid range$/, async () => {
  await $('[data-testid="bisect-setup-invalid-range"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the bisect cannot be started$/, async () => {
  await expect($('[data-testid="bisect-setup-validate"]')).not.toBeEnabled()
})

// The start button only enables once the range check resolves valid, so wait for it before clicking.
When(/^I start the bisect$/, async () => {
  const validate = $('[data-testid="bisect-setup-validate"]')
  await validate.waitForEnabled({ timeout: 10000 })
  await validate.click()
})

Then(/^a bisect is in progress$/, async () => {
  const repo = await repoPath()
  await browser.waitUntil(() => bisectActive(repo), {
    timeout: 15000,
    timeoutMsg: 'git bisect never started on disk (.git/BISECT_START missing)',
  })
  await $('[data-testid="bisect-banner"]').waitForDisplayed({ timeout: 10000 })
})

// Drives a real bisect to completion: at each step, read the commit currently checked out and mark
// it bad if it carries the seeded bug line, good otherwise — exactly what a developer would decide
// by testing the build. Bounded loop so a stuck bisect fails here rather than hanging the suite.
When(/^I bisect by testing for the bug until the first bad commit is found$/, async () => {
  const repo = await repoPath()
  for (let step = 0; step < 8; step++) {
    if (bisectLog(repo).includes('first bad commit')) break

    const appContent = readFileSync(join(repo, 'app.txt'), 'utf8')
    const testId = appContent.includes('BUG introduced here')
      ? 'bisect-bad-button'
      : 'bisect-good-button'

    const headBefore = revParse(repo, 'HEAD')
    const button = $(`[data-testid="${testId}"]`)
    await button.waitForDisplayed({ timeout: 10000 })
    await button.click()

    await browser.waitUntil(
      () => revParse(repo, 'HEAD') !== headBefore || bisectLog(repo).includes('first bad commit'),
      { timeout: 10000, timeoutMsg: 'bisect did not advance after marking the current commit' }
    )
  }
  await $('[data-testid="bisect-result-banner"]').waitForDisplayed({ timeout: 10000 })
})

Then(/^the first bad commit is "([^"]*)"$/, async (subject: string) => {
  const repo = await repoPath()
  const line = bisectLog(repo)
    .split('\n')
    .find((l) => l.startsWith('# first bad commit:'))
  expect(line).toBeTruthy()
  expect(line as string).toContain(subject)
})

When(/^I abort the bisect$/, async () => {
  await $('[data-testid="bisect-abort-button"]').click()
})

Then(/^no bisect is in progress$/, async () => {
  const repo = await repoPath()
  await browser.waitUntil(() => !bisectActive(repo), {
    timeout: 15000,
    timeoutMsg: 'git bisect was still active on disk (.git/BISECT_START present) after abort',
  })
  await expect($('[data-testid="bisect-banner"]')).not.toBeDisplayed()
})
