import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { browser, expect, $, $$ } from '@wdio/globals'
import { After, Given, When, Then } from '@wdio/cucumber-framework'

// "When I expand the ... sidebar section" is shared — see stash.steps.ts.
// "When I reload the application" is shared — see settings.steps.ts.

const REPO_PATH = '/tmp/git-manager-fixtures/worktree-repo'
const LINKED_WORKTREE_PATH = '/tmp/git-manager-fixtures/worktree-repo-linked'

// Set by "I set the worktree path to a fresh temporary directory" — read back by the "on disk"
// assertion, since a fresh mkdtemp path is only known at run time.
let addedWorktreePath = ''

// The add-worktree button (SectionHeader's hover-revealed `action` slot) and the per-row remove
// button both use `opacity-0 group-hover:opacity-100` — real hover-only affordances in production,
// but this embedded WebKit provider's `isDisplayed()` follows the classic Selenium algorithm, which
// treats `opacity: 0` as NOT displayed (unlike `display`/`visibility`, opacity IS part of that
// check). `waitForDisplayed`/`.click()` on these elements times out even though they're really in
// the DOM and perfectly clickable — clicking via injected JS bypasses the visibility gate entirely,
// same technique this suite already uses for real-second-window click quirks (see fixup.steps.ts's
// `clickViaJs`).
async function clickViaJs(testid: string) {
  const el = $(`[data-testid="${testid}"]`)
  await el.waitForExist({ timeout: 10000 })
  await browser.execute((id: string) => {
    const target = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!target) throw new Error(`clickViaJs: no element with data-testid="${id}"`)
    target.click()
  }, testid)
}

// Radix's DropdownMenuTrigger opens on `pointerdown`, not `click` — a synthetic `el.click()` fires
// only a click event, so clickViaJs leaves the menu shut and the items never render. Dispatch a real
// primary-button pointer sequence instead (Radix ignores anything with `button !== 0` or ctrlKey).
async function openMenuViaJs(testid: string) {
  const el = $(`[data-testid="${testid}"]`)
  await el.waitForExist({ timeout: 10000 })
  await browser.execute((id: string) => {
    const target = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!target) throw new Error(`openMenuViaJs: no element with data-testid="${id}"`)
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      target.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, ctrlKey: false })
      )
    }
  }, testid)
}

async function worktreeRowHasBranch(branchName: string): Promise<boolean> {
  const rows = await $$('[data-testid^="worktree-item-"]')
  for (const row of rows) {
    if ((await row.getText()).includes(branchName)) return true
  }
  return false
}

// Finds a worktree row by its branch label rather than by its exact path — the path git reports
// via `worktree list --porcelain` can differ from the literal fixture-script string (on macOS,
// `/tmp` is itself a symlink to `/private/tmp`, and git canonicalizes worktree paths), so matching
// on branch text is the robust option; matching on the exact `worktree-item-<path>` testid isn't.
async function findWorktreeRowByBranch(branchName: string) {
  // Waits rather than querying once: the rows come from the `list_worktrees` query, so right after
  // an app reload (the dirty-worktree scenario) the section can be expanded and still empty for a
  // moment — a one-shot query there fails with a "no such worktree" error that looks like a
  // missing worktree rather than a race.
  await browser.waitUntil(() => worktreeRowHasBranch(branchName), {
    timeout: 10000,
    timeoutMsg: `No worktree row found for branch "${branchName}"`,
  })
  const rows = await $$('[data-testid^="worktree-item-"]')
  for (const row of rows) {
    if ((await row.getText()).includes(branchName)) return row
  }
  throw new Error(`No worktree row found for branch "${branchName}"`)
}

Then(/^the sidebar lists a worktree for branch "([^"]*)"$/, async (branchName: string) => {
  await browser.waitUntil(() => worktreeRowHasBranch(branchName), {
    timeout: 10000,
    timeoutMsg: `No worktree row found for branch "${branchName}"`,
  })
})

