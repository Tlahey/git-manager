import { useTranslation } from '@git-manager/i18n'
import { runningHookNotchModel } from '../../lib/notifications/hookNotch'
import { useNotchOperation } from '../../hooks/useNotchOperation'
import { useHookProgressStore, type RunningHook } from '../../stores/hookProgress.store'
import { useSettingsStore } from '../../stores/settings.store'
import { repoNameOf } from '../../lib/notifications/remoteNotch'

/**
 * Puts the repository hook currently running on the notch.
 *
 * Renders nothing — it exists to hold one `useNotchOperation` per running hook, which a hook alone
 * cannot do (the number of them changes, and hooks can't be called in a loop). Same shape as
 * `NotchRemoteOperations`, for the same reason.
 *
 * Mounted once by `App`.
 */
export function NotchRunningHooks() {
  const running = useHookProgressStore((s) => s.running)
  const notifications = useSettingsStore((s) => s.settings.notifications)
  const enabled = notifications?.enabled ?? true

  return (
    <>
      {Object.entries(running).map(([repoPath, hook]) => (
        <RunningHookCard key={repoPath} hook={hook} enabled={enabled} />
      ))}
    </>
  )
}

/**
 * One hook's presence on the notch, for as long as it runs.
 *
 * There is no outcome card here, unlike a transfer: a hook that *refused* is already reported —
 * with its output, which is the part worth reading — by `raiseHookFailureCard` on the error path,
 * and a hook that passed has nothing to say. This card's whole job is the wait in between.
 */
function RunningHookCard({ hook, enabled }: { hook: RunningHook; enabled: boolean }) {
  const { t } = useTranslation('git')

  useNotchOperation({
    id: `hook-running:${hook.repoPath}:${hook.name}`,
    model: runningHookNotchModel(hook.name, repoNameOf(hook.repoPath), t),
    enabled,
  })

  return null
}
