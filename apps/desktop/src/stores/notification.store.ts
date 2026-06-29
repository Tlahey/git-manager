import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MockPR, PRStatus, ReviewStatus, CiStatus } from '../app/pull-requests/types'
import { MOCK_PRS } from '../app/pull-requests/mockData'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppNotification {
  id: number
  type: 'pr_merged' | 'pr_closed' | 'review_requested' | 'review_status_changed' | 'new_pr' | 'ci_success' | 'ci_failed'
  repo: string
  prNumber: number
  prTitle: string
  prId: string
  author: string
  reviewStatus?: ReviewStatus
  url?: string
  createdAt: number
  read: boolean
  targetTab: 'prs' | 'waiting' | 'issues'
}

interface NotificationState {
  notifications: AppNotification[]
  previousPRs: Record<string, { status: PRStatus; reviewStatus: ReviewStatus; needsMyReview: boolean; ciStatus?: CiStatus; updatedAt: string }>
  hasSessionInitialized: boolean
  mockPRs: MockPR[] // For simulation when offline/no GitHub token
  
  // Actions
  addNotification: (notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => AppNotification
  markAsRead: (id: number) => void
  markAllAsRead: () => void
  clearNotifications: () => void
  
  // Watcher Actions
  setPreviousPRs: (prs: Record<string, { status: PRStatus; reviewStatus: ReviewStatus; needsMyReview: boolean; ciStatus?: CiStatus; updatedAt: string }>) => void
  setSessionInitialized: (val: boolean) => void
  
  // Simulation Actions
  simulateChange: (prId: string, actionType: 'merge' | 'close' | 'request_review' | 'approve' | 'new_pr' | 'ci_success' | 'ci_failed') => void
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      previousPRs: {},
      hasSessionInitialized: false,
      mockPRs: JSON.parse(JSON.stringify(MOCK_PRS)), // Deep copy of seed data

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
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
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

      simulateChange: (prId, actionType) => {
        const { mockPRs } = get()
        let updatedPRs = [...mockPRs]

        if (actionType === 'new_pr') {
          const newNum = Math.floor(Math.random() * 500) + 300
          const newPr: MockPR = {
            id: `pr-sim-${Date.now()}`,
            number: newNum,
            title: `feat: Simulating new feature implementation #${newNum}`,
            repo: 'git-manager',
            repoUrl: 'https://github.com/Tlahey/git-manager',
            url: `https://github.com/Tlahey/git-manager/pull/${newNum}`,
            status: 'open',
            ciStatus: 'running',
            author: 'jane_dev',
            authorAvatar: 'https://avatars.githubusercontent.com/u/3?v=4',
            collaborators: [],
            filesChanged: 3,
            additions: 124,
            deletions: 12,
            createdAt: new Date(),
            updatedAt: new Date(),
            reviewStatus: 'pending',
            isDraft: false,
            needsMyReview: true,
            labels: ['feature'],
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
