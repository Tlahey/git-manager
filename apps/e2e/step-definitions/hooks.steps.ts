import { Before } from '@wdio/cucumber-framework'
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

  // One driver command for the whole baseline — clearing the volatile persisted slices, patching
  // the live settings store, and seeding settings + graph columns. It used to be three, and the
  // hook runs before all 160 scenarios; a measured full run spent 58.6 of its 62 minutes outside
  // step execution, with these round trips the dominant remaining candidate. See
  // support/scenarioBaseline.ts for the ordering constraints inside it.
  await applyBaseline({
    settings: { appearance, ai, language: 'en' },
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