Then(
  /^the sidebar no longer lists a worktree for branch "([^"]*)"$/,
  async (branchName: string) => {
    await browser.waitUntil(async () => !(await worktreeRowHasBranch(branchName)), {
      timeout: 10000,
      timeoutMsg: `Worktree row for branch "${branchName}" is still present`,
    })
  }
)

When(/^I click the add-worktree button$/, async () => {
  // Click-then-recheck rather than click-then-wait: a click dispatched during a sidebar
  // re-render occasionally lands on nothing (measured in full runs — the dialog never mounted
  // while the same step passes reliably in isolation). Radix's DialogTrigger is open-only, so a
  // repeated click on the trigger is idempotent and safe.
  const dialog = $('[data-testid="worktree-add-dialog"]')
  await browser.waitUntil(
    async () => {
      if (await dialog.isDisplayed().catch(() => false)) return true
      await clickViaJs('worktree-add-button')
      return dialog.isDisplayed().catch(() => false)
    },
    { timeout: 10000, interval: 500, timeoutMsg: 'worktree-add-dialog never opened' }
  )
})

// The branch picker is no longer a native `<select>` (so no `selectByAttribute`): the "searchable
// base-branch picker" change replaced it with `BranchCombobox` — a button that toggles an inline
// cmdk list. The testid stayed on the trigger, which is why this kept "finding" the control and
// only failed on the option lookup.
When(/^I set the worktree branch to "([^"]*)"$/, async (branchName: string) => {
  const trigger = $('[data-testid="worktree-add-branch-select"]')
  await trigger.waitForDisplayed({ timeout: 10000 })
  await trigger.click()
  const option = $(`[data-testid="worktree-add-branch-option-${branchName}"]`)
  await option.waitForDisplayed({ timeout: 10000 })
  await option.click()
  await expect(trigger).toHaveText(branchName, { containing: true })
})

When(/^I set the worktree path to a fresh temporary directory$/, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-manager-e2e-worktree-'))
  addedWorktreePath = join(dir, 'wt')
  const input = $('[data-testid="worktree-add-path-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(addedWorktreePath)
})

