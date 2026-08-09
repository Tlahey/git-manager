import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, expect, $ } from '@wdio/globals'
import { When, Then, After } from '@wdio/cucumber-framework'
import { getActiveRepoPath } from '../support/activeRepo'

// ─── Why a REAL second window ────────────────────────────────────────────────
// The "Rebasing Commit" editor cannot reuse the navigate-in-place trick the merge editor's
// read-only scenarios use: both of its exit paths (Start Rebasing and Cancel) call
// `getCurrentWindow().close()`, and closing the run's one shared window would kill every feature
// after this one (the same reason fixup.steps.ts drives FixupCommitWindow in a real window).
// The window is opened with exactly the URL production's `openRebaseWindow`
// (apps/desktop/src/lib/graphWindows.ts) builds — `?window=rebase&repoPath=…&baseOid=…` — via the
// `withGlobalTauri` bundle (`window.__TAURI__.webviewWindow`), because the production *triggers*
// for that call are a native drag-drop menu and the fixup flow's hand-off, neither of which
// WebDriver can drive. Everything past the open is real: `list_rebase_commits` fills the plan,
// the real toolbar edits it, and Start runs the real `run_interactive_rebase` against the fixture.

let mainWindowHandle = ''
let rebaseWindowHandle = ''

/**
 * Re-point the driver at the rebase editor window before touching it — the tauri service's
 * per-command focus hook silently follows the OS's active window back to the main app window,
 * exactly like merge.steps.ts's ensureMergeWindow documents. Switching unconditionally, because
 * checking the current handle first is itself a command the hook can race.
 */
async function ensureRebaseWindow() {
  await browser.switchToWindow(rebaseWindowHandle)
}

// WebdriverIO's native `element.click()` throws "A JavaScript exception occurred" against
// elements in real secondary windows on this provider (see fixup.steps.ts) — dispatch via
// injected JS instead.
async function clickViaJs(testid: string) {
  await browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
    if (!el) throw new Error(`clickViaJs: no element with data-testid="${id}"`)
    el.click()
  }, testid)
}

/** Snapshot of the editor's interactive state, for failure messages — which rows are selected,
 * what each step's badge says, and which toolbar buttons are live. */
async function editorStateProbe(): Promise<string> {
  try {
    await ensureRebaseWindow()
    const state = await browser.execute(() => ({
      rows: Array.from(document.querySelectorAll('[data-testid^="rebase-step-"]')).map((el) => ({
        id: el.getAttribute('data-testid'),
        selected: el.classList.contains('bg-accent'),
        text: (el.textContent ?? '').slice(0, 80),
      })),
      buttons: ['rebase-reword', 'rebase-squash', 'rebase-drop', 'rebase-start'].map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null
        return { id, present: !!el, disabled: el?.disabled ?? null }
      }),
      rewordInputOpen: !!document.querySelector('[data-testid="rebase-reword-input"]'),
    }))
    return JSON.stringify(state)
  } catch (e) {
    return `probe failed: ${String(e).slice(0, 120)}`
  }
}

/** The plan row whose visible title is `subject`, as a `data-testid` (`rebase-step-<shortOid>`). */
async function rowTestIdBySubject(subject: string): Promise<string> {
  let found: string | null = null
  await browser.waitUntil(
    async () => {
      await ensureRebaseWindow()
      found = await browser.execute((s: string) => {
        const rows = Array.from(document.querySelectorAll('[data-testid^="rebase-step-"]'))
        const row = rows.find((el) => (el.textContent ?? '').includes(s))
        return row?.getAttribute('data-testid') ?? null
      }, subject)
      return found !== null
    },
    { timeout: 15000, timeoutMsg: `No rebase plan row titled "${subject}" ever rendered` }
  )
  return found!
}

/** Dispatches a click on a plan row, optionally with the meta key held (multi-select). A plain
 * synthetic `el.click()` can't carry modifiers, so this dispatches a bubbling MouseEvent — React
 * reads `metaKey` off the native event. */
async function clickRow(testid: string, withMeta: boolean) {
  await ensureRebaseWindow()
  await browser.execute(
    (id: string, meta: boolean) => {
      const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
      if (!el) throw new Error(`clickRow: no element with data-testid="${id}"`)
      el.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: meta })
      )
    },
    testid,
    withMeta
  )
}

/** Whether the toolbar button `testid` is currently enabled — the editor's own selection-derived
 * gating (reword needs exactly one step selected, squash at least two), read as the signal that a
 * row click actually landed rather than trusting a single dispatch (see the README's
 * "one dispatched click, sometimes delivered twice" gotcha). */
async function toolbarEnabled(testid: string): Promise<boolean> {
  await ensureRebaseWindow()
  return browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null
    return !!el && !el.disabled
  }, testid)
}

