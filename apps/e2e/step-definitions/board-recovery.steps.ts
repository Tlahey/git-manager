import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { browser, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'

/**
 * Steps for the disaster-recovery mirror (`features/board-recovery.feature`).
 *
 * The mirror is the one piece of board state that lives **outside** the repository — a bare git repo
 * per board under `$HOME/.git-manager/boards/<repo-slug>/<board-id>.git` — so these steps read the
 * run's own scratch home rather than the fixture. That home is `/tmp/git-manager-e2e-home`
 * (`support/isolatedAppState.ts`), inherited by this worker from the launcher, so nothing here can
 * reach the developer's real backups whatever the machine's `$HOME` is.
 *
 * The slug cannot be recomputed here — `utils.rs`'s `repo_slug` hashes the repository path with
 * Rust's own `DefaultHasher`, which has no Node equivalent — so every step below matches the
 * directory by its readable `<name>-<hash>` prefix instead.
 */

const E2E_HOME = '/tmp/git-manager-e2e-home'

function boardsRoot(): string {
  return join(process.env.HOME ?? E2E_HOME, '.git-manager', 'boards')
}

/** The mirror directories of the fixture this feature uses, whatever hash the slug carries. */
function mirrorDirs(): string[] {
  const root = boardsRoot()
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => name.startsWith('feature-branches-'))
    .map((name) => join(root, name))
}

/** Every bare mirror repository held for that fixture, one per board ever written. */
function mirrorRepos(): string[] {
  return mirrorDirs().flatMap((dir) =>
    readdirSync(dir)
      .filter((entry) => entry.endsWith('.git'))
      .map((entry) => join(dir, entry))
  )
}

/**
 * Drops the mirrors an earlier scenario (or an earlier run) left behind.
 *
 * Nothing else clears them: the mirror deliberately outlives the repository, which is the whole
 * point of it — so every board any board scenario has ever created is still offered for recovery the
 * moment its fixture is rebuilt. This scenario asserts on *which* boards come back, so it has to
 * start from none.
 */
Given(/^no board backup is left over from an earlier run$/, () => {
  for (const dir of mirrorDirs()) rmSync(dir, { recursive: true, force: true })
})

Then(/^the board "([^"]*)" is mirrored outside the repository$/, async (name: string) => {
  const mirrored = () =>
    mirrorRepos().some((repo) => {
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
    timeoutMsg: `no mirror under ${boardsRoot()} holds a board named "${name}" — mirrors: ${JSON.stringify(
      mirrorRepos()
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