When(/^I confirm the add-worktree dialog$/, async () => {
  const button = $('[data-testid="worktree-add-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the fixture repo has a worktree at that path on disk$/, () => {
  const list = execFileSync('git', ['-C', REPO_PATH, 'worktree', 'list', '--porcelain'], {
    encoding: 'utf8',
  })
  expect(list).toContain(addedWorktreePath)
})

// Removal moved behind a per-row "⋮" dropdown when the workspace view / bulk-cleanup work landed —
// there's no inline `worktree-remove-button-<path>` any more. The "⋮" trigger is the hover-revealed
// element now, so it needs the injected-event treatment (and specifically `openMenuViaJs`, since a
// plain synthetic click won't open a Radix menu); the item inside the open menu is fully visible and
// takes an ordinary click.
When(/^I click the remove button for the linked worktree$/, async () => {
  const row = await findWorktreeRowByBranch('feature/login')
  const trigger = row.$('[data-testid^="worktree-actions-button-"]')
  await trigger.waitForExist({ timeout: 10000 })
  // Read the exact testid off the DOM (sidesteps the path-canonicalization mismatch
  // findWorktreeRowByBranch also avoids) rather than passing the element itself into
  // browser.execute: an un-awaited ChainablePromiseElement doesn't serialize into a real element
  // reference on the remote end (`el.click is not a function` — el arrives undefined/non-element),
  // unlike a plain string, which clickViaJs re-queries via document.querySelector in-page instead.
  const testid = await trigger.getAttribute('data-testid')
  if (!testid) throw new Error('Worktree actions button has no data-testid attribute')
  await openMenuViaJs(testid)

  const removeItem = $(
    `[data-testid="${testid.replace('worktree-actions-button-', 'worktree-remove-')}"]`
  )
  // Same click-then-recheck shape as the add button above, staged because this path has two
  // fallible dispatches (the menu's pointerdown toggle, then the item click). Each pass only
  // re-opens the menu when it actually closed, so the toggle can't be flipped shut by a retry.
  const dialog = $('[data-testid="worktree-remove-dialog"]')
  await browser.waitUntil(
    async () => {
      if (await dialog.isDisplayed().catch(() => false)) return true
      if (!(await removeItem.isDisplayed().catch(() => false))) await openMenuViaJs(testid)
      if (await removeItem.isDisplayed().catch(() => false)) await removeItem.click()
      return dialog.isDisplayed().catch(() => false)
    },
    { timeout: 10000, interval: 500, timeoutMsg: 'worktree-remove-dialog never opened' }
  )
})

When(/^I confirm the remove-worktree dialog$/, async () => {
  const button = $('[data-testid="worktree-remove-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

When(/^I check the force-remove checkbox$/, async () => {
  // Same opacity-0 input as above — go through the injected click rather than the driver's.
  await clickViaJs('worktree-remove-force-checkbox')
})

Then(/^the remove-worktree dialog warns about uncommitted changes$/, async () => {
  const button = $('[data-testid="worktree-remove-confirm-button"]')
  await button.waitForDisplayed({ timeout: 10000 })
  await expect(button).not.toBeEnabled()
  // `waitForExist`, not `toBeDisplayed`: `Checkbox` renders its real <input> at `opacity-0` on
  // purpose (checkbox.tsx says it must never go back to `sr-only`, which would clip it to 1px and
  // shrink the hit area), and this WebKit provider's isDisplayed() follows the classic Selenium
  // algorithm, where opacity 0 counts as not displayed — the same gotcha `clickViaJs` above exists
  // for. The element is really there and really clickable.
  await $('[data-testid="worktree-remove-force-checkbox"]').waitForExist({ timeout: 10000 })
  // Assert the warning the user actually reads, which a display check on a transparent input never
  // covered: this is what makes the step live up to its name.
  await expect($('[data-testid="worktree-remove-dialog"]')).toHaveText(
    'This worktree has uncommitted changes. Removing it will discard them.',
    { containing: true }
  )
})

Then(/^the fixture repo no longer has the linked worktree on disk$/, async () => {
  // Matched on the basename, not the full LINKED_WORKTREE_PATH string — git may report a
  // canonicalized path (e.g. /private/tmp/... on macOS) that differs from the literal string the
  // fixture script passed to `git worktree add`.
  await browser.waitUntil(
    () => {
      const list = execFileSync('git', ['-C', REPO_PATH, 'worktree', 'list', '--porcelain'], {
        encoding: 'utf8',
      })
      return !list.includes('worktree-repo-linked')
    },
    { timeout: 10000, timeoutMsg: 'The linked worktree is still registered with git' }
  )
  // existsSync follows symlinks at the OS level, so the literal /tmp/... string is fine here.
  expect(existsSync(LINKED_WORKTREE_PATH)).toBe(false)
})

// Directly modifies the file `feature/login`'s own commit added — login.txt, tracked in the linked
// worktree — before the app (re)loads, so the sidebar's first `list_worktrees` fetch already
// reflects the dirty state (the query result isn't invalidated by a later reload — only the fetch
// timing matters, so this runs before the reload, not after).
Given(/^the linked worktree has uncommitted changes$/, () => {
  writeFileSync(join(LINKED_WORKTREE_PATH, 'login.txt'), 'login screen, modified\n')
})

// ─── AI-agent activity ────────────────────────────────────────────────────────
//
// `get_worktree_agent_activity` (commands/agent.rs) has no cooperation from the agent: it reads
// Claude Code's own session store, `$HOME/.claude/projects/<slug>/*.jsonl`, and calls a worktree
// "working" when the newest transcript there was written in the last 60 seconds (see
// services/agent_session.rs). So the only way to fixture it is to be that store — write a
// transcript where the app is about to look, with a fresh mtime.
//
// `$HOME`, emphatically not the developer's home: `useIsolatedHome()` repoints it at
// `/tmp/git-manager-e2e-home` for the whole run (support/isolatedAppState.ts), the app is a child
// of that process, and the Rust side resolves the session root from `HOME` before anything else.
// Reading `process.env.HOME` here rather than `os.homedir()` makes that agreement explicit instead
// of relying on Node happening to prefer the same variable — get it wrong and this step writes
// into somebody's real `~/.claude/projects` while the app looks somewhere else entirely.

/** Claude Code's project-directory slug: every `/` and `.` in the absolute path becomes `-`.
 *  Mirrors `claude_project_slug` in services/agent_session.rs — the two must agree or the app
 *  looks in a directory this step never wrote to. */
function claudeProjectSlug(worktreePath: string): string {
  return worktreePath.replace(/[/.]/g, '-')
}

/**
 * Both spellings of a fixture path.
 *
 * The app asks about the path *git* reports for a worktree, and on macOS `/tmp` is a symlink to
 * `/private/tmp`, which git canonicalizes — so the string the fixture script used and the string
 * the backend receives are usually not the same, and only one of them produces the right slug.
 * Seeding both costs an empty directory and removes the guesswork.
 */
function pathVariants(worktreePath: string): string[] {
  const variants = new Set([worktreePath])
  try {
    variants.add(realpathSync(worktreePath))
  } catch {
    // Not on disk (a scenario that never built the fixture) — the literal path is all there is.
  }
  return [...variants]
}

/** Session directories this run created, so the After hook removes those and nothing else. */
const seededAgentSessionDirs: string[] = []

/** The run's isolated home — the same string the app process resolves its session store from. */
function agentSessionHome(): string {
  return process.env.HOME ?? homedir()
}

/** Writes (or re-stamps) a transcript so the worktree reads as an agent actively at work. */
function seedAgentSession(worktreePath: string): void {
  for (const variant of pathVariants(worktreePath)) {
    const dir = join(agentSessionHome(), '.claude', 'projects', claudeProjectSlug(variant))
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      seededAgentSessionDirs.push(dir)
    }
    const transcript = join(dir, 'e2e-session.jsonl')
    // Shaped like a real transcript line, though nothing reads the contents — only the mtime of
    // the newest `.jsonl` in the directory decides the reported state.
    writeFileSync(transcript, `{"type":"assistant","text":"e2e fixture session"}\n`)
    const now = new Date()
    utimesSync(transcript, now, now)
  }
}

Given(/^an AI coding agent is working in the linked worktree$/, () => {
  seedAgentSession(LINKED_WORKTREE_PATH)
})

Then(/^the graph marks the linked worktree as having an agent at work$/, async () => {
  // Re-stamp first: "working" is a 60-second window from the transcript's mtime, and the steps
  // between the seed and here include a full app reload. A tag that had aged into `idle` would
  // still pass a laxer assertion while quietly documenting the wrong state.
  seedAgentSession(LINKED_WORKTREE_PATH)
  const tag = $('[data-testid="agent-status-tag"][data-state="working"]')
  // The hook polls every three seconds, so this waits out at least two polls before giving up.
  await tag.waitForDisplayed({
    timeout: 20000,
    timeoutMsg:
      'No working-agent tag ever appeared on a WIP row — check that the fabricated session directory matches the path git reports for the worktree',
  })
  expect(await tag.getAttribute('data-agent')).toBe('claude')
})

/**
 * Removes only the session directories this run created.
 *
 * Belt and braces on top of the isolated `$HOME`: if that isolation ever stops applying — a step
 * run outside the harness, a future config change — this still deletes by recorded path, and only
 * where the directory did not already exist, rather than anything matching a pattern under
 * `.claude/projects`. That directory holds real transcripts on a developer's machine.
 */
After({ tags: '@agentactivity' }, () => {
  while (seededAgentSessionDirs.length > 0) {
    const dir = seededAgentSessionDirs.pop()!
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // A leftover fixture directory is inert; failing a passing scenario over it is not worth it.
    }
  }
})
