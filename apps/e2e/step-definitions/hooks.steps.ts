import { After, Before } from '@wdio/cucumber-framework'
import { browser } from '@wdio/globals'
import { applyBaseline } from '../support/scenarioBaseline.js'
import { clearBoardMirrors } from '../support/boardMirrors.js'
import { SUITE_WIDE_FAKE_AI_URL } from '../support/fakeAiServer.js'
import { navigateAndSettle } from '../support/navigation.js'

// The app's own factory default is 'dark' (settings.store.ts), but every capture this suite takes
// — doc screenshots, marketing screenshots, and every @visual baseline — should look like the
// same real app rather than drift between whatever a scenario happened to leave behind. Ocean is
// the suite-wide default; a scenario that specifically exercises theming (e.g. settings.feature's
// per-theme cards) still switches themes itself, this only sets the starting point.
//
// `small` (32px) rows fit more history in the same screenshot height than the app's own factory
// `standard` (40px) default — purely a capture-density choice, not a claim about which one a real
// user should pick.
Before(async () => {
  const appearance = { theme: 'ocean', rowHeight: 'small' }
  // Real factory default: AI enabled, pointed at "Ollama". Pointing it at the suite-wide fake
  // server instead of leaving `url` at its real default (a local Ollama that isn't running in
  // this sandbox) means the "AI provider is unreachable" banner never raises by default — a
  // scenario that specifically wants AI *off*, or wants to drive real generation against its own
  // scripted server, still overrides this with its own "AI features are turned off" /
  // "the AI provider is pointed at a fake server" step, same as before.
  const ai = { enabled: true, url: SUITE_WIDE_FAKE_AI_URL, model: 'fake-model' }

  // The factory default display style is 'notch' — a real second WebviewWindow that opens for
  // every notification (a fetch finishing, an AI run completing, a hook running). The embedded
  // WebKit driver handles a second window badly (see git-hooks.steps.ts's module comment and
  // README.md's multi-window section): the service's per-command "switch to the active window"
  // starts bouncing between `main` and `notch`, and unrelated clicks then die with
  // "A JavaScript exception occurred". Disabling notifications keeps every scenario single-window
  // by default. Some producers check this setting before even enqueuing a card
  // (useNotchOperation's `enabled`), so the git-hooks scenarios that assert on real hook cards
  // re-enable notifications themselves — in their "the notch queue is being recorded" step.
  const notifications = { enabled: false }

  // Factory values, re-pinned because WKWebView's localStorage survives app relaunches: without
  // this, whatever daily-summary.feature's last scenario seeded (`enabled: false`) leaks into the
  // NEXT run, and its first scenario — which relies on the factory defaults — finds no briefing
  // button at all. Diagnosed from the persisted settings captured at the moment of that failure.
  // Any settings group a scenario toggles belongs in this baseline for the same reason.
  const dailySummary = { enabled: true, autoGenerate: true, saveToRepo: false }

  // Same leak class as dailySummary above: settings-repository.feature seeds a per-repo theme
  // override, and an override outlives its scenario (and the run — localStorage persists across
  // relaunches). The settings.feature snapshots then capture the overridden theme instead of the
  // baseline one and mismatch by ~97% against baselines recorded without the override — while
  // passing in isolation, where no override was ever written.
  const repoOverrides = {}

  // Kept even though GitLab and Bitbucket are currently unlisted: a connected account is
  // persisted settings like any other, and localStorage survives app relaunches, so one left by an
  // older build (or by re-enabling a provider locally) would otherwise carry into every run.
  // Spelled out as the factory shape rather than `{}` — an empty object means "reset the group" to
  // the baseline, and the panels read `gitlabAccounts.length` straight off it.
  const integrations = {
    gitlabAccounts: [],
    gitlabActiveAccountId: null,
    bitbucketAccounts: [],
    bitbucketActiveAccountId: null,
  }

  // One driver command for the whole baseline — clearing the volatile persisted slices, patching
  // the live settings store, and seeding settings + graph columns. It used to be three, and the
  // hook runs before all 160 scenarios; a measured full run spent 58.6 of its 62 minutes outside
  // step execution, with these round trips the dominant remaining candidate. See
  // support/scenarioBaseline.ts for the ordering constraints inside it.
  const baseline = {
    settings: {
      appearance,
      ai,
      notifications,
      dailySummary,
      repoOverrides,
      integrations,
      language: 'en',
    },
    columns: {
      refs: { visible: true, width: 160 },
      // Wide enough that no fixture's lane count pushes the graph column into its
      // `overflow`/`compact` modes (see `graphColumnSizing.ts`).
      graph: { visible: true, width: 500 },
      message: { visible: true, width: 400 },
      author: { visible: true, width: 150 },
      date: { visible: true, width: 110 },
      sha: { visible: true, width: 80 },
    },
  }

  // The board's disaster-recovery mirrors live outside every repository, so a fixture rebuild leaves
  // them behind and every board a previous scenario created stays offered for recovery — a banner
  // that grows all run and lands in the documented captures. Filesystem only: no driver round trip,
  // which is what the comment above `applyBaseline` is protective of.
  clearBoardMirrors()

  // The GitHub-board fixture double (`mock-remote-board.api.ts`) lives in the app's own module
  // state, not in a store `applyBaseline` reaches — so, like the mirrors above, it survives across
  // scenarios in this shared window unless cleared explicitly. Best-effort: the bridge only exists
  // once the app has rendered at least once, which a scenario at the very start of a run may not
  // have done yet.
  await browser
    .execute(() => {
      const reset = (window as unknown as { __e2eResetMockRemoteBoards?: () => void })
        .__e2eResetMockRemoteBoards
      reset?.()
    })
    .catch(() => {})

  // Belt to the After hook's braces: if the previous scenario still left the session on a dead
  // window handle (every path there re-anchors on `main`, but none of them can be guaranteed to
  // have run — a killed worker, a hook that itself threw), the first execute here would die with
  // "no such window". Re-anchor and retry once rather than failing the scenario before its first
  // step.
  const rootEmpty = await applyBaseline(baseline).catch(async () => {
    const handles = await browser.getWindowHandles()
    if (handles.includes('main')) await browser.switchToWindow('main')
    return await applyBaseline(baseline)
  })

  // A React render crash (observed as WebKit's "NotFoundError: The object can not be found here",
  // with a Monaco "Canceled" rejection alongside) unmounts everything under #root. The app window
  // is shared by the whole run, and scenarios that never navigate (all of settings.feature, for
  // one) would inherit that blank page and fail on every element for the rest of their feature.
  // Reload onto a fresh document instead, so one crash costs one scenario, not a dozen.
  if (rootEmpty) {
    console.warn('[e2e] #root was empty at scenario start — reloading to recover from a crash')
    const origin = await browser.execute(() => window.location.origin)
    const stamp = `recover-${Date.now()}`
    await navigateAndSettle(`${origin}/?e2e=${stamp}`, stamp)
    await browser.waitUntil(
      async () =>
        await browser.execute(() => (document.getElementById('root')?.childElementCount ?? 0) > 0),
      { timeout: 15000, timeoutMsg: 'The app did not remount after a crash-recovery reload' }
    )
    // The seeds above landed in the crashed document; the reload rehydrated from them, but the
    // live-store patch must be re-applied against the new document's stores.
    await applyBaseline(baseline)
  }
})

