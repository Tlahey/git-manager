import { Before } from '@wdio/cucumber-framework'
import { seedSettings } from '../support/settings.js'

// The app's own factory default is 'dark' (settings.store.ts), but every capture this suite takes
// — doc screenshots, marketing screenshots, and every @visual baseline — should look like the
// same real app rather than drift between whatever a scenario happened to leave behind. Ocean is
// the suite-wide default; a scenario that specifically exercises theming (e.g. settings.feature's
// per-theme cards) still switches themes itself, this only sets the starting point.
//
// Runs before every scenario's own Given steps, so it lands in localStorage before that
// scenario's first reload (fixture-open, fixture-build + window nav, etc.) — the same "seed
// before reload" mechanism seedSettings' other callers already rely on.
Before(async () => {
  await seedSettings({ appearance: { theme: 'ocean' } })
})
