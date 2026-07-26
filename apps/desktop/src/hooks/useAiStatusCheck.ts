import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settings.store'
import { useAiStatusStore } from '../stores/aiStatus.store'

/**
 * Startup (and enable-toggle) liveness check for the configured AI provider. Mounted once from
 * `App`, it feeds `useAiStatusStore`, which the warning banner and the footer indicator read.
 *
 * The connection settings are read through `getState()` rather than subscribed to on purpose: the
 * URL field in Settings would otherwise fire a check on every keystroke. Re-checking after an edit
 * is the explicit job of the Settings page's validate button, which writes to the same store.
 */
export function useAiStatusCheck() {
  const enabled = useSettingsStore((s) => s.settings.ai.enabled !== false)

  useEffect(() => {
    const { check, reset } = useAiStatusStore.getState()
    if (!enabled) {
      reset()
      return
    }
    check(useSettingsStore.getState().settings.ai)
  }, [enabled])
}
