import { useMemo } from 'react'
import { useTranslation } from '@git-manager/i18n'
import {
  aiRunNotchModel,
  aiRunNotchRoute,
  AI_RUN_NOTCH_ID,
} from '../../lib/notifications/aiRunNotch'
import { repoNameOf } from '../../lib/notifications/remoteNotch'
import { useAiActivityStore } from '../../stores/aiActivity.store'
import { useSettingsStore } from '../../stores/settings.store'
import { useAiNotchRun } from '../../hooks/useAiNotchRun'
import { useNotchOperation } from '../../hooks/useNotchOperation'

/**
 * Puts the model's work on the notch — above all the file-by-file read every two-phase feature does
 * before it can answer anything.
 *
 * Renders nothing. Mounted once by `App`, next to `NotchRemoteOperations`, and reading the activity
 * store rather than each feature's hook: every generation already funnels through the api layer's
 * transport wrapper, so one component here covers all of them and a future feature is on the notch
 * for free.
 *
 * Shows regardless of window focus — unlike the transfer cards, this duplicates the footer's busy
 * pill on purpose rather than by omission: the pill is easy to miss if it isn't already what you're
 * looking at, and the close button is right there for anyone who doesn't want the extra card.
 */
export function NotchAiRuns() {
  const { t } = useTranslation('common')
  const aiEnabled = useSettingsStore((s) => s.settings.ai.enabled !== false)
  const progress = useAiActivityStore((s) => s.progress)
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
    enabled: aiEnabled,
    ...(run ? { route: aiRunNotchRoute(run) } : {}),
  })

  return null
}
