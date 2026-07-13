import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'

// W3C WebDriver key value for Meta (Command on macOS), U+E03D. Built via fromCharCode to keep the
// source ASCII-clean; passed in an array to browser.keys() it presses as a chord — same pattern as
// settings.steps.ts / undo-redo.steps.ts.
const META = String.fromCharCode(0xe03d)

function activeRepoPath(): Promise<string | null> {
  return browser.execute(() => {
    const raw = localStorage.getItem('git-manager-repos-ui')
    return raw ? (JSON.parse(raw).state.activeRepo as string) : null
  })
}

// e2e-only debug hook (main.tsx, VITE_E2E-gated) exposing the live repoUI Zustand store on
// `window`. Reads `selectedCommitOid` directly rather than inferring selection from a DOM
// attribute — a DOM read can't distinguish "React state never changed" from "the DOM just hasn't
// re-rendered yet", which is exactly the ambiguity that made the previous `data-selected` probe
// inconclusive.
function selectedCommitOid(): Promise<string | null> {
  return browser.execute(() => {
    const store = (window as unknown as { __e2eRepoUIStore?: { getState: () => unknown } })
      .__e2eRepoUIStore
    if (!store) return null
    return (store.getState() as { selectedCommitOid: string | null }).selectedCommitOid
  })
}

