import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InnerTab } from '../app/pull-requests/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type FilterType = 'prs' | 'issues' | 'both'
export type FilterStatus = 'open' | 'draft' | 'approved' | 'changes_requested' | 'merged' | 'closed'

export interface SavedFilter {
  id: string
  name: string
  emoji: string
  type: FilterType
  // Criteria (all optional, combined with AND)
  titleContains?: string
  authorContains?: string
  repo?: string
  labelContains?: string
  statuses?: FilterStatus[] // empty = all statuses
  needsMyReview?: boolean // undefined = don't filter
  createdAt: number // timestamp
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface LaunchpadState {
  savedFilters: SavedFilter[]
  activeTab: InnerTab
  /** Snoozed PRs keyed by `pr.id`. Value is the wake timestamp (ms), or `null` for indefinite. An
   * entry with a past timestamp is considered woken and ignored (see `isSnoozed` in the page utils). */
  snoozed: Record<string, number | null>
  setActiveTab: (tab: InnerTab) => void
  addFilter: (filter: Omit<SavedFilter, 'id' | 'createdAt'>) => void
  updateFilter: (id: string, patch: Partial<Omit<SavedFilter, 'id' | 'createdAt'>>) => void
  deleteFilter: (id: string) => void
  reorderFilters: (from: number, to: number) => void
  snoozePr: (id: string, until: number | null) => void
  unsnoozePr: (id: string) => void
}

export const useLaunchpadStore = create<LaunchpadState>()(
  persist(
    (set) => ({
      savedFilters: [
        // Seed with a couple of example filters
        {
          id: 'preset-needs-review',
          name: 'Needs My Review',
          emoji: '👀',
          type: 'prs',
          needsMyReview: true,
          statuses: ['open'],
          createdAt: Date.now(),
        },
        {
          id: 'preset-bugs',
          name: 'Bugs',
          emoji: '🐛',
          type: 'both',
          labelContains: 'bug',
          createdAt: Date.now(),
        },
      ],
      activeTab: 'prs',
      snoozed: {},
      setActiveTab: (activeTab) => set({ activeTab }),

      snoozePr: (id, until) =>
        set((state) => ({ snoozed: { ...state.snoozed, [id]: until } })),

      unsnoozePr: (id) =>
        set((state) => {
          const next = { ...state.snoozed }
          delete next[id]
          return { snoozed: next }
        }),

      addFilter: (filter) =>
        set((state) => ({
          savedFilters: [
            ...state.savedFilters,
            { ...filter, id: `filter-${Date.now()}`, createdAt: Date.now() },
          ],
        })),

      updateFilter: (id, patch) =>
        set((state) => ({
          savedFilters: state.savedFilters.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),

      deleteFilter: (id) =>
        set((state) => ({
          savedFilters: state.savedFilters.filter((f) => f.id !== id),
        })),

      reorderFilters: (from, to) =>
        set((state) => {
          const arr = [...state.savedFilters]
          const [moved] = arr.splice(from, 1)
          arr.splice(to, 0, moved)
          return { savedFilters: arr }
        }),
    }),
    { name: 'git-manager-launchpad' }
  )
)
