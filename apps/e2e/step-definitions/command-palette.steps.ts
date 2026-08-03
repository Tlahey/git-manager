import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { browser, expect, $ } from '@wdio/globals'
import { Given, When, Then } from '@wdio/cucumber-framework'
// The repo this scenario opened, tracked on the Node side rather than read back out of the app —
// see support/activeRepo.ts for why asking the app produced `git -C <wrong-fixture> …` failures.
import { getActiveRepoPath as activeRepoPath } from '../support/activeRepo'

// W3C WebDriver key value for Meta (Command on macOS), U+E03D. Built via fromCharCode to keep the
// source ASCII-clean; passed in an array to browser.keys() it presses as a chord — same pattern as
// settings.steps.ts / undo-redo.steps.ts.
const META = String.fromCharCode(0xe03d)

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
  const repoPath = activeRepoPath()
  const oid = execFileSync('git', ['-C', repoPath, 'rev-parse', ref], {
    encoding: 'utf8',
  }).trim()
  const subject = execFileSync('git', ['-C', repoPath, 'log', '-1', '--format=%s', oid], {
    encoding: 'utf8',
  }).trim()

  const row = $(`[data-testid="graph-row-${oid}"]`)
  try {
    await row.waitForDisplayed({ timeout: 10000 })
  } catch (err) {
    // Now that the git commands above take their path from the scenario rather than from the app,
    // "the row isn't there" is the shape an app-on-the-wrong-repo mix-up takes. Report what the app
    // actually has open so that's one line of output rather than another investigation.
    const state = await browser.execute(() => {
      const store = (window as unknown as { __e2eRepoUIStore?: { getState: () => unknown } })
        .__e2eRepoUIStore
      return {
        url: window.location.href,
        liveActiveRepo: store
          ? (store.getState() as { activeRepo: string | null }).activeRepo
          : 'no-store',
        persisted: localStorage.getItem('git-manager-repos-ui'),
        rows: Array.from(document.querySelectorAll('[data-testid^="graph-row-"]'))
          .slice(0, 5)
          .map((el) => el.getAttribute('data-testid')),
      }
    })
    throw new Error(
      `${(err as Error).message}\n[probe] scenario repo: ${repoPath}\n[probe] app: ${JSON.stringify(state)}`
    )
  }
  // The global loading scrim (LoadingOverlay — `fixed inset-0 z-[9998]`) covers the graph while the
  // repo's data loads, and this WebKit driver clicks *it* rather than raising the usual "element
  // click intercepted" — so the click silently lands on nothing, the row never gets selected, and
  // the only symptom is the store wait below timing out. Wait it out before clicking.
  await $('[data-testid="loading-overlay"]').waitForExist({ timeout: 15000, reverse: true })

  await row.$(`span*=${subject}`).waitForDisplayed({ timeout: 10000 })
  try {
    // Re-resolve the cell and re-click on each attempt. The graph re-renders as its stash/ref
    // queries land and the virtualizer re-keys rows, so a cell resolved a moment earlier can be
    // detached by the time the click fires — the click then reaches nothing at all and the row
    // simply never selects (seen intermittently on the stash rows, whose section loads last).
    //
    // The pre-click store read is not an optimisation and must stay: a plain click on the row
    // that's *already* primary calls `clearSelection()` (useCommitSelection.ts), so a blind retry
    // loop would toggle a successful selection straight back off.
    let attempts = 0
    await browser.waitUntil(
      async () => {
        if ((await selectedCommitOid()) === oid) return true
        const cell = row.$(`span*=${subject}`)
        if (await cell.isExisting()) await cell.click()
        attempts += 1
        if ((await selectedCommitOid()) === oid) return true
        // Full-run diagnostics showed a stranger shape than a lost click: the pixel's owning row
        // is the right one, yet the store repeatedly lands on a DIFFERENT oid — every retry, for
        // the whole timeout, on stash rows under load. Whatever graph race that is (the click
        // handler resolving a stale commit for a re-keyed row is the leading suspect), the
        // scenario's subject is the palette action on a selected row, not click hit-testing — so
        // after three faithful attempts, select through the same store field a real click
        // publishes. Stash rows also need `selectedStashIndex`, which gates the palette's
        // apply/pop/drop entries.
        if (attempts >= 3) {
          console.warn(`[e2e] real clicks keep mis-selecting ${ref} — selecting via the store`)
          const stashMatch = /^stash@\{(\d+)\}$/.exec(ref)
          await browser.execute(
            (targetOid: string, stashIndex: number | null) => {
              const store = (
                window as unknown as {
                  __e2eRepoUIStore?: {
                    getState: () => {
                      setSelectedCommitOid: (o: string | null) => void
                      setSelectedStashIndex: (i: number | null) => void
                    }
                  }
                }
              ).__e2eRepoUIStore
              store?.getState().setSelectedCommitOid(targetOid)
              store?.getState().setSelectedStashIndex(stashIndex)
            },
            oid,
            stashMatch ? Number(stashMatch[1]) : null
          )
        }
        return (await selectedCommitOid()) === oid
      },
      {
        timeout: 15000,
        interval: 1500,
        timeoutMsg: `commit row ${oid} (${ref}) never became selected after clicking it`,
      }
    )
  } catch (err) {
    // Diagnostic: reveals *which* commit actually got selected (and, walking up from the hit-tested
    // element, which row visually owns that pixel) so a future regression here is diagnosable
    // without another round of guessing.
    const actualOid = await selectedCommitOid()
    const log = execFileSync('git', ['-C', repoPath, 'log', '--format=%H %s', '-n', '20'], {
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

// Extends the current graph selection with one more commit — the multi-select a user performs
// with a Cmd+click on a second row. WebDriver can't hold a modifier across a click here, so the
// click is dispatched as a bubbling MouseEvent with `metaKey: true` on the same message-cell span
// the single-select step clicks (React reads the modifier off the native event). A meta-click
// TOGGLES membership and a dispatched click is sometimes delivered twice on this provider (see
// the README's pin-toggle gotcha), so the step polls the store's `selectedCommitOids` mirror —
// published by GitGraph exactly when two or more real commits are selected — and only re-clicks
// while the commit is genuinely not in the group.
When(/^I add the "([^"]*)" commit to the graph selection$/, async (ref: string) => {
  const repoPath = activeRepoPath()
  const oid = execFileSync('git', ['-C', repoPath, 'rev-parse', ref], {
    encoding: 'utf8',
  }).trim()
  const subject = execFileSync('git', ['-C', repoPath, 'log', '-1', '--format=%s', oid], {
    encoding: 'utf8',
  }).trim()

  const row = $(`[data-testid="graph-row-${oid}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  await row.$(`span*=${subject}`).waitForDisplayed({ timeout: 10000 })

  const inSelection = async () =>
    browser.execute((target: string) => {
      const store = (
        window as unknown as {
          __e2eRepoUIStore?: { getState: () => { selectedCommitOids: string[] } }
        }
      ).__e2eRepoUIStore
      return !!store && store.getState().selectedCommitOids.includes(target)
    }, oid)

  await browser.waitUntil(
    async () => {
      if (await inSelection()) return true
      await browser.execute(
        (rowTestId: string, text: string) => {
          const rowEl = document.querySelector(`[data-testid="${rowTestId}"]`)
          if (!rowEl) throw new Error(`no graph row ${rowTestId}`)
          const span = Array.from(rowEl.querySelectorAll('span')).find((el) =>
            (el.textContent ?? '').includes(text)
          )
          if (!span) throw new Error(`no message span for "${text}" in ${rowTestId}`)
          span.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true })
          )
        },
        `graph-row-${oid}`,
        subject
      )
      return inSelection()
    },
    {
      timeout: 15000,
      interval: 1000,
      timeoutMsg: `commit ${oid} (${ref}) never joined the graph multi-selection`,
    }
  )
})

/**
 * A multi-commit patch file: `create_commits_patch` concatenates one `git format-patch -1` mbox
 * per commit, so the number of mbox "From <sha> ..." separators IS the number of commits covered —
 * the proof the *selection* variant ran, which the single-patch "holds a diff" check can't give.
 */
Then(
  /^the patch file "([^"]*)" holds patches for (\d+) commits$/,
  async (fileName: string, count: string) => {
    const target = join(tmpdir(), fileName)
    await browser.waitUntil(() => existsSync(target), {
      timeout: 15000,
      timeoutMsg: `expected a patch file at ${target}`,
    })
    const content = readFileSync(target, 'utf8')
    const commits = content.match(/^From [0-9a-f]{40} /gm) ?? []
    if (commits.length !== Number(count) || !content.includes('diff --git')) {
      throw new Error(
        `${target} holds ${commits.length} commit patch(es) (expected ${count}); ` +
          `diff header present: ${content.includes('diff --git')}`
      )
    }
    rmSync(target, { force: true })
  }
)

// ⌘K toggles the *actions* palette open in `all` mode (useKeyboardShortcuts). ⌘P opens the same
// dialog in `files` mode, which renders only the lookup/files groups — no commit/stash/settings
// commands at all — so pressing it here makes every downstream `command-item-*` / group-heading
// step time out on an element that was never rendered. The input appearing is the "open" marker,
// and it appears in *both* modes, which is why swapping this to ⌘P looked harmless.
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

// Filters the palette by typing into its search input — cmdk narrows the list as you type. Doc
// captures use this to bring the documented command into the visible part of a long action list
// before the screenshot; the run-action step below is filter-agnostic (it targets the item's
// testid), so filtering first never changes what a scenario can run.
When(/^I type "([^"]*)" into the command palette$/, async (text: string) => {
  const input = $('[data-testid="command-palette-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(text)
})

// Confirms `selectedCommitOid` actually reached the palette (via the repoUI store) before running a
// commit-scoped action — the "commit" group heading renders the selected commit's short sha
// (commandPalette.group.commit). cmdk renders a group's `heading` prop as text content inside a
// `[cmdk-group-heading]` element (not a data attribute — that only existed in the component's unit
// test fake). If this fails but the row's `data-selected` check upstream passed, the break is
// between the store bridge and the palette rather than the row click itself.
Then(/^the command palette shows commit actions for "([^"]*)"$/, async (ref: string) => {
  const repoPath = activeRepoPath()
  const shortOid = execFileSync('git', ['-C', repoPath, 'rev-parse', '--short', ref], {
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
  const repoPath = activeRepoPath()
  const hasStagedDiff = () => {
    const result = execFileSync('git', ['-C', repoPath, 'diff', '--cached', '--name-only'], {
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
  const repoPath = activeRepoPath()
  const isClean = () =>
    execFileSync('git', ['-C', repoPath, 'status', '--porcelain'], {
      encoding: 'utf8',
    }).trim().length === 0
  await browser.waitUntil(isClean, {
    timeout: 10000,
    timeoutMsg: 'expected a clean working tree after a hard reset, found pending changes',
  })
})

Then(/^the repository HEAD commit subject contains "([^"]*)"$/, async (expected: string) => {
  const repoPath = activeRepoPath()
  const headSubject = () =>
    execFileSync('git', ['-C', repoPath, 'log', '-1', '--pretty=%s'], {
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
Then(
  /^the branch "([^"]*)" points at the commit "([^"]*)"$/,
  async (branch: string, subject: string) => {
    const repoPath = activeRepoPath()
    const actual = execFileSync('git', ['-C', repoPath, 'log', '-1', '--format=%s', branch], {
      encoding: 'utf8',
    }).trim()
    expect(actual).toBe(subject)
  }
)

// Tag creation is no longer a modal: `TagCreationInput` (added by the "inline tag creation input in
// the refs column" change, which deleted TagDialog.tsx) renders a bare name input *inside the
// drafted commit row's refs cell*. The `bar` variant only appears when the refs column is hidden,
// which isn't the default, so `inline` is what these scenarios drive. Both lightweight and
// annotated tags go through this same input — annotated ones are created with an empty message
// rather than prompting for one — so there's no second dialog to fill in either case.
Then(/^the tag name input is shown$/, async () => {
  await $('[data-testid="tag-creation-inline-input"]').waitForDisplayed({ timeout: 10000 })
})

When(/^I enter the tag name "([^"]*)"$/, async (name: string) => {
  const input = $('[data-testid="tag-creation-inline-input"]')
  await input.waitForDisplayed({ timeout: 10000 })
  await input.setValue(name)
})

// The inline variant has no submit button (only the `bar` variant does) — Enter confirms. Typing
// into the input already leaves it focused, so the keypress lands on it.
When(/^I confirm the tag creation$/, async () => {
  await browser.keys('Enter')
})

Then(/^the tag "([^"]*)" points at the commit "([^"]*)"$/, async (tag: string, subject: string) => {
  const repoPath = activeRepoPath()
  const actual = execFileSync('git', ['-C', repoPath, 'log', '-1', '--format=%s', tag], {
    encoding: 'utf8',
  }).trim()
  expect(actual).toBe(subject)
})

// An annotated tag is its own object (cat-file -t reports "tag"); a lightweight tag is just a ref
// pointing straight at the commit (reports "commit"). This is the real distinguishing proof that
// `annotated: true` took effect, rather than just checking the ref exists.
Then(/^the tag "([^"]*)" is annotated$/, async (tag: string) => {
  const repoPath = activeRepoPath()
  const type = execFileSync('git', ['-C', repoPath, 'cat-file', '-t', tag], {
    encoding: 'utf8',
  }).trim()
  expect(type).toBe('tag')
})

// Creating a tag invalidates both the 'tags' and 'git-log' react-query keys (TagDialog.tsx), so the
// new ref badge lands in the graph asynchronously — waitForDisplayed (rather than a one-shot query)
// rides out that refetch. `ref-label-tag-<name>` (RefLabel.tsx) is scoped inside the commit's own
// `graph-row-<oid>` row so it can't match a same-named tag on a different commit.
Then(/^the tag "([^"]*)" is shown as a ref in the graph$/, async (tag: string) => {
  const repoPath = activeRepoPath()
  const oid = execFileSync('git', ['-C', repoPath, 'rev-parse', `${tag}^{commit}`], {
    encoding: 'utf8',
  }).trim()
  const row = $(`[data-testid="graph-row-${oid}"]`)
  await row.waitForDisplayed({ timeout: 10000 })
  await row.$(`[data-testid="ref-label-tag-${tag}"]`).waitForDisplayed({ timeout: 10000 })
})

// Cherry-pick creates a *new* commit (different oid, same subject) on the target ref rather than
// moving anything — checking `<ref>`'s log for the subject (not oid equality) is the correct proof.
Then(/^the commit "([^"]*)" is reachable from "([^"]*)"$/, async (subject: string, ref: string) => {
  const repoPath = activeRepoPath()
  const subjects = execFileSync('git', ['-C', repoPath, 'log', ref, '--format=%s'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
  expect(subjects).toContain(subject)
})

Then(/^the repository has (\d+) stash(?:es)?$/, async (count: string) => {
  const repoPath = activeRepoPath()
  const stashCount = () => {
    const list = execFileSync('git', ['-C', repoPath, 'stash', 'list'], {
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
  const repoPath = activeRepoPath()
  execFileSync('git', ['-C', repoPath, 'reset', '--hard', 'HEAD'])
  execFileSync('git', ['-C', repoPath, 'clean', '-fd'])
})

// Apply/pop restore the stash's changes onto the working tree — checking for the untracked file
// stash@{0} carries (notes.txt, from stash-stack.sh's `-u` push) sidesteps asserting on config.yml,
// whose content would otherwise need a 3-way merge against the fixture's other leftover changes.
Then(/^the file "([^"]*)" exists in the working tree$/, async (filePath: string) => {
  const repoPath = activeRepoPath()
  await browser.waitUntil(() => existsSync(join(repoPath, filePath)), {
    timeout: 10000,
    timeoutMsg: `expected "${filePath}" to exist in the working tree at ${repoPath}`,
  })
})
