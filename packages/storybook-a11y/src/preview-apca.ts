import axe from 'axe-core'
import registerAPCACheck from 'apca-check'

// Makes the APCA Bronze rule (apca-check) show up in @storybook/addon-a11y's
// Accessibility panel. PREVIEW-SAFE: axe-core + apca-check only, no vitest — safe to
// import from a .storybook/preview file (addon-a11y already ships axe-core to the
// preview iframe anyway).
//
// Why this is a `axe.reset` patch and not the obvious alternatives:
//
//  · A one-shot `registerAPCACheck('bronze')` at preview load does NOT work: the
//    addon's runner (addon-a11y dist/preview.js) calls `axe.reset()` before every
//    single run, wiping any previously configured custom rule, then re-applies only
//    `parameters.a11y.config`.
//  · Passing apca-check's rule + check through `parameters.a11y.config` does NOT work
//    either: parameters travel over the manager<->preview channel (telejson), which
//    revives the check's `evaluate` function WITHOUT its module closure (`calcAPCA`,
//    `axe.commons`), so every node comes back "Incomplete" — that is Storybook issue
//    storybookjs/storybook#28296.
//
// The addon resolves the SAME axe-core module instance as this file (single axe-core
// in the dependency graph, deduped by Vite), so wrapping `axe.reset` to re-register
// APCA right after each wipe keeps the rule installed — with its real closures — for
// both the automatic per-story run (afterEach → Accessibility panel) and manual
// re-runs from the panel. The WCAG 2.x `color-contrast` rule is intentionally left
// enabled here: in the panel both algorithms are informative (the strict APCA-only
// gate is the `test:apca` matrix, which does disable it — see ./axe.ts).
let enabled = false

export function enableApcaInA11yAddon(): void {
  if (enabled) return
  enabled = true
  const originalReset = axe.reset.bind(axe)
  axe.reset = () => {
    originalReset()
    registerAPCACheck('bronze')
  }
  registerAPCACheck('bronze')
}
