import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MockPR, PRStatus, ReviewStatus, CiStatus } from '../app/pull-requests/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppNotification {
  id: number
  type:
    | 'pr_merged'
    | 'pr_closed'
    | 'pr_queued'
    | 'review_requested'
    | 'review_status_changed'
    | 'new_pr'
    | 'ci_success'
    | 'ci_failed'
  repo: string
  /**
   * `owner/repo` for the PR's repository. What ties the notification back to a local clone when it
   * is clicked (see `notificationRouting.ts`) — the bare `repo` name above can't, two owners can
   * both have a `docs`. Optional because GitHub only reports it on some payloads, and because
   * notifications persisted before this field existed are still in `localStorage`.
   */
  fullName?: string
  prNumber: number
  prTitle: string
  prId: string
  author: string
  /**
   * The author's avatar URL, carried so the tray popover can show a face rather than initials.
   * Optional on the same grounds as `fullName`: GitHub doesn't always report one, and
   * notifications persisted before this field existed are still in `localStorage` — every
   * consumer must have an initials fallback (`Avatar`'s `fallback` prop).
   */
  authorAvatar?: string
  reviewStatus?: ReviewStatus
  url?: string
  createdAt: number
  read: boolean
  targetTab: 'prs' | 'waiting' | 'issues'
}

/**
 * The per-PR state the watcher diffs one poll against the next — one field per lifecycle step a
 * notification can be raised on. Lives here (next to the notifications it feeds) so the store and
 * `lib/notifications/notificationRegistry.ts` share one shape instead of restating it.
 */
export interface PreviousPRSnapshot {
  status: PRStatus
  reviewStatus: ReviewStatus
  needsMyReview: boolean
  ciStatus?: CiStatus
  /** Auto-merge armed — the "queued to merge" step between a green PR and a merged one. */
  autoMerge?: boolean
  updatedAt: string
}

interface NotificationState {
  notifications: AppNotification[]
  previousPRs: Record<string, PreviousPRSnapshot>
  hasSessionInitialized: boolean
  /**
   * The invented pull requests the debug menu mutates, when a development build has loaded them.
   *
   * Always empty in a release build: the fixtures are behind a dynamic import that only a build
   * which could use them carries at all (`lib/devFixtures.ts`), so nothing here names the fixture
   * module and nothing pulls it into the bundle.
   */
  mockPRs: MockPR[]

  // Actions
  addNotification: (
    notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>
  ) => AppNotification
  markAsRead: (id: number) => void
  markAllAsRead: () => void
  clearNotifications: () => void

  // Watcher Actions
  setPreviousPRs: (prs: Record<string, PreviousPRSnapshot>) => void
  setSessionInitialized: (val: boolean) => void

  // Simulation Actions
  /** Seeds the fixtures once a development build has loaded them; see `devFixtures.store.ts`. */
  setMockPRs: (prs: MockPR[]) => void
  simulateChange: (prId: string, actionType: SimulatedChange) => void
}

export type SimulatedChange =
  'merge' | 'close' | 'queue' | 'request_review' | 'approve' | 'new_pr' | 'ci_success' | 'ci_failed'

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      previousPRs: {},
      hasSessionInitialized: false,
      // Empty until a development build loads the fixtures into it. `loadDevFixtures()` hands over
      // per-item copies rather than the shared array, because `simulateChange` below mutates what
      // it is given.
      mockPRs: [],

      addNotification: (notification) => {
        const newNotif: AppNotification = {
          ...notification,
          id: Math.floor(Math.random() * 1000000000),
          createdAt: Date.now(),
          read: false,
        }

        set((state) => ({
          notifications: [newNotif, ...state.notifications].slice(0, 50), // keep last 50
        }))

        return newNotif
      },

      markAsRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),

      markAllAsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        })),

      clearNotifications: () =>
        set({
          notifications: [],
        }),

      setPreviousPRs: (previousPRs) => set({ previousPRs }),

      setSessionInitialized: (hasSessionInitialized) => set({ hasSessionInitialized }),

      setMockPRs: (mockPRs) => set({ mockPRs }),

      simulateChange: (prId, actionType) => {
        const { mockPRs } = get()
        let updatedPRs = [...mockPRs]

        if (actionType === 'new_pr') {
          // Cloned from a fixture already in the list rather than written out here. A second
          // hardcoded pull request in this file would be the one piece of invented data left in a
          // release bundle, and it would have to be kept plausible by hand as `MockPR` grows.
          // Nothing to clone means a build with no fixtures, where the debug menu that calls this
          // does not exist either.
          const template = updatedPRs[0]
          if (!template) return

          const newNum = Math.floor(Math.random() * 500) + 300
          const newPr: MockPR = {
            ...template,
            id: `pr-sim-${Date.now()}`,
            number: newNum,
            title: `feat: Simulating new feature implementation #${newNum}`,
            url: `${template.repoUrl}/pull/${newNum}`,
            status: 'open',
            ciStatus: 'running',
            reviewStatus: 'pending',
            isDraft: false,
            needsMyReview: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            comments: 0,
          }
          updatedPRs = [newPr, ...updatedPRs]
        } else {
          updatedPRs = updatedPRs.map((pr) => {
            if (pr.id !== prId) return pr

            const updated = { ...pr, updatedAt: new Date() }
            if (actionType === 'merge') {
              updated.status = 'merged'
            } else if (actionType === 'close') {
              updated.status = 'closed'
            } else if (actionType === 'queue') {
              updated.autoMerge = true
            } else if (actionType === 'request_review') {
              updated.needsMyReview = true
            } else if (actionType === 'approve') {
              updated.reviewStatus = 'approved'
              updated.status = 'approved'
            } else if (actionType === 'ci_success') {
              updated.ciStatus = 'success'
            } else if (actionType === 'ci_failed') {
              updated.ciStatus = 'failure'
            }
            return updated
          })
        }

        set({ mockPRs: updatedPRs })
      },
    }),
    {
      name: 'git-manager-notifications',
      partialize: (state) => ({
        notifications: state.notifications,
        previousPRs: state.previousPRs,
      }),
    }
  )
)