/**
 * Closes every window a scenario left open besides `main`, whatever it was — a fixup commit
 * window whose scenario failed before its own cleanup, a notch card, a rebasing editor.
 *
 * This matters more here than in a browser suite because the service reuses ONE app instance for
 * the whole run: a leaked window doesn't just fail its own feature, it poisons every feature that
 * runs after it (the service's per-command active-window switch starts bouncing between handles,
 * and clicks in the main window die with "A JavaScript exception occurred"). A full run on
 * 2026-08-02 traced ~20 feature files' worth of failures back to one leaked `fixup-*` window.
 *
 * Closing uses the native WebDriver `closeWindow()` — reliable against secondary windows, unlike
 * clicking their in-app close buttons (see fixup.steps.ts) — and switches straight back to `main`
 * so the next command never runs against a defunct context.
 */
After(async () => {
  try {
    const handles = await browser.getWindowHandles()
    if (!handles.includes('main')) return
    for (const handle of handles) {
      if (handle === 'main') continue
      try {
        await browser.switchToWindow(handle)
        await browser.closeWindow()
      } catch {
        // The window can beat us to it (a notch card closing on its own timer mid-cleanup) —
        // what matters is the re-anchor below, not who closed it.
      }
    }
    // ALWAYS re-anchor, even when there was nothing to close: `getWindowHandles()` is a
    // session-level command that succeeds while the session's *current* window is a dead handle
    // (a self-closed notch card the service had switched onto). Returning without this switch
    // left the next scenario's Before hook running `execute` against that dead context — two
    // anonymous "no such window" scenario failures in a row, until a fixture-open step happened
    // to re-anchor on main.
    await browser.switchToWindow('main')
  } catch {
    // Cleanup that cannot run must not fail a scenario that otherwise passed — but still try to
    // leave the session somewhere alive.
    try {
      await browser.switchToWindow('main')
    } catch {
      /* the next scenario's own recovery is the last resort */
    }
  }
})
