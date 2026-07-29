import { useEffect } from 'react'
import { useGitHubData } from './useGitHubData'
import { useNotificationStore, type AppNotification } from '../stores/notification.store'
import { useSettingsStore } from '../stores/settings.store'
import { useTranslation } from '@git-manager/i18n'
import { getNotificationText } from '../components/notification/utils'
import {
  NOTIFICATION_TYPES,
  getNotificationTypeDef,
  isNotificationTypeEnabled,
  resolveTargetTab,
} from '../lib/notifications/notificationRegistry'
import { buildPRSnapshotMap, snapshotMapsEqual } from '../lib/notifications/prSnapshots'
import { buildNotificationRoute } from '../lib/notifications/notificationRoute'
import { routeNotification } from '../lib/notifications/notificationRouting'
import { apiSendNativeNotification, apiOnNotificationActivated } from '../api/notification.api'
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
  const { title, message } = getNotificationText(notif, t)
  const settings = useSettingsStore.getState().settings
  const soundEnabled = settings.notifications?.enableSound ?? false
  const soundName = settings.notifications?.soundName ?? 'default'
  const prefix = getNotificationTypeDef(notif.type)?.nativePrefix ?? 'ℹ️ '

  await apiSendNativeNotification({
    title: `${prefix}${title}`,
    body: message,
    ...(soundEnabled ? { sound: soundName } : {}),
    route: buildNotificationRoute(notif),
  })
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
          url: pr.url,
          targetTab: resolveTargetTab(def, pr),
          ...(def.reviewStatus ? { reviewStatus: def.reviewStatus(pr) } : {}),
        })
        showNativeNotification(newNotif, t)
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
