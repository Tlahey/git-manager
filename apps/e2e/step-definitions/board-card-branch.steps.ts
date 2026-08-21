import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'
import { clickViaJs } from '../support/interactions'
import { git, storedCardTitled, storedCardTitledOrThrow } from '../support/board'

/**
 * Steps for the card's branch section (`features/board-card-branch.feature`) — creating the branch a
 * card is about, giving it a worktree, and the sweep that moves a card to its done column when its
 * branch is merged.
 *
 * The board-level steps come from `board.steps.ts`, the record-level ones from
 * `board-cards.steps.ts`, and the merge itself is driven with `command-palette.steps.ts`'s own
 * palette steps — this feature is the seam between the board and the graph, so it borrows from both
 * rather than restating either.
 *
 * Everything here ends on git. A card that *says* it has a branch and a repository that has none is
 * exactly the failure this section can produce, and only one of the two is visible in the DOM.
 */

/** Where the board puts a card's worktree — `lib/worktreePath.ts`'s `defaultWorktreePath`, which
 * hangs it off a `<repo>.worktrees/` sibling rather than nesting it inside the repository. */
function worktreePathFor(branch: string): string {
  return `${getActiveRepoPath().replace(/\/+$/, '')}.worktrees/${branch}`
}

/**
 * Removes a worktree directory an earlier run left behind.
 *
 * `fixture_init` wipes the fixture's own directory and nothing else (`tools/git-fixtures/lib.sh`),
 * and the board's default worktree path is deliberately a **sibling** of it — so the directory
 * outlives the repository that owned it, and `git worktree add` refuses a destination that already
 * exists. Without this the scenario passes exactly once per machine.
 */
Given(/^no worktree is left over for the branch "([^"]*)"$/, (branch: string) => {
  // Resolved from the fixture root rather than `getActiveRepoPath()`: this step runs *before* the
  // fixture is opened, so nothing has recorded the active repo yet.
  rmSync(`/tmp/git-manager-fixtures/feature-branches.worktrees/${branch}`, {
    recursive: true,
    force: true,
  })
})

/**
 * Back to the graph — the third segment of the same view switcher `board.steps.ts` and
 * `file-explorer.steps.ts` click, kept here because this is the only feature that has to *leave* the
 * board mid-scenario: the branch context and the ⌘K ref commands are graph-view chrome (a board
 * never reads the checked-out branch, see CLAUDE.md), so the merge cannot be run from where the card
 * lives.
 */
When(/^I open the commit graph$/, async () => {
  await clickViaJs('repo-view-graph')
  await $('[data-testid="commit-graph"]').waitForDisplayed({ timeout: 15000 })
})

// ─── The card's branch ─────────────────────────────────────────────────────

When(/^I create a branch for the card$/, async () => {
  await clickViaJs('board-card-create-branch')
  // The section swaps its single "Create branch" button for the linked-branch row, which is the
  // record having re-read the card — the precondition for the worktree action below.
  await $('[data-testid="board-card-checkout-branch"]').waitForDisplayed({ timeout: 20000 })
})

When(/^I unlink the branch from the card$/, async () => {
  await clickViaJs('board-card-unlink-branch')
  await $('[data-testid="board-card-create-branch"]').waitForDisplayed({ timeout: 20000 })
})

When(/^I create a worktree for the card$/, async () => {
  await clickViaJs('board-card-create-worktree')
  await $('[data-testid="board-card-unlink-worktree"]').waitForDisplayed({ timeout: 30000 })
})

Then(/^the card record shows the linked branch "([^"]*)"$/, async (branch: string) => {
  await browser.waitUntil(
    async () =>
      (
        (await browser.execute(
          () =>
            document.querySelector('[data-testid="board-card-branch-section"]')?.textContent ?? ''
        )) ?? ''
      ).includes(branch),
    { timeout: 15000, timeoutMsg: `the card record never showed "${branch}" as its branch` }
  )
})

Then(/^the card record offers to create a branch$/, async () => {
  await expect($('[data-testid="board-card-create-branch"]')).toBeDisplayed()
})