/** Whether the plan row carries StepRailRow's selected styling (`bg-accent`) — the per-row signal
 * that a click landed on the *intended* row, which the toolbar gating alone can't tell apart from
 * some other row being selected. Matched as an exact class-list token: every clickable row also
 * carries `hover:bg-accent/40`, so a substring check reads EVERY row as selected (which silently
 * turned the select steps into no-ops on the first version of this file). */
async function rowSelected(testid: string): Promise<boolean> {
  await ensureRebaseWindow()
  return browser.execute((id: string) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    return !!el && el.classList.contains('bg-accent')
  }, testid)
}

When(/^I open the interactive rebase editor from the "([^"]*)" commit$/, async (ref: string) => {
  const repoPath = getActiveRepoPath()
  const baseOid = execFileSync('git', ['-C', repoPath, 'rev-parse', ref], {
    encoding: 'utf8',
  }).trim()

  const before = await browser.getWindowHandles()
  mainWindowHandle = before.includes('main') ? 'main' : before[0]

  // The handle IS the window label on this provider (see fixup.steps.ts's `fixup-*` handles), so a
  // unique label doubles as the thing to wait for. Same URL shape as lib/graphWindows.ts.
  const label = `rebase-e2e-${Date.now()}`
  const url =
    `/?window=rebase&repoPath=${encodeURIComponent(repoPath)}` +
    `&baseOid=${encodeURIComponent(baseOid)}`
  await browser.execute(
    (windowLabel: string, windowUrl: string) => {
      const tauri = (
        window as unknown as {
          __TAURI__?: {
            webviewWindow: {
              WebviewWindow: new (label: string, options: Record<string, unknown>) => unknown
            }
          }
        }
      ).__TAURI__
      if (!tauri) throw new Error('window.__TAURI__ is not available (withGlobalTauri off?)')
      new tauri.webviewWindow.WebviewWindow(windowLabel, {
        url: windowUrl,
        title: 'Interactive Rebase',
        width: 1200,
        height: 850,
        minWidth: 900,
        minHeight: 600,
        decorations: true,
      })
    },
    label,
    url
  )

  await browser.waitUntil(async () => (await browser.getWindowHandles()).includes(label), {
    timeout: 15000,
    timeoutMsg: `The rebase editor window ("${label}") never opened`,
  })
  rebaseWindowHandle = label
  await browser.switchToWindow(rebaseWindowHandle)
  // The plan rows appear once the real `list_rebase_commits` query resolves.
  await $('[data-testid^="rebase-step-"]').waitForDisplayed({ timeout: 20000 })
})

// The step most recently selected on its own — the anchor the multi-select step below re-clicks
// when a doubled meta-click collapses the group back to a single row (see that step's comment).
let lastSingleSelectedTestId = ''

When(/^I select the rebase step "([^"]*)"$/, async (subject: string) => {
  const testid = await rowTestIdBySubject(subject)
  lastSingleSelectedTestId = testid
  // Plain row clicks are idempotent here (handleRowClick without a modifier always selects that
  // single row, never toggles), so re-clicking until the row shows its selected styling is safe.
  try {
    await browser.waitUntil(
      async () => {
        if (await rowSelected(testid)) return true
        await clickRow(testid, false)
        return rowSelected(testid)
      },
      { timeout: 15000, interval: 1000, timeoutMsg: 'selection never stuck' }
    )
  } catch (err) {
    throw new Error(
      `The "${subject}" step never became selected: ${(err as Error).message}\n[probe] ${await editorStateProbe()}`
    )
  }
})

When(/^I add the rebase step "([^"]*)" to the selection$/, async (subject: string) => {
  const testid = await rowTestIdBySubject(subject)
  // A meta-click TOGGLES the row in and out of the group, and a single dispatched click is
  // sometimes delivered twice on this provider (see the README's pin-toggle gotcha) — so verify
  // the outcome (this row selected AND the squash trigger enabled, i.e. two or more steps in the
  // group) after every dispatch and correct course instead of trusting one dispatch. Two failure
  // shapes need different repairs: the row not selected at all (meta-click again) and the row
  // selected but ALONE (a lost modifier or an even-count double delivery collapsed the group —
  // re-anchor on the previously-selected step with a plain click, then meta-click this one again).
  try {
    await browser.waitUntil(
      async () => {
        const selected = await rowSelected(testid)
        const grouped = await toolbarEnabled('rebase-squash')
        if (selected && grouped) return true
        if (selected && !grouped && lastSingleSelectedTestId) {
          await clickRow(lastSingleSelectedTestId, false)
        }
        await clickRow(testid, true)
        return (await rowSelected(testid)) && (await toolbarEnabled('rebase-squash'))
      },
      { timeout: 20000, interval: 1000, timeoutMsg: 'no multi-selection formed' }
    )
  } catch (err) {
    throw new Error(
      `Meta-clicking the "${subject}" step never produced a multi-selection: ${(err as Error).message}\n[probe] ${await editorStateProbe()}`
    )
  }
})

