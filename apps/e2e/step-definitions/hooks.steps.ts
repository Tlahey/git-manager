import { After, Before } from '@wdio/cucumber-framework'
import { browser } from '@wdio/globals'
import { applyBaseline } from '../support/scenarioBaseline.js'
import { SUITE_WIDE_FAKE_AI_URL } from '../support/fakeAiServer.js'

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

  // One driver command for the whole baseline — clearing the volatile persisted slices, patching
  // the live settings store, and seeding settings + graph columns. It used to be three, and the
  // hook runs before all 160 scenarios; a measured full run spent 58.6 of its 62 minutes outside
  // step execution, with these round trips the dominant remaining candidate. See
  // support/scenarioBaseline.ts for the ordering constraints inside it.
  await applyBaseline({
    settings: { appearance, ai, notifications, dailySummary, language: 'en' },
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
  })
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
    if (handles.length <= 1 || !handles.includes('main')) return
    for (const handle of handles) {
      if (handle === 'main') continue
      await browser.switchToWindow(handle)
      await browser.closeWindow()
    }
    await browser.switchToWindow('main')
  } catch {
    // Cleanup that cannot run must not fail a scenario that otherwise passed.
  }
})
