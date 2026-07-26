import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GitRepo } from '@git-manager/git-types'
import { useRepoUIStore } from './repoUI.store'
import { isLinkedWorktree } from '../lib/linkedWorktree'

interface SavedRepo {
  path: string
  name: string
  pinned: boolean
}

interface DiscoveredRepo {
  path: string
  name: string
}

/** How many entries the most-recently-opened list keeps before dropping the oldest. */
const MAX_RECENT_REPOS = 20

/** Adds `repo.path` to `known` when the backend says it is a linked worktree, else leaves it be. */
function rememberIfWorktree(known: string[], repo: GitRepo): string[] {
  if (!isLinkedWorktree(repo) || known.includes(repo.path)) return known
  return [...known, repo.path]
}

interface RepoDataState {
  savedRepos: SavedRepo[]
  repoCache: Record<string, GitRepo>
  discoveredRepos: DiscoveredRepo[]
  /**
   * Repo paths ordered most-recently-opened first, capped at `MAX_RECENT_REPOS`. Fed by
   * `markRepoOpened` (see the `useOpenRepoTab` hook, which every "open this repo in a tab" entry
   * point goes through) and read by the New Tab page's recent list.
   */
  recentRepoPaths: string[]
  /**
   * Paths the backend has reported as *linked worktrees* ("workspaces") rather than repositories.
   *
   * This is persisted on purpose. The same fact is derivable from `repoCache[path].mainWorktreePath`,
   * but `repoCache` is volatile and only ever filled for the tab being viewed — while `openTabs` is
   * persisted, so after a restart a worktree tab would look exactly like a repository until the
   * user happened to click it. Recording it here as soon as it is learnt (see `addRepo` /
   * `setRepoCache`) keeps the dashboard's repository lists worktree-free across sessions.
   */
  linkedWorktreePaths: string[]
  wipMessages: Record<string, string>
  setWipMessage: (path: string, message: string) => void
  hiddenStashes: Record<string, string[]>
  toggleStashVisibility: (repoPath: string, oid: string) => void

  addRepo: (repo: GitRepo) => void
  /** Moves `path` to the front of `recentRepoPaths` (called whenever a repo is opened in a tab). */
  markRepoOpened: (path: string) => void
  /** Drops a single entry from the recency list without touching the saved repo itself. */
  forgetRecentRepo: (path: string) => void
  removeRepo: (path: string) => void
  setRepoCache: (path: string, repo: GitRepo) => void
  togglePin: (path: string) => void
  /** Sets `pinned` outright — what the dashboard's bulk favourite actions need, since a `toggle`
   * over a mixed selection would flip repos in both directions. */
  setPinned: (path: string, pinned: boolean) => void
  addDiscoveredRepo: (path: string, name: string) => void
  removeDiscoveredRepo: (path: string) => void
}

export const useRepoDataStore = create<RepoDataState>()(
  persist(
    (set) => ({
      savedRepos: [],
      repoCache: {},
      discoveredRepos: [],
      recentRepoPaths: [],
      linkedWorktreePaths: [],
      wipMessages: {},
      hiddenStashes: {},

      toggleStashVisibility: (repoPath, oid) =>
        set((state) => {
          const current = state.hiddenStashes[repoPath] || []
          const next = current.includes(oid) ? current.filter((x) => x !== oid) : [...current, oid]
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
            // Browsing to a worktree folder saves it like any other path; remember what it is so
            // the dashboard can leave it out of the repository lists.
            linkedWorktreePaths: rememberIfWorktree(state.linkedWorktreePaths || [], repo),
          }
        }),

      markRepoOpened: (path) =>
        set((state) => {
          // Only saved repositories are tracked. Linked worktrees ("workspaces") are opened as tabs
          // straight from the WIP tab without ever being saved, and they'd otherwise crowd real
          // repos out of the capped list.
          if (!state.savedRepos.some((r) => r.path === path)) return state
          return {
            recentRepoPaths: [
              path,
              ...(state.recentRepoPaths || []).filter((p) => p !== path),
            ].slice(0, MAX_RECENT_REPOS),
          }
        }),

      forgetRecentRepo: (path) =>
        set((state) => ({
          recentRepoPaths: (state.recentRepoPaths || []).filter((p) => p !== path),
        })),

      removeRepo: (path) => {
        // Cross-store side effect: clear any tab/selection UI state pointing at this repo.
        useRepoUIStore.getState().clearTabStateForRemovedRepo(path)
        set((state) => ({
          savedRepos: state.savedRepos.filter((r) => r.path !== path),
          recentRepoPaths: (state.recentRepoPaths || []).filter((p) => p !== path),
        }))
      },

      setRepoCache: (path, repo) =>
        set((state) => ({
          repoCache: { ...state.repoCache, [path]: repo },
          // The one choke point where a freshly opened worktree tab reveals its shape.
          linkedWorktreePaths: rememberIfWorktree(state.linkedWorktreePaths || [], repo),
        })),

      togglePin: (path) =>
        set((state) => ({
          savedRepos: state.savedRepos.map((r) =>
            r.path === path ? { ...r, pinned: !r.pinned } : r
          ),
        })),

      setPinned: (path, pinned) =>
        set((state) => ({
          savedRepos: state.savedRepos.map((r) => (r.path === path ? { ...r, pinned } : r)),
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
      // Don't persist the repo cache (volatile data)
      partialize: (state) => ({
        savedRepos: state.savedRepos,
        discoveredRepos: state.discoveredRepos || [],
        recentRepoPaths: state.recentRepoPaths || [],
        linkedWorktreePaths: state.linkedWorktreePaths || [],
        wipMessages: state.wipMessages || {},
        hiddenStashes: state.hiddenStashes || {},
      }),
    }
  )
)
