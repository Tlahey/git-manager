import { useSettingsStore } from '../stores/settings.store'

/**
 * Whether AI features are enabled globally — the "Enable AI" master switch in Settings. When off,
 * every AI-driven button/panel (commit-message generation, AI commit batching, PR description fill,
 * daily summary…) is hidden. `undefined` (never toggled) counts as enabled for back-compat.
 */
export function useAiEnabled(): boolean {
  return useSettingsStore((s) => s.settings.ai.enabled !== false)
}
