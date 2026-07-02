import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GitRepo } from '@git-manager/git-types'
import { useRepoUIStore } from './repoUI.store'

interface SavedRepo {
  path: string
  name: string
  pinned: boolean
}

interface DiscoveredRepo {
  path: string
  name: string
}

interface RepoDataState {
  savedRepos: SavedRepo[]
  repoCache: Record<string, GitRepo>
  discoveredRepos: DiscoveredRepo[]
  wipMessages: Record<string, string>
  setWipMessage: (path: string, message: string) => void
  hiddenStashes: Record<string, string[]>
  toggleStashVisibility: (repoPath: string, oid: string) => void

  addRepo: (repo: GitRepo) => void
  removeRepo: (path: string) => void
  setRepoCache: (path: string, repo: GitRepo) => void
  togglePin: (path: string) => void
  addDiscoveredRepo: (path: string, name: string) => void
  removeDiscoveredRepo: (path: string) => void
}

export const useRepoDataStore = create<RepoDataState>()(
  persist(
    (set) => ({
      savedRepos: [],
      repoCache: {},
      discoveredRepos: [],
      wipMessages: {},
      hiddenStashes: {},

      toggleStashVisibility: (repoPath, oid) =>
        set((state) => {
          const current = state.hiddenStashes[repoPath] || []
          const next = current.includes(oid)
            ? current.filter((x) => x !== oid)
            : [...current, oid]
          return {
            hiddenStashes: { ...state.hiddenStashes, [repoPath]: next },
          }
        }),

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

      removeRepo: (path) => {
        // Cross-store side effect: clear any tab/selection UI state pointing at this repo.
        useRepoUIStore.getState().clearTabStateForRemovedRepo(path)
        set((state) => ({
          savedRepos: state.savedRepos.filter((r) => r.path !== path),
        }))
      },

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

      setWipMessage: (path, message) =>
        set((state) => ({
          wipMessages: { ...state.wipMessages, [path]: message },
        })),
    }),
    {
      name: 'git-manager-repos',
      // Ne pas persister le cache des repos (données volatiles)
      partialize: (state) => ({
        savedRepos: state.savedRepos,
        discoveredRepos: state.discoveredRepos || [],
        wipMessages: state.wipMessages || {},
        hiddenStashes: state.hiddenStashes || {},
      }),
    }
  )
)
