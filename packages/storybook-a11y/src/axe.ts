import axe from 'axe-core'
import registerAPCACheck from 'apca-check'

// apca-check registers custom axe rules that grade contrast with APCA (WCAG 3 draft,
// the algorithm Chrome DevTools reports) — font-size/weight aware, unlike WCAG 2.x.
// We register Bronze conformance once and let its rule run on every axe.run below.
let registered = false
function ensureApcaRegistered(): void {
  if (registered) return
  registerAPCACheck('bronze')
  registered = true
}

// Rules turned off for a component-showcase fragment (whole-page structure) plus the
// WCAG 2.x color-contrast rule: APCA replaces it (running both double-reports the same
// pixels under two different algorithms, per apca-check's own guidance).
export const DEFAULT_DISABLED_RULES: Record<string, { enabled: boolean }> = {
  region: { enabled: false },
  'landmark-one-main': { enabled: false },
  'page-has-heading-one': { enabled: false },
  'color-contrast': { enabled: false },
}

/**
 * Runs axe (with APCA Bronze) over a rendered container and returns its violations.
 * `extraDisabledRules` merges over the defaults for a specific story if needed.
 */
export async function runAxe(
  container: Element,
  extraDisabledRules: Record<string, { enabled: boolean }> = {},
): Promise<axe.Result[]> {
  ensureApcaRegistered()
  const results = await axe.run(container, {
    rules: { ...DEFAULT_DISABLED_RULES, ...extraDisabledRules },
  })
  return results.violations
}