When(/^I reword the selected rebase step to "([^"]*)"$/, async (message: string) => {
  // Open the inline reword editor, re-clicking until the textarea actually exists — polled via
  // window-ensured `browser.execute`, never `$`: the tauri service's focus hook can silently move
  // a `$`-based wait back onto the main window's document, where the textarea never appears.
  try {
    await browser.waitUntil(
      async () => {
        await ensureRebaseWindow()
        const open = await browser.execute(
          () => !!document.querySelector('[data-testid="rebase-reword-input"]')
        )
        if (open) return true
        await clickViaJs('rebase-reword')
        await ensureRebaseWindow()
        return browser.execute(
          () => !!document.querySelector('[data-testid="rebase-reword-input"]')
        )
      },
      { timeout: 15000, interval: 1000, timeoutMsg: 'the reword editor never opened' }
    )
  } catch (err) {
    throw new Error(`${(err as Error).message}\n[probe] ${await editorStateProbe()}`)
  }
  // The textarea is a controlled React input: set it through the native value setter and fire an
  // `input` event so React's onChange actually sees the new value (a bare `el.value = …` doesn't).
  await ensureRebaseWindow()
  await browser.execute((value: string) => {
    const el = document.querySelector(
      '[data-testid="rebase-reword-input"]'
    ) as HTMLTextAreaElement | null
    if (!el) throw new Error('reword textarea disappeared')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, message)
  // Save, then wait for the inline editor to fold away — the signal the reword actually landed on
  // the plan. Same verify-and-retry shape as opening it, and same execute-only polling; the click
  // is guarded in-page (only dispatched while the button still exists) so a retry landing after
  // the fold can't throw on a button that saving already removed.
  try {
    await browser.waitUntil(
      async () => {
        await ensureRebaseWindow()
        const folded = () =>
          browser.execute(() => !document.querySelector('[data-testid="rebase-reword-input"]'))
        if (await folded()) return true
        await browser.execute(() => {
          const el = document.querySelector(
            '[data-testid="rebase-reword-save"]'
          ) as HTMLElement | null
          el?.click()
        })
        await ensureRebaseWindow()
        return folded()
      },
      { timeout: 15000, interval: 1000, timeoutMsg: 'the reword editor never folded after saving' }
    )
  } catch (err) {
    throw new Error(`${(err as Error).message}\n[probe] ${await editorStateProbe()}`)
  }
})

When(/^I mark the selected rebase step as dropped$/, async () => {
  // Same verify-and-retry shape as the reword step: the effect (a plan row carrying the "drop"
  // badge) is the signal the click landed, not the dispatch itself.
  try {
    await browser.waitUntil(
      async () => {
        await ensureRebaseWindow()
        const dropped = await browser.execute(() =>
          Array.from(document.querySelectorAll('[data-testid^="rebase-step-"]')).some((el) =>
            (el.textContent ?? '').includes('drop')
          )
        )
        if (dropped) return true
        await clickViaJs('rebase-drop')
        await ensureRebaseWindow()
        return browser.execute(() =>
          Array.from(document.querySelectorAll('[data-testid^="rebase-step-"]')).some((el) =>
            (el.textContent ?? '').includes('drop')
          )
        )
      },
      { timeout: 15000, interval: 1000, timeoutMsg: 'No plan row ever showed the "drop" badge' }
    )
  } catch (err) {
    throw new Error(`${(err as Error).message}\n[probe] ${await editorStateProbe()}`)
  }
})

