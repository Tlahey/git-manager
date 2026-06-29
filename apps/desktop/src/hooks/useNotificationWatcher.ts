import { useEffect } from 'react'
import { useGitHubData } from './useGitHubData'
import { useNotificationStore, type AppNotification } from '../stores/notification.store'
import { useSettingsStore } from '../stores/settings.store'
import { useTranslation } from '@git-manager/i18n'
import { getNotificationText } from '../components/notification/utils'
import { useReposStore, PULL_REQUESTS_TAB } from '../stores/repos.store'
import { useLaunchpadStore } from '../stores/launchpad.store'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  onAction,
} from '@tauri-apps/plugin-notification'

export async function showNativeNotification(notif: AppNotification, t: any) {
  try {
    let permissionGranted = await isPermissionGranted()
    if (!permissionGranted) {
      const permission = await requestPermission()
      permissionGranted = permission === 'granted'
    }

    if (permissionGranted) {
      const { title, message } = getNotificationText(notif, t)
      sendNotification({
        id: notif.id,
        title,
        body: message,
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
  const notifyOnNewPr = settings.notifications?.notifyOnNewPr ?? true
  const notifyOnPrMerged = settings.notifications?.notifyOnPrMerged ?? true
  const notifyOnReviewRequested = settings.notifications?.notifyOnReviewRequested ?? true
  const notifyOnReviewStatusChanged = settings.notifications?.notifyOnReviewStatusChanged ?? true

  const {
    previousPRs,
    hasSessionInitialized,
    setSessionInitialized,
    setPreviousPRs,
    addNotification,
  } = useNotificationStore()

  // Setup click action listener and bring window to focus, and request permission on mount
  useEffect(() => {
    let unsub: any

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
        unsub = await onAction((event: any) => {
          window.focus()
          const notifId = event?.notification?.id
          if (notifId) {
            const notif = useNotificationStore.getState().notifications.find((n) => n.id === notifId)
            if (notif) {
              useReposStore.getState().setActiveTab(PULL_REQUESTS_TAB)
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
        unsub()
      }
    }
  }, [notificationsEnabled])

  useEffect(() => {
    // Only monitor changes when data is loaded, and there is no pending load or we have items
    if (loading || prs.length === 0) return

    // Build map of current PR states
    const currentPRsMap: Record<string, { status: typeof prs[0]['status']; reviewStatus: typeof prs[0]['reviewStatus']; needsMyReview: boolean; updatedAt: string }> = {}
    for (const pr of prs) {
      currentPRsMap[pr.id] = {
        status: pr.status,
        reviewStatus: pr.reviewStatus,
        needsMyReview: !!pr.needsMyReview,
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

    // Compare new states with the previous baseline
    for (const pr of prs) {
      const prev = previousPRs[pr.id]

      if (!prev) {
        // A new PR appeared
        if (notificationsEnabled && notifyOnNewPr) {
          const newNotif = addNotification({
            type: 'new_pr',
            repo: pr.repo,
            prNumber: pr.number,
            prTitle: pr.title,
            prId: pr.id,
            author: pr.author,
            url: pr.url,
            targetTab: pr.needsMyReview ? 'waiting' : 'prs',
          })
          showNativeNotification(newNotif, t)
          hasUpdates = true
        }
      } else {
        // Check if state changed
        let shouldNotifyThisPR = false

        if (pr.status !== prev.status) {
          if (pr.status === 'merged') {
            if (notificationsEnabled && notifyOnPrMerged) {
              const newNotif = addNotification({
                type: 'pr_merged',
                repo: pr.repo,
                prNumber: pr.number,
                prTitle: pr.title,
                prId: pr.id,
                author: pr.author,
                url: pr.url,
                targetTab: 'prs',
              })
              showNativeNotification(newNotif, t)
              shouldNotifyThisPR = true
            }
          } else if (pr.status === 'closed') {
            if (notificationsEnabled && notifyOnPrMerged) {
              const newNotif = addNotification({
                type: 'pr_closed',
                repo: pr.repo,
                prNumber: pr.number,
                prTitle: pr.title,
                prId: pr.id,
                author: pr.author,
                url: pr.url,
                targetTab: 'prs',
              })
              showNativeNotification(newNotif, t)
              shouldNotifyThisPR = true
            }
          }
        }

        // Check if needsMyReview changed
        if (pr.needsMyReview && !prev.needsMyReview) {
          if (notificationsEnabled && notifyOnReviewRequested) {
            const newNotif = addNotification({
              type: 'review_requested',
              repo: pr.repo,
              prNumber: pr.number,
              prTitle: pr.title,
              prId: pr.id,
              author: pr.author,
              url: pr.url,
              targetTab: 'waiting',
            })
            showNativeNotification(newNotif, t)
            shouldNotifyThisPR = true
          }
        }

        // Check if reviewStatus changed (approved / changes_requested)
        if (
          pr.reviewStatus !== prev.reviewStatus &&
          pr.reviewStatus !== 'pending' &&
          (pr.reviewStatus === 'approved' || pr.reviewStatus === 'changes_requested')
        ) {
          if (notificationsEnabled && notifyOnReviewStatusChanged) {
            const newNotif = addNotification({
              type: 'review_status_changed',
              repo: pr.repo,
              prNumber: pr.number,
              prTitle: pr.title,
              prId: pr.id,
              author: pr.author,
              reviewStatus: pr.reviewStatus,
              url: pr.url,
              targetTab: 'prs',
            })
            showNativeNotification(newNotif, t)
            shouldNotifyThisPR = true
          }
        }

        if (shouldNotifyThisPR) {
          hasUpdates = true
        }
      }
    }

    // Update baseline if changes happened or item counts differ
    const keysCountMatch = Object.keys(previousPRs).length === prs.length
    if (hasUpdates || !keysCountMatch) {
      setPreviousPRs(currentPRsMap)
    }
  }, [prs, loading, hasSessionInitialized, previousPRs, notificationsEnabled, soundEnabled, notifyOnNewPr, notifyOnPrMerged, notifyOnReviewRequested, notifyOnReviewStatusChanged, t])
}
