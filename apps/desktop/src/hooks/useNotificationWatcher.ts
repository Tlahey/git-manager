import { useEffect } from 'react'
import { useGitHubData } from './useGitHubData'
import { useNotificationStore, type AppNotification } from '../stores/notification.store'
import { useSettingsStore } from '../stores/settings.store'
import { useTranslation } from '@git-manager/i18n'
import {
  NOTIFICATION_TYPES,
  isNotificationTypeEnabled,
  resolveTargetTab,
} from '../lib/notifications/notificationRegistry'
import { buildPRSnapshotMap, snapshotMapsEqual } from '../lib/notifications/prSnapshots'
import { routeNotification } from '../lib/notifications/notificationRouting'
import { apiSendNativeNotification, apiOnNotificationActivated } from '../api/notification.api'
import {
  nativeSpecFromNotification,
  notchRequestFromNotification,
} from '../lib/notifications/notchModel'
import { useNotchQueueStore } from '../stores/notchQueue.store'
import type { UnlistenFn } from '@tauri-apps/api/event'
import type { TFunction } from '@git-manager/i18n'

/**
 * Shows a bell notification as an OS banner, carrying the route that clicking it should follow.
 *
 * Delivery goes through our own `send_native_notification` command rather than
 * `@tauri-apps/plugin-notification`: the plugin can only *show* a notification on desktop, its
 * `onAction` listener being wired to an event only its mobile backend emits (see
 * `src-tauri/src/services/native_notification.rs`). Permission is not requested here either —
 * on desktop the plugin always reports it granted, so the check was pure ceremony.
 */
export async function showNativeNotification(notif: AppNotification, t: TFunction) {
  await apiSendNativeNotification(nativeSpecFromNotification(notif, t))
}

/**
 * Hands a bell notification to the notch queue.
 *
 * That is the whole of it now: *which* surface it ends up on — the notch, a macOS banner, or
 * nowhere at all — is decided by `useNotchQueue` when the card reaches the front, because that is
 * the one point every card passes through whatever produced it. This function used to make that
 * call itself, which meant the display-style setting only ever applied to GitHub notifications and
 * was silently bypassed by every other producer.
 *
 * The notification is enqueued rather than shown directly for the same reason: a second one
 * arriving while the first was still up used to destroy it, because the window has a fixed label.
 */
export async function notifyUser(notif: AppNotification, t: TFunction) {
  useNotchQueueStore.getState().enqueue(notchRequestFromNotification(notif, t))
}

export function useNotificationWatcher() {
  const { prs, loading } = useGitHubData()
  const settings = useSettingsStore((s) => s.settings)
  const { t } = useTranslation('common')

  const notificationsEnabled = settings.notifications?.enabled ?? true
  const soundEnabled = settings.notifications?.enableSound ?? false

  const {
    previousPRs,
    hasSessionInitialized,
    setSessionInitialized,
    setPreviousPRs,
    addNotification,
  } = useNotificationStore()

  // Follow OS-banner clicks wherever they point. Bound unconditionally, not gated on
  // `notificationsEnabled`: a banner can still be sitting in Notification Centre from before the
  // setting was turned off, and a click on it must not be dropped on the floor. Bound once for the
  // app's lifetime (the hook is mounted by `App.tsx`), so nothing here re-subscribes.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined
    let cancelled = false

    apiOnNotificationActivated((route) => void routeNotification(route))
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
      .catch((e) => console.warn('Failed to bind notification click listener:', e))

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    // Only monitor changes when data is loaded, and there is no pending load or we have items
    if (loading || prs.length === 0) return

    // Build map of current PR states
    const currentPRsMap = buildPRSnapshotMap(prs)

    if (!hasSessionInitialized) {
      // Establish session baseline on first successful load, without notifying
      setPreviousPRs(currentPRsMap)
      setSessionInitialized(true)
      return
    }

    // Compare new states with the previous baseline against every registered notification type
    for (const pr of prs) {
      const prev = previousPRs[pr.id]

      for (const def of NOTIFICATION_TYPES) {
        if (!notificationsEnabled) break
        if (!isNotificationTypeEnabled(def, settings.notifications)) continue
        if (!def.detect(pr, prev)) continue

        const newNotif = addNotification({
          type: def.type,
          repo: pr.repo,
          // Carried so a click can find the repo's local clone by its remote rather than by name.
          ...(pr.fullName ? { fullName: pr.fullName } : {}),
          prNumber: pr.number,
          prTitle: pr.title,
          prId: pr.id,
          author: pr.author,
          ...(pr.authorAvatar ? { authorAvatar: pr.authorAvatar } : {}),
          url: pr.url,
          targetTab: resolveTargetTab(def, pr),
          ...(def.reviewStatus ? { reviewStatus: def.reviewStatus(pr) } : {}),
        })
        notifyUser(newNotif, t)
      }
    }

    // Always move the baseline forward once a poll has been diffed — including for changes that
    // raised nothing (a disabled type, a suppressed one). Leaving it behind is what would replay
    // them later. Gated on a real difference so this write doesn't re-trigger its own effect.
    if (!snapshotMapsEqual(previousPRs, currentPRsMap)) {
      setPreviousPRs(currentPRsMap)
    }
  }, [
    prs,
    loading,
    hasSessionInitialized,
    previousPRs,
    notificationsEnabled,
    soundEnabled,
    settings.notifications,
    t,
    addNotification,
    setPreviousPRs,
    setSessionInitialized,
  ])
}