Then(/^the card record shows a linked worktree$/, async () => {
  await expect($('[data-testid="board-card-unlink-worktree"]')).toBeDisplayed()
})

// ─── What git says ─────────────────────────────────────────────────────────

Then(/^the branch "([^"]*)" exists in the repository$/, async (branch: string) => {
  await browser.waitUntil(
    () => git('branch', '--list', branch).trim().length > 0,
    // Polled rather than read once: the branch is created by a real IPC round trip the click above
    // only starts.
    { timeout: 15000, timeoutMsg: `the repository has no branch "${branch}"` }
  )
})

Then(/^the repository has "([^"]*)" checked out$/, async (branch: string) => {
  await browser.waitUntil(() => git('rev-parse', '--abbrev-ref', 'HEAD').trim() === branch, {
    timeout: 15000,
    timeoutMsg: `HEAD is on "${git('rev-parse', '--abbrev-ref', 'HEAD').trim()}", not "${branch}"`,
  })
})

Then(/^the repository has a worktree for the branch "([^"]*)"$/, async (branch: string) => {
  const path = worktreePathFor(branch)
  await browser.waitUntil(
    () =>
      git('worktree', 'list', '--porcelain')
        .split('\n')
        .some((line) => line.startsWith('worktree ') && line.endsWith(path)),
    {
      timeout: 20000,
      timeoutMsg: `git lists no worktree at ${path} — it lists ${JSON.stringify(
        git('worktree', 'list', '--porcelain')
      )}`,
    }
  )
})

/**
 * Commits on the branch the card just created, directly on disk.
 *
 * Scaffolding for the merge scenario, and deliberately not driven through the UI: what is being
 * tested there is the *sweep* a merge triggers, not committing — which `commit.feature` already
 * covers. The branch is the checked-out one (creating it from a card checks it out), so a plain
 * commit lands on it.
 */
Given(/^the branch "([^"]*)" has its own commit "([^"]*)"$/, (branch: string, subject: string) => {
  const repoPath = getActiveRepoPath()
  const head = execFileSync('git', ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
  }).trim()
  if (head !== branch) {
    throw new Error(`expected "${branch}" to be checked out for this commit, but HEAD is "${head}"`)
  }
  execFileSync('bash', ['-c', `echo "exported" > "${repoPath}/exporter.txt"`])
  execFileSync('git', ['-C', repoPath, 'add', 'exporter.txt'])
  execFileSync('git', ['-C', repoPath, 'commit', '-q', '-m', subject])
})

// ─── What the board stores ─────────────────────────────────────────────────

async function waitForStoredBranch(
  title: string,
  holds: (linkedBranch: string | undefined) => boolean,
  what: string
): Promise<void> {
  try {
    await browser.waitUntil(
      async () => {
        const card = storedCardTitled(title)
        return card !== null && holds(card.linkedBranch)
      },
      { timeout: 15000 }
    )
  } catch {
    throw new Error(
      `the stored card "${title}" is not ${what} — it holds ${JSON.stringify(
        storedCardTitledOrThrow(title).linkedBranch ?? null
      )}`
    )
  }
}

Then(
  /^the card "([^"]*)" is stored on the branch "([^"]*)"$/,
  async (title: string, branch: string) => {
    await waitForStoredBranch(title, (linked) => linked === branch, `stored on "${branch}"`)
  }
)

Then(/^the card "([^"]*)" is stored with no branch$/, async (title: string) => {
  await waitForStoredBranch(title, (linked) => !linked, 'stored without a branch')
})

Then(/^the card "([^"]*)" is stored with a worktree of its own$/, async (title: string) => {
  try {
    await browser.waitUntil(async () => Boolean(storedCardTitled(title)?.linkedWorktreePath), {
      timeout: 20000,
    })
  } catch {
    throw new Error(
      `the stored card "${title}" holds no linked worktree — it holds ${JSON.stringify(
        storedCardTitledOrThrow(title).linkedWorktreePath ?? null
      )}`
    )
  }
})
