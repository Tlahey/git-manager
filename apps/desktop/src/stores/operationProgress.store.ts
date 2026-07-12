import { create } from 'zustand'

/**
 * Long-running backend operations currently in flight (per repo), driven by
 * Tauri progress events (e.g. `rebase-progress`). The launchpad-style
 * `OperationProgressBar` renders a shimmer strip while any operation runs.
 * Client-side UI state only — nothing here is persisted.
 */

export type OperationKind = 'rebase'

interface OperationProgressState {
  /** repoPath → running operation kind. */
  running: Record<string, OperationKind>
  start: (repoPath: string, kind: OperationKind) => void
  clear: (repoPath: string) => void
}

export const useOperationProgressStore = create<OperationProgressState>((set) => ({
  running: {},
  start: (repoPath, kind) => set((state) => ({ running: { ...state.running, [repoPath]: kind } })),
  clear: (repoPath) =>
    set((state) => {
      const next = { ...state.running }
      delete next[repoPath]
      return { running: next }
    }),
}))