When(/^I squash the selected rebase steps keeping both messages$/, async () => {
  // Radix dropdown triggers open on pointerdown, not click (see COVERAGE.md's worktree gotcha) —
  // dispatch the full pointer sequence, re-dispatching until the menu item exists, then click it
  // and wait for a row to carry the "squash" badge.
  try {
    await browser.waitUntil(
      async () => {
        await ensureRebaseWindow()
        const itemThere = await browser.execute(
          () => !!document.querySelector('[data-testid="rebase-squash-keep-messages"]')
        )
        if (itemThere) return true
        await browser.execute(() => {
          const el = document.querySelector('[data-testid="rebase-squash"]') as HTMLElement | null
          if (!el) throw new Error('no rebase-squash trigger')
          for (const type of ['pointerdown', 'pointerup', 'click']) {
            el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0 }))
          }
        })
        await ensureRebaseWindow()
        return browser.execute(
          () => !!document.querySelector('[data-testid="rebase-squash-keep-messages"]')
        )
      },
      { timeout: 15000, interval: 1000, timeoutMsg: 'the squash menu never opened' }
    )
    await browser.waitUntil(
      async () => {
        const done = async () => {
          await ensureRebaseWindow()
          return browser.execute(() =>
            Array.from(document.querySelectorAll('[data-testid^="rebase-step-"]')).some((el) =>
              (el.textContent ?? '').includes('squash')
            )
          )
        }
        if (await done()) return true
        await ensureRebaseWindow()
        await browser.execute(() => {
          const el = document.querySelector(
            '[data-testid="rebase-squash-keep-messages"]'
          ) as HTMLElement | null
          if (!el) return
          for (const type of ['pointerdown', 'pointerup', 'click']) {
            el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0 }))
          }
        })
        return done()
      },
      { timeout: 15000, interval: 1000, timeoutMsg: 'No plan row ever showed the "squash" badge' }
    )
  } catch (err) {
    throw new Error(`${(err as Error).message}\n[probe] ${await editorStateProbe()}`)
  }
})

// Start Rebasing awaits the real `run_interactive_rebase` IPC round trip, then the window closes
// itself — switch back to the always-alive main window right after the click, before polling
// handles again, exactly like fixup.steps.ts's self-close gotcha prescribes.
When(/^I start the interactive rebase$/, async () => {
  await ensureRebaseWindow()
  await clickViaJs('rebase-start')
  await browser.pause(500)
  await browser.switchToWindow(mainWindowHandle)
  try {
    await browser.waitUntil(
      async () => {
        const handles = await browser.getWindowHandles()
        return handles.length === 1 && handles[0] === mainWindowHandle
      },
      { timeout: 30000, timeoutMsg: 'The rebase editor window never closed after Start Rebasing' }
    )
  } catch (err) {
    // A window still open usually means run_interactive_rebase returned an error the footer is
    // showing — read it out so the failure names the real problem instead of a timeout.
    let footer = ''
    try {
      await ensureRebaseWindow()
      footer = await browser.execute(
        () => document.querySelector('.text-destructive')?.textContent ?? ''
      )
      await browser.switchToWindow(mainWindowHandle)
    } catch {
      // The window may have closed between the timeout and this probe — nothing more to add.
    }
    throw new Error(`${(err as Error).message}${footer ? `\n[probe] editor error: ${footer}` : ''}`)
  }
})

Then(/^the repository log lists the subject "([^"]*)"$/, (subject: string) => {
  const subjects = execFileSync('git', ['-C', getActiveRepoPath(), 'log', '--format=%s'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
  expect(subjects).toContain(subject)
})

Then(/^the repository log does not list the subject "([^"]*)"$/, (subject: string) => {
  const subjects = execFileSync('git', ['-C', getActiveRepoPath(), 'log', '--format=%s'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
  expect(subjects).not.toContain(subject)
})

Then(/^the repository log holds (\d+) commits$/, (count: string) => {
  const total = execFileSync('git', ['-C', getActiveRepoPath(), 'rev-list', '--count', 'HEAD'], {
    encoding: 'utf8',
  }).trim()
  expect(Number(total)).toBe(Number(count))
})

// %B (the full message) rather than %s: a squash keeps the second commit's subject in the
// combined body, which is exactly what distinguishes squash from fixup.
Then(/^the repository HEAD commit message contains "([^"]*)"$/, (fragment: string) => {
  const body = execFileSync('git', ['-C', getActiveRepoPath(), 'log', '-1', '--format=%B'], {
    encoding: 'utf8',
  })
  expect(body).toContain(fragment)
})

Then(/^the working file "([^"]*)" holds the line "([^"]*)"$/, (filePath: string, line: string) => {
  const content = readFileSync(join(getActiveRepoPath(), filePath), 'utf8')
  expect(content.split('\n')).toContain(line)
})

// A scenario that fails before Start leaves the rebase editor window (and possibly the driver's
// focus) stranded — same leak the merge feature guards against. Close every window but the main
// one so the next feature inherits a single, familiar window.
After({ tags: '@rebaseeditor' }, async () => {
  const handles = await browser.getWindowHandles()
  for (const handle of handles) {
    if (handle === mainWindowHandle || handle === 'main') continue
    try {
      await browser.switchToWindow(handle)
      await browser.closeWindow()
    } catch {
      // Already closing/closed — the "no such window" self-close quirk, harmless here.
    }
  }
  const remaining = await browser.getWindowHandles()
  await browser.switchToWindow(remaining.includes('main') ? 'main' : remaining[0])
})
