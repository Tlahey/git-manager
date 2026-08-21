import { execFileSync } from 'node:child_process'
import { browser, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { boardMirrorRepos, clearBoardMirrors } from '../support/boardMirrors'

/**
 * Steps for the disaster-recovery mirror (`features/board-recovery.feature`).
 *
 * Where the mirrors are, and why nothing here can reach a developer's own, is `support/boardMirrors.ts`
 * — shared with the `Before` hook, which clears them for every scenario.
 */

const FIXTURE = 'feature-branches'

/**
 * States the precondition this scenario is built on, rather than assuming it.
 *
 * The `Before` hook already clears the mirrors of every fixture, so this is belt to its braces — but
 * a scenario that asserts on *which* boards can be recovered should say out loud that it starts from
 * none, instead of passing because of a hook nothing in its text mentions.
 */
Given(/^no board backup is left over from an earlier run$/, () => {
  clearBoardMirrors()
})

Then(/^the board "([^"]*)" is mirrored outside the repository$/, async (name: string) => {
  const mirrored = () =>
    boardMirrorRepos(FIXTURE).some((repo) => {
      // The mirror keeps one full-state commit per mutation on its own branch, so the board's name
      // is read off that branch's tip tree rather than from a file on disk.
      try {
        const board = execFileSync(
          'git',
          // `MIRROR_BRANCH` in `git_board.rs` — the mirror is a bare repo of its own, so `main`
          // here is the mirror's branch and has nothing to do with the fixture's.
          ['--git-dir', repo, 'show', 'refs/heads/main:board.json'],
          { encoding: 'utf8' }
        )
        return (JSON.parse(board) as { name: string }).name === name
      } catch {
        return false
      }
    })
  await browser.waitUntil(async () => mirrored(), {
    timeout: 15000,
    timeoutMsg: `no mirror holds a board named "${name}" — mirrors: ${JSON.stringify(
      boardMirrorRepos(FIXTURE)
    )}`,
  })
})

/** The recoverable-boards banner's row for `name`, or `null` — the row carries the board's generated
 * id in its button's testid, which no scenario can name. */
function recoverableRestoreTestId(name: string): Promise<string | null> {
  return browser.execute((wanted: string) => {
    const rows = Array.from(
      document.querySelectorAll('[data-testid="recoverable-boards-banner"] li')
    )
    const hit = rows.find((row) => (row.textContent ?? '').includes(wanted))
    return (
      hit
        ?.querySelector('[data-testid^="recoverable-board-restore-"]')
        ?.getAttribute('data-testid') ?? null
    )
  }, name)
}

Then(/^the board "([^"]*)" is offered for recovery$/, async (name: string) => {
  await browser.waitUntil(async () => (await recoverableRestoreTestId(name)) !== null, {
    timeout: 20000,
    timeoutMsg: `the board view never offered "${name}" for recovery`,
  })
})

Then(
  /^the recovery offer for "([^"]*)" says it holds (\d+) cards?$/,
  async (name: string, rawCount: string) => {
    const testid = await recoverableRestoreTestId(name)
    if (!testid) throw new Error(`the board view offers no recovery for "${name}"`)
    const detail = $(
      `[data-testid="${testid.replace('recoverable-board-restore-', 'recoverable-board-detail-')}"]`
    )
    await detail.waitForDisplayed({ timeout: 10000 })
    // On the count only: the date beside it is rendered in the machine's locale, and pinning that
    // would pin the run to one. That it is *there* is what the row needed.
    const said = (await detail.getText()).trim()
    if (!said.includes(String(rawCount))) {
      throw new Error(`the recovery row for "${name}" reads "${said}", which names no ${rawCount}`)
    }
  }
)

Then(/^no board is offered for recovery any more$/, async () => {
  await $('[data-testid="recoverable-boards-banner"]').waitForExist({
    reverse: true,
    timeout: 20000,
  })
})

When(/^I restore the board "([^"]*)"$/, async (name: string) => {
  const testid = await recoverableRestoreTestId(name)
  if (!testid) throw new Error(`the board view offers no recovery for "${name}"`)
  await $(`[data-testid="${testid}"]`).click()
  // Restoring makes the board the active one (`useRecoverableBoards.restoreBoard`), which is what
  // the assertions after this step read — and the banner drops it on its next read.
  await $('[data-testid="create-board-button"]').waitForDisplayed({ timeout: 20000 })
})
