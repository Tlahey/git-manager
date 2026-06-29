import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GitRepo } from '@git-manager/git-types'

/** Identifiants des onglets spéciaux (toujours présents, non fermables). */
export const DASHBOARD_TAB = 'dashboard'
export const PULL_REQUESTS_TAB = 'pull-requests'

interface SavedRepo {
  path: string
  name: string
  pinned: boolean
}

interface DiscoveredRepo {
  path: string
  name: string
}

interface ReposState {
  savedRepos: SavedRepo[]
  openTabs: string[]       // paths des repos ouverts en onglet
  activeRepo: string | null
  activeTab: string        // 'dashboard' | 'pull-requests' | <repoPath>
  repoCache: Record<string, GitRepo>
  discoveredRepos: DiscoveredRepo[]
  activeDiffFile: { path: string; staged: boolean; oid?: string } | null
  setActiveDiffFile: (file: { path: string; staged: boolean; oid?: string } | null) => void
  activeLeftPanel: 'sidebar' | 'blame' | 'history'
  setActiveLeftPanel: (panel: 'sidebar' | 'blame' | 'history') => void

  addRepo: (repo: GitRepo) => void
  removeRepo: (path: string) => void
  setActiveRepo: (path: string | null) => void
  setActiveTab: (id: string) => void
  openTab: (path: string) => void
  closeTab: (path: string) => void
  reorderTabs: (from: number, to: number) => void
  setRepoCache: (path: string, repo: GitRepo) => void
  togglePin: (path: string) => void
  addDiscoveredRepo: (path: string, name: string) => void
  removeDiscoveredRepo: (path: string) => void
}

export const useReposStore = create<ReposState>()(
  persist(
    (set) => ({
      savedRepos: [],
      openTabs: [],
      activeRepo: null,
      activeTab: DASHBOARD_TAB,
      repoCache: {},
      discoveredRepos: [],
      activeDiffFile: null,
      activeLeftPanel: 'sidebar',

      setActiveDiffFile: (file) =>
        set((state) => {
          const nextPanel = file ? state.activeLeftPanel : 'sidebar'
          return { activeDiffFile: file, activeLeftPanel: nextPanel }
        }),

      setActiveLeftPanel: (panel) =>
        set({ activeLeftPanel: panel }),

      addRepo: (repo) =>
        set((state) => {
          const exists = state.savedRepos.some((r) => r.path === repo.path)
          const discovered = state.discoveredRepos || []
          const discoveredExists = discovered.some((r) => r.path === repo.path)
          return {
            savedRepos: exists
              ? state.savedRepos
              : [...state.savedRepos, { path: repo.path, name: repo.name, pinned: false }],
            discoveredRepos: discoveredExists
              ? discovered
              : [...discovered, { path: repo.path, name: repo.name }],
          }
        }),

      removeRepo: (path) =>
        set((state) => {
          const wasActive = state.activeTab === path
          return {
            savedRepos: state.savedRepos.filter((r) => r.path !== path),
            openTabs: state.openTabs.filter((p) => p !== path),
            activeRepo: state.activeRepo === path ? null : state.activeRepo,
            activeTab: wasActive ? DASHBOARD_TAB : state.activeTab,
          }
        }),

      setActiveRepo: (path) =>
        set({
          activeRepo: path,
          activeTab: path ?? DASHBOARD_TAB,
          activeDiffFile: null,
          activeLeftPanel: 'sidebar',
        }),

      setActiveTab: (id) =>
        set((state) => ({
          activeTab: id,
          activeRepo: state.openTabs.includes(id) ? id : null,
          activeDiffFile: null,
          activeLeftPanel: 'sidebar',
        })),

      openTab: (path) =>
        set((state) => ({
          openTabs: state.openTabs.includes(path) ? state.openTabs : [...state.openTabs, path],
          activeRepo: path,
          activeTab: path,
        })),

      closeTab: (path) =>
        set((state) => {
          const newTabs = state.openTabs.filter((p) => p !== path)
          const wasActive = state.activeTab === path
          const fallback = newTabs[newTabs.length - 1] ?? DASHBOARD_TAB
          return {
            openTabs: newTabs,
            activeRepo: wasActive
              ? (newTabs.includes(fallback) ? fallback : null)
              : state.activeRepo,
            activeTab: wasActive ? fallback : state.activeTab,
          }
        }),

      reorderTabs: (from, to) =>
        set((state) => {
          if (from === to || from < 0 || to < 0) return state
          const tabs = [...state.openTabs]
          if (from >= tabs.length || to >= tabs.length) return state
          const [moved] = tabs.splice(from, 1)
          tabs.splice(to, 0, moved)
          return { openTabs: tabs }
        }),

      setRepoCache: (path, repo) =>
        set((state) => ({ repoCache: { ...state.repoCache, [path]: repo } })),

      togglePin: (path) =>
        set((state) => ({
          savedRepos: state.savedRepos.map((r) =>
            r.path === path ? { ...r, pinned: !r.pinned } : r
          ),
        })),

      addDiscoveredRepo: (path, name) =>
        set((state) => {
          const discovered = state.discoveredRepos || []
          const exists = discovered.some((r) => r.path === path)
          if (exists) return state
          return {
            discoveredRepos: [...discovered, { path, name }],
          }
        }),

      removeDiscoveredRepo: (path) =>
        set((state) => ({
          discoveredRepos: (state.discoveredRepos || []).filter((r) => r.path !== path),
        })),
    }),
    {
      name: 'git-manager-repos',
      // Ne pas persister le cache des repos (données volatiles)
      partialize: (state) => ({
        savedRepos: state.savedRepos,
        openTabs: state.openTabs,
        activeRepo: state.activeRepo,
        activeTab: state.activeTab,
        discoveredRepos: state.discoveredRepos || [],
      }),
    }
  )
)
