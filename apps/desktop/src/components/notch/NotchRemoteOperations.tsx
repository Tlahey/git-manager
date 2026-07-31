import { useEffect } from 'react'
import { useTranslation } from '@git-manager/i18n'
import type { NotificationSettings } from '@git-manager/git-types'
import type { RemoteOperation } from '../../lib/tauri'
import {
  remoteOutcomeNotchModel,
  remoteProgressNotchModel,
} from '../../lib/notifications/remoteNotch'
import { useNotchOperation } from '../../hooks/useNotchOperation'
import { useNotchQueueStore } from '../../stores/notchQueue.store'
import {
  remoteOperationKey,
  useRemoteProgressStore,
  type RemoteOperationEntry,
} from '../../stores/remoteProgress.store'
import { useSettingsStore } from '../../stores/settings.store'

/**
 * Puts the fetches, pulls and pushes in flight on the notch.
 *
 * Renders nothing — it exists to hold one `useNotchOperation` per running transfer, which is a
 * thing a hook alone cannot do (the number of them changes, and hooks can't be called in a loop).
 * A component per operation is the shape that works, and it is the pattern the remaining notch
 * producers will follow.
 *
 * Mounted once by `App`, next to the queue controller.
 */

/** Which setting gates each operation. These three toggles have existed in Settings since the
 *  beginning and, until now, were read by nothing at all. */
const SETTING_FOR: Record<RemoteOperation, keyof NotificationSettings> = {
  fetch: 'notifyOnFetch',
  pull: 'notifyOnPull',
  push: 'notifyOnPush',
}

function isOperationEnabled(
  operation: RemoteOperation,
  notifications: NotificationSettings | undefined
): boolean {
  if (!(notifications?.enabled ?? true)) return false
  return (notifications?.[SETTING_FOR[operation]] as boolean | undefined) ?? true
}

export function NotchRemoteOperations() {
  const operations = useRemoteProgressStore((s) => s.operations)
  const notifications = useSettingsStore((s) => s.settings.notifications)

  return (
    <>
      {Object.entries(operations).map(([key, entry]) => (
        <RemoteOperationCard
          key={key}
          entryKey={key}
          entry={entry}
          enabled={isOperationEnabled(entry.operation, notifications)}
        />
      ))}
    </>
  )
}

/**
 * One transfer's presence on the notch, from first byte to outcome.
 *
 * The live card and the card it leaves behind are handled differently on purpose. The live one is
 * tied to the operation and disappears with it, which is what `useNotchOperation` is for. The
 * outcome is an ordinary one-shot notification: it is enqueued once and then owns its own life,
 * so it can outlive the operation that produced it (and this component) rather than vanishing the
 * instant the store entry is cleaned up.
 */
function RemoteOperationCard({
  entryKey,
  entry,
  enabled,
}: {
  entryKey: string
  entry: RemoteOperationEntry
  enabled: boolean
}) {
  const { t } = useTranslation('git')
  const clear = useRemoteProgressStore((s) => s.clear)

  useNotchOperation({
    id: remoteOperationKey(entry.repoPath, entry.operation),
    model: remoteProgressNotchModel({ entry, t }),
    // A scheduled fetch gets no live card. It runs every minute and again on every focus change, so
    // this is the difference between a notch that reports the user's transfers and one that blinks
    // each time they alt-tab back into the app. Its outcome still goes through, below.
    enabled: enabled && !entry.background,
  })

  useEffect(() => {
    if (!entry.outcome) return

    if (enabled) {
      const model = remoteOutcomeNotchModel({ entry, t })
      // `null` is a real answer here: a fetch that moved no ref has nothing to say, and this app
      // fetches on a timer — announcing every no-op would teach the user to ignore the notch.
      if (model) {
        useNotchQueueStore.getState().enqueue({
          model,
          // A failed push is worth a banner if the notch can't be shown; a successful one is not
          // worth an entry in Notification Centre.
          importance: entry.outcome.kind === 'error' ? 'key' : 'ambient',
        })
      }
    }

    // The operation is over either way — the entry is bookkeeping, and leaving it would keep the
    // live card's slot occupied for good.
    clear(entryKey)
  }, [entry, entryKey, enabled, clear, t])

  return null
}
