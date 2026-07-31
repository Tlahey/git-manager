import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import { aiRunNotchModel, aiRunNotchRoute, AI_RUN_NOTCH_ID } from '../../lib/notifications/aiRunNotch'
import { repoNameOf } from '../../lib/notifications/remoteNotch'
import { useAiActivityStore } from '../../stores/aiActivity.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiNotchRun } from '../../hooks/useAiNotchRun'
import { useNotchOperation } from '../../hooks/useNotchOperation'
import { useWindowFocus } from '../../hooks/useWindowFocus'

/**
 * Puts the model's work on the notch — above all the file-by-file read every two-phase feature does
 * before it can answer anything.
 *
 * Renders nothing. Mounted once by `App`, next to `NotchRemoteOperations`, and reading the activity
 * store rather than each feature's hook: every generation already funnels through the api layer's
 * transport wrapper, so one component here covers all of them and a future feature is on the notch
 * for free.
 *
 * **Only while the window is unfocused.** The footer's busy pill is a better place to watch a run
 * the user is sitting in front of — it names the same feature and counts the same steps, without
 * covering the menu bar. This is for the case the pill cannot serve: the user fired a code review
 * and went back to their editor.
 */
export function NotchAiRuns() {
  const { t } = useTranslation('common')
  const aiEnabled = useSettingsStore((s) => s.settings.ai.enabled !== false)
  const progress = useAiActivityStore((s) => s.progress)
  const windowFocused = useWindowFocus()
  const run = useAiNotchRun()

  const model = useMemo(
    () =>
      run
        ? aiRunNotchModel({
            run,
            progress,
            ...(run.origin ? { repoName: repoNameOf(run.origin.repoPath) } : {}),
            t,
          })
        : null,
    [run, progress, t]
  )

  useNotchOperation({
    id: AI_RUN_NOTCH_ID,
    model,
    enabled: aiEnabled && !windowFocused,
    ...(run ? { route: aiRunNotchRoute(run) } : {}),
  })

  return null
}
