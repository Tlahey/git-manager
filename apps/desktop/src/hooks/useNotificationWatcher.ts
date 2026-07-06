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
  type PreviousPRSnapshot,
} from '../lib/notifications/notificationRegistry'
import { useRepoUIStore, PULL_REQUESTS_TAB } from '../stores/repoUI.store'
import { useLaunchpadStore } from '../stores/launchpad.store'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  onAction,
  type Options as NotificationActionEvent,
} from '@tauri-apps/plugin-notification'
import type { PluginListener } from '@tauri-apps/api/core'
import type { TFunction } from '@git-manager/i18n'

export async function showNativeNotification(notif: AppNotification, t: TFunction) {
  try {
    let permissionGranted = await isPermissionGranted()
    if (!permissionGranted) {
      const permission = await requestPermission()
      permissionGranted = permission === 'granted'
    }

    if (permissionGranted) {
      const { title, message } = getNotificationText(notif, t)
      const settings = useSettingsStore.getState().settings
      const soundEnabled = settings.notifications?.enableSound ?? false
      const soundName = settings.notifications?.soundName ?? 'default'
      const prefix = getNotificationTypeDef(notif.type)?.nativePrefix ?? 'ℹ️ '

      sendNotification({
        id: notif.id,
        title: `${prefix}${title}`,
        body: message,
        ...(soundEnabled ? { sound: soundName } : {}),
      })
    }
  } catch (e) {
    console.warn('Failed to display native notification:', e)
  }
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

  // Setup click action listener and bring window to focus, and request permission on mount
  useEffect(() => {
    let unsub: PluginListener | undefined

    async function init() {
      // 1. Request permission if enabled
      if (notificationsEnabled) {
        try {
          const granted = await isPermissionGranted()
          if (!granted) {
            await requestPermission()
          }
        } catch (e) {
          console.warn('Failed to request notification permission:', e)
        }
      }

      // 2. Listen to actions/clicks
      try {
        unsub = await onAction((event: NotificationActionEvent) => {
          window.focus()
          const notifId = event?.id
          if (notifId) {
            const notif = useNotificationStore.getState().notifications.find((n) => n.id === notifId)
            if (notif) {
              useRepoUIStore.getState().setActiveTab(PULL_REQUESTS_TAB)
              useLaunchpadStore.getState().setActiveTab(notif.targetTab)
              useNotificationStore.getState().markAsRead(notif.id)
            }
          }
        })
      } catch (e) {
        console.warn('Failed to bind notification action click listener:', e)
      }
    }

    init()

    return () => {
      if (unsub) {
        unsub.unregister()
      }
    }
  }, [notificationsEnabled])

  useEffect(() => {
    // Only monitor changes when data is loaded, and there is no pending load or we have items
    if (loading || prs.length === 0) return

    // Build map of current PR states
    const currentPRsMap: Record<string, PreviousPRSnapshot> = {}
    for (const pr of prs) {
      currentPRsMap[pr.id] = {
        status: pr.status,
        reviewStatus: pr.reviewStatus,
        needsMyReview: !!pr.needsMyReview,
        ciStatus: pr.ciStatus,
        updatedAt: pr.updatedAt ? new Date(pr.updatedAt).toISOString() : '',
      }
    }

    if (!hasSessionInitialized) {
      // Establish session baseline on first successful load, without notifying
      setPreviousPRs(currentPRsMap)
      setSessionInitialized(true)
      return
    }

    let hasUpdates = false

    // Compare new states with the previous baseline against every registered notification type
    for (const pr of prs) {
      const prev = previousPRs[pr.id]
      let shouldNotifyThisPR = false

      for (const def of NOTIFICATION_TYPES) {
        if (!notificationsEnabled) break
        if (!isNotificationTypeEnabled(def, settings.notifications)) continue
        if (!def.detect(pr, prev)) continue

        const newNotif = addNotification({
          type: def.type,
          repo: pr.repo,
          prNumber: pr.number,
          prTitle: pr.title,
          prId: pr.id,
          author: pr.author,
          url: pr.url,
          targetTab: resolveTargetTab(def, pr),
          ...(def.reviewStatus ? { reviewStatus: def.reviewStatus(pr) } : {}),
        })
        showNativeNotification(newNotif, t)
        shouldNotifyThisPR = true
      }

      if (shouldNotifyThisPR) {
        hasUpdates = true
      }
    }

    // Update baseline if changes happened or item counts differ
    const keysCountMatch = Object.keys(previousPRs).length === prs.length
    if (hasUpdates || !keysCountMatch) {
      setPreviousPRs(currentPRsMap)
    }
  }, [prs, loading, hasSessionInitialized, previousPRs, notificationsEnabled, soundEnabled, settings.notifications, t, addNotification, setPreviousPRs, setSessionInitialized])
}
