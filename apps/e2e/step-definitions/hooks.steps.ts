import { Before } from '@wdio/cucumber-framework'
import { forceLiveSettings, seedSettings } from '../support/settings.js'
import { seedGraphColumns } from '../support/gitGraphColumns.js'
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

  // Seeded into localStorage, so it lands before that scenario's first reload (fixture-open,
  // fixture-build + window nav, etc.) if it has one — the same "seed before reload" mechanism
  // seedSettings' other callers already rely on.
  await seedSettings({ appearance, ai })
  // AND forced onto the live store directly: the suite shares one app window across every
  // feature, and a scenario whose own Given steps never navigate (e.g. "the git-manager
  // application is running", used by most Settings scenarios) never rehydrates from localStorage
  // — it would otherwise keep whatever a previous scenario last left live, which is exactly how a
  // theme-switching scenario (settings.feature's "per-theme cards", ending on "dark") used to leak
  // into unrelated screenshots taken right after it.
  await forceLiveSettings({ appearance, ai })

  // Every column visible, and `graph` wide enough that no fixture's lane count ever pushes it
  // into its `overflow`/`compact` modes (see `graphColumnSizing.ts`) — a real per-repo maximum is
  // computed at render time from that specific repo's concurrent branch count, so there is no
  // single "true max" to seed in advance; this fixed width is just generous enough (COL_WIDTH is
  // 22px/lane) to comfortably fit every fixture in this suite without wasted space becoming
  // noticeable on a 1600px-wide window.
  await seedGraphColumns({
    refs: { visible: true, width: 160 },
    graph: { visible: true, width: 500 },
    message: { visible: true, width: 400 },
    author: { visible: true, width: 150 },
    date: { visible: true, width: 110 },
    sha: { visible: true, width: 80 },
  })
})