// Select a commit by ref (e.g. "HEAD~2"): resolve the ref to its full oid off disk (the wdio worker
// runs in Node, like the fixture-build step), then click its graph row. The row testid uses the
// full oid (`graph-row-<oid>`). Selecting it publishes `selectedCommitOid` to the store, which gates
// the palette's commit commands. Waits for that store value directly rather than firing the click
// and moving on — otherwise a slow-to-land React state update (or a click that silently didn't
// register) surfaces 15s later as a baffling "HEAD never moved" failure instead of a clear
// "selection never stuck" one here.
//
// Clicks the row's `message` cell (the commit subject text) rather than the row's geometric center:
// `author`/`date`/`sha` are hidden by default (columns.ts `defaultVisible: false`) — only
// `refs`/`graph`/`message` show — and `graph` defaults to 200px wide, wide enough that a
// normal-width row's center lands inside it (confirmed via elementFromPoint + a live store read),
// not over the message text. `message` is unambiguous, always visible, and non-interactive.
When(/^I select the "([^"]*)" commit in the graph$/, async (ref: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const oid = execFileSync('git', ['-C', repoPath as string, 'rev-parse', ref], {
    encoding: 'utf8',
  }).trim()
  const subject = execFileSync('git', ['-C', repoPath as string, 'log', '-1', '--format=%s', oid], {
    encoding: 'utf8',
  }).trim()

  const row = $(`[data-testid="graph-row-${oid}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  const messageCell = row.$(`span*=${subject}`)
  await messageCell.waitForDisplayed({ timeout: 10000 })
  await messageCell.click()
  try {
    await browser.waitUntil(async () => (await selectedCommitOid()) === oid, {
      timeout: 10000,
      timeoutMsg: `commit row ${oid} (${ref}) never became selected after clicking it`,
    })
  } catch (err) {
    // Diagnostic: reveals *which* commit actually got selected (and, walking up from the hit-tested
    // element, which row visually owns that pixel) so a future regression here is diagnosable
    // without another round of guessing.
    const actualOid = await selectedCommitOid()
    const log = execFileSync('git', ['-C', repoPath as string, 'log', '--format=%H %s', '-n', '20'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .map((line) => {
        const [commitOid, ...rest] = line.split(' ')
        return { oid: commitOid, subject: rest.join(' ') }
      })
    const expectedEntry = log.find((e) => e.oid === oid)
    const actualEntry = actualOid ? log.find((e) => e.oid === actualOid) : null
    const owningRow = await browser.execute((testid: string) => {
      const el = document.querySelector(`[data-testid="${testid}"]`)
      const rect = el?.getBoundingClientRect()
      const atPoint = rect
        ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        : null
      const owner = atPoint?.closest('[data-testid^="graph-row-"]')
      return owner?.getAttribute('data-testid') ?? null
    }, `graph-row-${oid}`)

    throw new Error(
      `${(err as Error).message}\n` +
        `Expected (${ref}): ${oid} "${expectedEntry?.subject ?? '?'}"\n` +
        `Actually selected: ${actualOid ?? 'null'} "${actualEntry?.subject ?? '?'}"\n` +
        `Row owning the clicked pixel: ${owningRow ?? '?'}\n` +
        `Full log:\n${log.map((e, i) => `  [${i}] ${e.oid} ${e.subject}`).join('\n')}`
    )
  }
})

// ⌘K toggles the palette open (useKeyboardShortcuts). The input appearing is the "open" marker.
When(/^I open the command palette$/, async () => {
  await browser.keys([META, 'k'])
  await $('[data-testid="command-palette-input"]').waitForDisplayed({ timeout: 10000 })
})

// Run a palette command by its stable id (`command-item-<id>`). cmdk fires onSelect on click; the
// palette then closes itself and runs the command.
When(/^I run the command palette action "([^"]*)"$/, async (id: string) => {
  const item = $(`[data-testid="command-item-${id}"]`)
  await item.waitForDisplayed({ timeout: 10000 })
  await item.click()
})

Then(/^the command palette is shown$/, async () => {
  await expect($('[data-testid="command-palette-input"]')).toBeDisplayed()
})

// Confirms `selectedCommitOid` actually reached the palette (via the repoUI store) before running a
// commit-scoped action — the "commit" group heading renders the selected commit's short sha
// (commandPalette.group.commit). cmdk renders a group's `heading` prop as text content inside a
// `[cmdk-group-heading]` element (not a data attribute — that only existed in the component's unit
// test fake). If this fails but the row's `data-selected` check upstream passed, the break is
// between the store bridge and the palette rather than the row click itself.
Then(/^the command palette shows commit actions for "([^"]*)"$/, async (ref: string) => {
  const repoPath = await activeRepoPath()
  const shortOid = execFileSync('git', ['-C', repoPath as string, 'rev-parse', '--short', ref], {
    encoding: 'utf8',
  }).trim()
  const heading = $('[cmdk-group-heading]')
  await heading.waitForDisplayed({ timeout: 10000 })
  await expect(heading).toHaveText(shortOid, { containing: true })
})

// A commit-scoped palette action (reset/revert/…) opens the same React dialog the native menu would
// — routed through the `pendingGraphAction` store bridge into GitGraph's own dialog rendering.
Then(/^the reset dialog is shown$/, async () => {
  await expect($('[data-testid="reset-dialog"]')).toBeDisplayed()
})

// Confirm a soft/mixed reset (the confirm button is enabled without the RESET typing gate, which
// only applies to hard resets).
When(/^I confirm the reset$/, async () => {
  const button = $('[data-testid="reset-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the reset confirm button is disabled$/, async () => {
  await expect($('[data-testid="reset-confirm-button"]')).not.toBeEnabled()
})

Then(/^the reset confirm button is enabled$/, async () => {
  await expect($('[data-testid="reset-confirm-button"]')).toBeEnabled()
})

// Hard reset's destructive-action gate (ResetDialog.tsx): the confirm button stays disabled until
// this input's value is exactly "RESET".
When(/^I type "([^"]*)" into the reset confirmation input$/, async (value: string) => {
  const input = $('[data-testid="reset-hard-confirm-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(value)
})

// Soft reset moves HEAD but leaves the index untouched, so the target..oldHEAD diff shows up as a
// staged change — the distinguishing behaviour versus mixed (unstaged) and hard (no diff at all).
Then(/^the working tree has staged changes$/, async () => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const hasStagedDiff = () => {
    const result = execFileSync('git', ['-C', repoPath as string, 'diff', '--cached', '--name-only'], {
      encoding: 'utf8',
    }).trim()
    return result.length > 0
  }
  await browser.waitUntil(hasStagedDiff, {
    timeout: 10000,
    timeoutMsg: 'expected staged changes after a soft reset, found none',
  })
})

// Hard reset resets both the index and the working tree to the target commit — nothing should be
// left staged or unstaged.
Then(/^the working tree is clean$/, async () => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const isClean = () =>
    execFileSync('git', ['-C', repoPath as string, 'status', '--porcelain'], {
      encoding: 'utf8',
    }).trim().length === 0
  await browser.waitUntil(isClean, {
    timeout: 10000,
    timeoutMsg: 'expected a clean working tree after a hard reset, found pending changes',
  })
})

Then(/^the repository HEAD commit subject contains "([^"]*)"$/, async (expected: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const headSubject = () =>
    execFileSync('git', ['-C', repoPath as string, 'log', '-1', '--pretty=%s'], {
      encoding: 'utf8',
    }).trim()
  await browser.waitUntil(() => headSubject().includes(expected), {
    timeout: 15000,
    timeoutMsg: `HEAD subject never contained "${expected}" (last: "${headSubject()}")`,
  })
})

Then(/^the revert dialog is shown$/, async () => {
  await expect($('[data-testid="revert-dialog"]')).toBeDisplayed()
})

// Reverting the tip commit (HEAD) applies cleanly against a single-file linear history like
// rollback-history's — reverting any earlier commit there would conflict (the reverse patch
// expects the file to still hold that commit's content, but a later commit already overwrote it).
When(/^I confirm the revert$/, async () => {
  const button = $('[data-testid="revert-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the create branch dialog is shown$/, async () => {
  await expect($('[data-testid="create-branch-dialog"]')).toBeDisplayed()
})

When(/^I enter the branch name "([^"]*)"$/, async (name: string) => {
  const input = $('[data-testid="create-branch-name-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(name)
})

// Confirms branch creation. `CreateBranchHereDialog`'s "checkout" checkbox defaults to checked, so
// this also checks out the new branch — harmless here since the assertion resolves the branch ref
// directly rather than relying on which branch/HEAD is currently active.
When(/^I confirm the branch creation$/, async () => {
  const button = $('[data-testid="create-branch-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

// Resolves the branch/tag ref's subject off disk rather than re-resolving a relative ref like
// "HEAD~1" — the mutating action above (checkout-on-create, for branches) can change what a
// relative ref means, but the target commit's subject is a stable, unambiguous anchor.
Then(/^the branch "([^"]*)" points at the commit "([^"]*)"$/, async (branch: string, subject: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const actual = execFileSync('git', ['-C', repoPath as string, 'log', '-1', '--format=%s', branch], {
    encoding: 'utf8',
  }).trim()
  expect(actual).toBe(subject)
})

Then(/^the create tag dialog is shown$/, async () => {
  await expect($('[data-testid="tag-dialog"]')).toBeDisplayed()
})

When(/^I enter the tag name "([^"]*)"$/, async (name: string) => {
  const input = $('[data-testid="tag-name-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(name)
})

When(/^I confirm the tag creation$/, async () => {
  const button = $('[data-testid="tag-confirm-button"]')
  await button.waitForEnabled({ timeout: 10000 })
  await button.click()
})

Then(/^the tag "([^"]*)" points at the commit "([^"]*)"$/, async (tag: string, subject: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const actual = execFileSync('git', ['-C', repoPath as string, 'log', '-1', '--format=%s', tag], {
    encoding: 'utf8',
  }).trim()
  expect(actual).toBe(subject)
})

// An annotated tag is its own object (cat-file -t reports "tag"); a lightweight tag is just a ref
// pointing straight at the commit (reports "commit"). This is the real distinguishing proof that
// `annotated: true` took effect, rather than just checking the ref exists.
Then(/^the tag "([^"]*)" is annotated$/, async (tag: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const type = execFileSync('git', ['-C', repoPath as string, 'cat-file', '-t', tag], {
    encoding: 'utf8',
  }).trim()
  expect(type).toBe('tag')
})

// Cherry-pick creates a *new* commit (different oid, same subject) on the target ref rather than
// moving anything — checking `<ref>`'s log for the subject (not oid equality) is the correct proof.
Then(/^the commit "([^"]*)" is reachable from "([^"]*)"$/, async (subject: string, ref: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const subjects = execFileSync('git', ['-C', repoPath as string, 'log', ref, '--format=%s'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
  expect(subjects).toContain(subject)
})

Then(/^the repository has (\d+) stash(?:es)?$/, async (count: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  const stashCount = () => {
    const list = execFileSync('git', ['-C', repoPath as string, 'stash', 'list'], {
      encoding: 'utf8',
    }).trim()
    return list ? list.split('\n').length : 0
  }
  await browser.waitUntil(() => stashCount() === Number(count), {
    timeout: 10000,
    timeoutMsg: `expected ${count} stash(es), found ${stashCount()}`,
  })
})

// stash-stack.sh deliberately leaves staged + unstaged changes to config.yml on top of both
// stashes (for the stash-list/staging scenarios) — but that same leftover diff makes `git stash
// apply`/`pop` fail (a real conflict against config.yml, which the target stash also touches),
// silently, since the palette command only toasts the error rather than throwing. Apply/pop
// scenarios reset the working tree to a clean HEAD first so the stash's patch has nothing to
// conflict with; this only touches the real on-disk repo, not the app's (possibly now-stale)
// status cache, which doesn't matter since the stash rows being selected don't depend on it.
Given(/^the working tree starts clean$/, async () => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  execFileSync('git', ['-C', repoPath as string, 'reset', '--hard', 'HEAD'])
  execFileSync('git', ['-C', repoPath as string, 'clean', '-fd'])
})

// Apply/pop restore the stash's changes onto the working tree — checking for the untracked file
// stash@{0} carries (notes.txt, from stash-stack.sh's `-u` push) sidesteps asserting on config.yml,
// whose content would otherwise need a 3-way merge against the fixture's other leftover changes.
Then(/^the file "([^"]*)" exists in the working tree$/, async (filePath: string) => {
  const repoPath = await activeRepoPath()
  expect(repoPath).toBeTruthy()
  await browser.waitUntil(() => existsSync(join(repoPath as string, filePath)), {
    timeout: 10000,
    timeoutMsg: `expected "${filePath}" to exist in the working tree at ${repoPath}`,
  })
})
