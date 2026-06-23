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

interface ReposState {
  savedRepos: SavedRepo[]
  openTabs: string[]       // paths des repos ouverts en onglet
  activeRepo: string | null
  activeTab: string        // 'dashboard' | 'pull-requests' | <repoPath>
  repoCache: Record<string, GitRepo>

  addRepo: (repo: GitRepo) => void
  removeRepo: (path: string) => void
  setActiveRepo: (path: string | null) => void
  setActiveTab: (id: string) => void
  openTab: (path: string) => void
  closeTab: (path: string) => void
  reorderTabs: (from: number, to: number) => void
  setRepoCache: (path: string, repo: GitRepo) => void
  togglePin: (path: string) => void
}

export const useReposStore = create<ReposState>()(
  persist(
    (set) => ({
      savedRepos: [],
      openTabs: [],
      activeRepo: null,
      activeTab: DASHBOARD_TAB,
      repoCache: {},

      addRepo: (repo) =>
        set((state) => {
          const exists = state.savedRepos.some((r) => r.path === repo.path)
          if (exists) return state
          return {
            savedRepos: [...state.savedRepos, { path: repo.path, name: repo.name, pinned: false }],
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
        set({ activeRepo: path, activeTab: path ?? DASHBOARD_TAB }),

      setActiveTab: (id) =>
        set((state) => ({
          activeTab: id,
          activeRepo: state.openTabs.includes(id) ? id : null,
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
    }),
    {
      name: 'git-manager-repos',
      // Ne pas persister le cache des repos (données volatiles)
      partialize: (state) => ({
        savedRepos: state.savedRepos,
        openTabs: state.openTabs,
        activeRepo: state.activeRepo,
        activeTab: state.activeTab,
      }),
    }
  )
)
